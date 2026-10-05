import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { CodebaseConclusion } from "@/components/codebase/codebase-conclusion";
import { ScreenConnect } from "@/components/codebase/screen-connect";
import { SyncStatus } from "@/components/codebase/sync-status";
import { HubBreadcrumb } from "@/components/home/hub-breadcrumb";
import { useCodebaseSyncStatus } from "@/hooks/use-codebase-sync-status";
import {
	type AnalysisResponse,
	analysisResponseSchema,
} from "@/lib/codebase-analysis";
import {
	CODEBASE_LIBRARY_HREF,
	CODEBASE_LIBRARY_LABEL,
	CODEBASE_ONBOARDING_LABEL,
} from "@/lib/codebase-library";
import {
	clearPlanCodebaseProjectPointer,
	clearPlanOnboardingPointers,
	readPlanCodebasePointer,
	readPlanCodebaseProjectPointer,
	storePlanCodebasePointer,
	storePlanCodebaseProjectPointer,
} from "@/lib/codebase-plan-storage";
import {
	canContinueToSync,
	isSyncStatusComplete,
	SNAPSHOT_CONTEXT_STATUSES,
	type SyncPromptPayload,
	type SyncStatusResponse,
	syncPromptPayloadSchema,
	syncStatusResponseSchema,
} from "@/lib/codebase-sync";
import { useUIStore } from "@/store";

/** Terminal create-failure heading; the body carries the safe server message. */
const CODEBASE_ONBOARDING_ERROR_TITLE = "Gagal menyiapkan repository";

export const Route = createFileRoute("/plan/codebase")({
	head: () => ({
		meta: [
			{
				title: `${CODEBASE_ONBOARDING_LABEL} | VibeEverything`,
			},
			{
				name: "description",
				content:
					"Hubungkan repository yang sudah ada untuk mendapatkan prompt CLI sync, lalu susun fitur baru di atas kode yang ada.",
			},
		],
	}),
	component: PlanCodebasePage,
});

type CreatedCodebase = {
	id: string;
	name: string;
};

export function PlanCodebasePage() {
	const navigate = useNavigate();
	const [error, setError] = useState<string | null>(null);
	const [isStarting, setIsStarting] = useState(false);
	const [codebase, setCodebase] = useState<CreatedCodebase | null>(null);
	const [payload, setPayload] = useState<SyncPromptPayload | null>(null);
	const step = useUIStore((s) => s.codebasePlanStep);
	const setStep = useUIStore((s) => s.setCodebasePlanStep);
	// Recovered status is the poller's seed, so the first paint after a refresh
	// already reflects persisted server state instead of an empty loading card.
	const [recoveredStatus, setRecoveredStatus] =
		useState<SyncStatusResponse | null>(null);
	const [sessionNonce, setSessionNonce] = useState(0);
	const autoInitAttempted = useRef(false);
	// Onboarding analysis context: one existing-codebase feature project per
	// codebase, so the initial analysis runs through the existing per-feature
	// analysis boundary (features -> analysis trigger -> analysis read) and
	// the summary can reuse the canonical CodebaseReview with real output.
	// The project id is only a pointer; authoritative state always comes from
	// GET status (analysisStatus) and GET analysis (validated output).
	const [featureProjectId, setFeatureProjectId] = useState<string | null>(null);
	const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
	const [analysisWorking, setAnalysisWorking] = useState(false);
	const [analysisError, setAnalysisError] = useState<string | null>(null);
	const analysisAttemptedFor = useRef<string | null>(null);
	// Create is a mutating POST: two overlapping calls would mint two codebases
	// and two sync sessions for one onboarding attempt. State updates are async,
	// so a ref is what actually closes the window.
	const createInFlight = useRef(false);

	// One canonical reconciliation loop for the whole onboarding flow. The
	// prompt screen needs the CLI handshake, the sync screen needs the transport
	// stages, and the conclusion screen needs the persisted analysis status — all
	// three read this single snapshot, so no two screens can disagree and no
	// second poller races this one.
	const { status: lastStatus, error: statusPollError } = useCodebaseSyncStatus({
		codebaseId: codebase?.id ?? null,
		analysisProjectId: featureProjectId,
		initialStatus: recoveredStatus,
		enabled: codebase !== null,
	});

	useEffect(() => {
		setStep("prompt");
	}, [setStep]);

	const createCodebase = useCallback(async () => {
		if (createInFlight.current) return;
		createInFlight.current = true;
		setError(null);
		setIsStarting(true);
		try {
			const response = await fetch("/api/codebases", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});
			if (response.status === 401) {
				window.location.href = `/login?redirect=${encodeURIComponent("/plan/codebase")}`;
				return;
			}
			const body: unknown = await response.json().catch(() => null);
			if (
				typeof body !== "object" ||
				body === null ||
				!("id" in body) ||
				typeof body.id !== "string"
			) {
				setError(
					typeof body === "object" &&
						body !== null &&
						"error" in body &&
						typeof body.error === "string"
						? body.error
						: "Codebase gagal dibuat. Coba lagi.",
				);
				return;
			}
			const sync =
				"sync" in body ? syncPromptPayloadSchema.safeParse(body.sync) : null;
			if (!sync?.success) {
				setError("Codebase dibuat, tetapi instruksi sync tidak valid.");
				return;
			}
			const codebaseName =
				"name" in body && typeof body.name === "string" ? body.name : null;
			if (!codebaseName) {
				setError("Codebase dibuat, tetapi nama tidak diterima. Coba lagi.");
				return;
			}
			setCodebase({
				id: body.id,
				name: codebaseName,
			});
			clearPlanCodebaseProjectPointer();
			setFeatureProjectId(null);
			setAnalysis(null);
			setAnalysisError(null);
			analysisAttemptedFor.current = null;
			setPayload(sync.data);
			// A brand new session has no server history: clear the seed so the
			// poller cannot paint the previous attempt's state onto this one.
			setRecoveredStatus(null);
			setStep("prompt");
			setSessionNonce((current) => current + 1);
		} catch {
			setError("Server tidak dapat dihubungi.");
		} finally {
			createInFlight.current = false;
			setIsStarting(false);
		}
	}, [setStep]);

	// Ensure the single onboarding analysis project for this codebase via the
	// existing features boundary. The stored pointer is reused so refresh and
	// remount never mint duplicate projects; the server still owns validation
	// (CODEBASE_NOT_SYNCED races surface as an honest error below).
	const ensureFeatureProject = useCallback(
		async (
			codebaseId: string,
			fallbackName: string,
		): Promise<string | null> => {
			const stored = readPlanCodebaseProjectPointer();
			if (stored) {
				setFeatureProjectId(stored);
				return stored;
			}
			const message =
				fallbackName.trim().length >= 3
					? fallbackName.trim()
					: "Ringkasan codebase awal";
			try {
				const response = await fetch(
					`/api/codebases/${encodeURIComponent(codebaseId)}/features`,
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ message }),
					},
				);
				if (response.status === 401) {
					window.location.href = `/login?redirect=${encodeURIComponent("/plan/codebase")}`;
					return null;
				}
				const body: unknown = await response.json().catch(() => null);
				const projectId =
					typeof body === "object" &&
					body !== null &&
					"projectId" in body &&
					typeof body.projectId === "string"
						? body.projectId
						: null;
				const serverError =
					typeof body === "object" &&
					body !== null &&
					"error" in body &&
					typeof body.error === "string"
						? body.error
						: null;
				if (!response.ok || !projectId) {
					setAnalysisError(
						serverError ?? "Konteks analisis gagal disiapkan. Coba lagi.",
					);
					return null;
				}
				storePlanCodebaseProjectPointer(projectId);
				setFeatureProjectId(projectId);
				return projectId;
			} catch {
				setAnalysisError("Server tidak dapat dihubungi.");
				return null;
			}
		},
		[],
	);

	// Run the real per-feature analysis through the existing trigger boundary.
	// The call is synchronous server-side (model thinking included) and
	// idempotent: a pending or ready row is reused, only failure mints a new
	// attempt. Credit and validation failures surface as honest errors, never
	// as fabricated output.
	const triggerOnboardingAnalysis = useCallback(
		async (projectId: string, snapshotId: string): Promise<void> => {
			setAnalysisWorking(true);
			setAnalysisError(null);
			try {
				const response = await fetch(
					`/api/v1/projects/${encodeURIComponent(projectId)}/codebase/analysis`,
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ snapshotId }),
					},
				);
				if (response.status === 401) {
					window.location.href = `/login?redirect=${encodeURIComponent("/plan/codebase")}`;
					return;
				}
				const body: unknown = await response.json().catch(() => null);
				const serverError =
					typeof body === "object" &&
					body !== null &&
					"error" in body &&
					typeof body.error === "string"
						? body.error
						: null;
				if (response.status === 403) {
					setAnalysisError(
						serverError ?? "Kredit tidak mencukupi untuk analisis codebase.",
					);
					return;
				}
				const parsed = analysisResponseSchema.safeParse(body);
				if (!response.ok || !parsed.success) {
					setAnalysisError(
						serverError ?? "Analisis codebase gagal. Coba analisis ulang.",
					);
					return;
				}
				setAnalysis(parsed.data);
			} catch {
				setAnalysisError("Server tidak dapat dihubungi.");
			} finally {
				setAnalysisWorking(false);
			}
		},
		[],
	);

	// Read the validated analysis output through the existing read boundary.
	// Returns null when no row exists yet (trigger effect owns creation).
	const fetchAnalysisOutput = useCallback(
		async (
			projectId: string,
			snapshotId: string,
		): Promise<AnalysisResponse | null> => {
			try {
				const response = await fetch(
					`/api/v1/projects/${encodeURIComponent(projectId)}/codebase/analysis?snapshotId=${encodeURIComponent(snapshotId)}`,
				);
				if (!response.ok) return null;
				const parsed = analysisResponseSchema.safeParse(
					await response.json().catch(() => null),
				);
				if (!parsed.success) return null;
				setAnalysis(parsed.data);
				return parsed.data;
			} catch {
				return null;
			}
		},
		[],
	);

	// Refresh recovery: the stored id is only a pointer. Authoritative sync
	// state comes from GET status. A missing token after refresh is never
	// restored from storage; waiting sessions mint a fresh credential via
	// retry, while in-flight/uploaded sessions resume polling without
	// disturbing the active attempt.
	const recoverCodebase = useCallback(async (): Promise<boolean> => {
		const stored = readPlanCodebasePointer();
		if (!stored) return false;
		setError(null);
		setIsStarting(true);
		try {
			const statusResponse = await fetch(
				`/api/codebases/${encodeURIComponent(stored.id)}/status`,
			);
			if (statusResponse.status === 401) {
				window.location.href = `/login?redirect=${encodeURIComponent("/plan/codebase")}`;
				return true;
			}
			const statusParsed = syncStatusResponseSchema.safeParse(
				await statusResponse.json().catch(() => null),
			);
			if (!statusResponse.ok || !statusParsed.success) {
				clearPlanOnboardingPointers();
				return false;
			}
			const recovered = statusParsed.data;
			const recoveredName = recovered.codebaseName ?? stored.name;
			if (!recoveredName) {
				clearPlanOnboardingPointers();
				return false;
			}
			setCodebase({ id: stored.id, name: recoveredName });
			setRecoveredStatus(recovered);
			setSessionNonce((current) => current + 1);
			// The conclusion step owns every analysis state, so a refresh on a
			// finished upload always resumes at step 3 and lets it render
			// ANALYZING or READY from persisted evidence. Landing on the sync
			// screen instead would show a completed sync the user already moved
			// past, and landing on the review alone would need a manual Next.
			if (
				recovered.snapshotId &&
				SNAPSHOT_CONTEXT_STATUSES.includes(recovered.status)
			) {
				const storedProject = readPlanCodebaseProjectPointer();
				if (storedProject) {
					setFeatureProjectId(storedProject);
					// Only a ready analysis short-circuits the trigger below; a
					// pending or failed row is left for the conclusion screen to
					// render honestly.
					const existing = await fetchAnalysisOutput(
						storedProject,
						recovered.snapshotId,
					);
					if (
						existing?.output &&
						existing.snapshotId === recovered.snapshotId &&
						existing.status === "ready"
					) {
						analysisAttemptedFor.current = recovered.snapshotId;
					}
				}
				setPayload(null);
				setStep("summary");
				return true;
			}
			if (
				recovered.status === "waiting_for_cli" ||
				recovered.status === "failed" ||
				recovered.status === "expired"
			) {
				const retryResponse = await fetch(
					`/api/codebases/${encodeURIComponent(stored.id)}/session`,
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ action: "retry" }),
					},
				);
				const retryParsed = syncPromptPayloadSchema.safeParse(
					await retryResponse.json().catch(() => null),
				);
				if (retryResponse.ok && retryParsed.success) {
					setPayload(retryParsed.data);
					// The fresh session starts from scratch: drop the previous
					// attempt's state so the poller cannot resurrect it.
					setRecoveredStatus(null);
					setAnalysis(null);
					setAnalysisError(null);
					analysisAttemptedFor.current = null;
					setStep("prompt");
					return true;
				}
				clearPlanOnboardingPointers();
				return false;
			}
			// The CLI is mid-attempt. Stay on whichever step the handshake
			// evidence supports instead of assuming the transport is the thing
			// the user came back to check.
			setStep(canContinueToSync(recovered) ? "syncing" : "prompt");
			return true;
		} catch {
			clearPlanOnboardingPointers();
			return false;
		} finally {
			setIsStarting(false);
		}
	}, [setStep, fetchAnalysisOutput]);

	useEffect(() => {
		if (autoInitAttempted.current) return;
		autoInitAttempted.current = true;
		// Fast path preserves the original timing: no stored pointer means
		// create immediately (synchronously sets loading state). Only stored
		// pointers pay for the async recovery round-trip.
		if (!readPlanCodebasePointer()) {
			void createCodebase();
			return;
		}
		void (async () => {
			const recovered = await recoverCodebase();
			if (!recovered) await createCodebase();
		})();
	}, [createCodebase, recoverCodebase]);

	const retrySession = async () => {
		if (!codebase) return;
		setError(null);
		setIsStarting(true);
		try {
			const response = await fetch(
				`/api/codebases/${encodeURIComponent(codebase.id)}/session`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ action: "retry" }),
				},
			);
			const parsed = syncPromptPayloadSchema.safeParse(
				await response.json().catch(() => null),
			);
			if (!response.ok || !parsed.success) {
				setError("Sesi sync gagal dibuat. Coba lagi.");
				return;
			}
			setPayload(parsed.data);
			setRecoveredStatus(null);
			setAnalysis(null);
			setAnalysisError(null);
			analysisAttemptedFor.current = null;
			setStep("prompt");
			setSessionNonce((current) => current + 1);
		} catch {
			setError("Server tidak dapat dihubungi.");
		} finally {
			setIsStarting(false);
		}
	};

	const retryAnalysis = useCallback(() => {
		if (!featureProjectId || !lastStatus?.snapshotId) return;
		analysisAttemptedFor.current = null;
		setAnalysisError(null);
		void triggerOnboardingAnalysis(featureProjectId, lastStatus.snapshotId);
	}, [featureProjectId, lastStatus, triggerOnboardingAnalysis]);

	// The server owns the name: once the CLI has handshaken it holds the
	// repository folder name, so the open onboarding page must not keep showing
	// the creation placeholder it started with.
	useEffect(() => {
		const serverName = lastStatus?.codebaseName;
		if (!serverName) return;
		setCodebase((current) =>
			current && current.name !== serverName
				? { ...current, name: serverName }
				: current,
		);
	}, [lastStatus]);

	// Persist the pointer whenever the name changes so a refresh does not
	// repaint the placeholder before the first status poll lands.
	useEffect(() => {
		if (!codebase) return;
		storePlanCodebasePointer(codebase.id, codebase.name);
	}, [codebase]);

	// Two independent capabilities, deliberately not collapsed into one
	// `isReady`: the workspace opens as soon as sync produced a usable
	// snapshot, while the review conclusion additionally requires validated
	// analysis output for that exact snapshot.
	//
	// `reviewReady` mirrors the workspace canRenderCodebaseReview predicate; a
	// snapshot alone never counts as a review.
	const canOpenWorkspace = isSyncStatusComplete(lastStatus);
	const reviewReady = Boolean(
		analysis?.output &&
			lastStatus?.snapshotId &&
			analysis.snapshotId === lastStatus.snapshotId &&
			SNAPSHOT_CONTEXT_STATUSES.includes(lastStatus.status),
	);
	// The prompt screen advances only on server evidence that the CLI started
	// this attempt. Copying the prompt is browser feedback and never reaches
	// this predicate.
	const canContinueToMonitor = canContinueToSync(lastStatus);

	// Onboarding analysis trigger: once the server persisted a snapshot for
	// the current attempt, ensure the onboarding feature project and run the
	// real analysis through the existing boundary. Single-flight per snapshot;
	// the trigger is idempotent server-side, so refresh and remount are safe.
	// Never auto-navigates: reaching "summary" stays an explicit user action
	// on the in-card review CTA.
	useEffect(() => {
		const snapshotId = lastStatus?.snapshotId;
		if (!codebase || !lastStatus || !snapshotId) return;
		if (!SNAPSHOT_CONTEXT_STATUSES.includes(lastStatus.status)) return;
		if (reviewReady) return;
		if (analysisAttemptedFor.current === snapshotId) return;
		analysisAttemptedFor.current = snapshotId;
		void (async () => {
			const projectId =
				featureProjectId ??
				(await ensureFeatureProject(codebase.id, codebase.name));
			if (!projectId) return;
			await triggerOnboardingAnalysis(projectId, snapshotId);
		})();
	}, [
		codebase,
		lastStatus,
		featureProjectId,
		reviewReady,
		ensureFeatureProject,
		triggerOnboardingAnalysis,
	]);

	// Pull validated analysis output once status reports it. The status
	// endpoint only attaches analysisStatus when the analysis project query
	// is present (wired via SyncStatus analysisProjectId below), so this
	// effect only ever renders server-persisted output, never a fabrication.
	useEffect(() => {
		const snapshotId = lastStatus?.snapshotId;
		if (!featureProjectId || !snapshotId) return;
		if (
			lastStatus.analysisStatus !== "ready" &&
			lastStatus.analysisStatus !== "failed"
		)
			return;
		if (
			analysis?.snapshotId === snapshotId &&
			analysis.status === lastStatus.analysisStatus
		)
			return;
		void fetchAnalysisOutput(featureProjectId, snapshotId);
	}, [featureProjectId, lastStatus, analysis, fetchAnalysisOutput]);

	// Onboarding states are mutually exclusive. A terminal create failure must
	// never render beside a "waiting for session" spinner: the spinner claims a
	// request is still in flight after it has already failed, which is exactly
	// the state the user cannot act on. Derived from `codebase` first so the
	// ready branch keeps its non-null narrowing.
	const onboardingFailed = !codebase && !isStarting && error !== null;

	return (
		<main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
			<HubBreadcrumb
				current={CODEBASE_ONBOARDING_LABEL}
				ancestors={[
					{ label: "VibePlan", to: "/plan" },
					{ label: CODEBASE_LIBRARY_LABEL, to: CODEBASE_LIBRARY_HREF },
				]}
			/>

			{!codebase ? (
				onboardingFailed ? (
					<div className="flex min-h-[50vh] flex-1 items-center justify-center py-12">
						<div
							role="alert"
							className="flex w-full max-w-sm flex-col items-center gap-4 rounded-xl border border-crimson/40 bg-crimson/10 p-8 text-center sm:p-10"
						>
							<div className="space-y-1">
								<p className="text-sm font-medium text-snow">
									{CODEBASE_ONBOARDING_ERROR_TITLE}
								</p>
								<p className="text-xs text-fog">{error}</p>
							</div>
							<button
								type="button"
								onClick={() => void createCodebase()}
								className="inline-flex min-h-10 items-center justify-center rounded-md bg-snow px-5 text-xs font-semibold text-onyx transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
							>
								Coba lagi
							</button>
						</div>
					</div>
				) : (
					<div className="flex min-h-[50vh] flex-1 items-center justify-center py-12">
						<output className="flex w-full max-w-sm flex-col items-center gap-4 rounded-xl border border-graphite bg-charcoal p-8 text-center sm:p-10">
							<div
								className="h-9 w-9 animate-spin rounded-full border-2 border-graphite border-t-indigo"
								aria-hidden="true"
							/>
							<div className="space-y-1">
								<p className="text-sm font-medium text-snow">
									{isStarting
										? "Menyiapkan sesi sync..."
										: "Menunggu sesi sync..."}
								</p>
								<p className="text-xs text-fog">
									Menghubungkan repository dan menginisialisasi instruksi CLI
								</p>
							</div>
						</output>
					</div>
				)
			) : !payload && !lastStatus ? (
				// A codebase exists but neither its prompt payload nor a polled
				// status has landed yet. Still initializing, not an error.
				<div className="flex min-h-[50vh] flex-1 items-center justify-center py-12">
					<output className="flex w-full max-w-sm flex-col items-center gap-4 rounded-xl border border-graphite bg-charcoal p-8 text-center sm:p-10">
						<div
							className="h-9 w-9 animate-spin rounded-full border-2 border-graphite border-t-indigo"
							aria-hidden="true"
						/>
						<div className="space-y-1">
							<p className="text-sm font-medium text-snow">
								Menyiapkan instruksi CLI...
							</p>
							<p className="text-xs text-fog">
								Menghubungkan repository dan menginisialisasi instruksi CLI
							</p>
						</div>
					</output>
				</div>
			) : (
				<>
					{step === "prompt" &&
						(payload ? (
							<ScreenConnect
								projectName={codebase.name}
								payload={payload}
								isStarting={isStarting}
								canContinue={canContinueToMonitor}
								onAgentStarted={() => setStep("syncing")}
							/>
						) : (
							<div className="mx-auto w-full max-w-2xl rounded-xl border border-graphite bg-charcoal p-5 sm:p-6 text-center">
								<p className="text-sm font-medium text-snow">
									Sesi sync dipulihkan dari server
								</p>
								<p className="mt-1 text-xs text-fog">
									Token sync sekali-pakai tidak tersimpan di browser. Buat token
									baru untuk menjalankan CLI, atau lanjut pantau status yang
									sudah berjalan.
								</p>
								{statusPollError && (
									<p role="alert" className="mt-2 text-xs text-crimson">
										{statusPollError}
									</p>
								)}
								<div className="mt-4 flex flex-wrap items-center justify-center gap-3">
									<button
										type="button"
										onClick={() => void retrySession()}
										disabled={isStarting}
										className="inline-flex min-h-10 items-center rounded-md bg-snow px-5 text-xs font-semibold text-onyx transition hover:brightness-110 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
									>
										{isStarting ? "Menyiapkan..." : "Dapatkan token baru"}
									</button>
									<button
										type="button"
										data-testid="recovered-continue-to-sync"
										onClick={() => setStep("syncing")}
										// The same handshake gate as the prompt screen: a
										// recovered session without CLI evidence stays put.
										disabled={!canContinueToMonitor}
										className="inline-flex min-h-10 items-center rounded-md border border-graphite bg-obsidian px-3.5 text-xs font-medium text-fog hover:border-steel hover:text-snow transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
									>
										Lanjut ke Pantau Sync
									</button>
								</div>
							</div>
						))}

					{step === "syncing" && (
						<SyncStatus
							key={sessionNonce}
							projectId={codebase.id}
							projectName={codebase.name}
							status={lastStatus}
							statusPath={`/api/codebases/${encodeURIComponent(codebase.id)}/status`}
							analysisProjectId={featureProjectId ?? undefined}
							statusPolling="parent"
							onRetrySync={() => void retrySession()}
							onContinueToSummary={() => setStep("summary")}
							onBackToInstructions={() => setStep("prompt")}
						/>
					)}

					{step === "summary" &&
						(lastStatus?.snapshotId ? (
							<section data-testid="codebase-sync-summary">
								<CodebaseConclusion
									snapshot={lastStatus}
									analysis={analysis}
									isAnalyzing={analysisWorking}
									errorMessage={analysisError}
									onRetryAnalysis={retryAnalysis}
									onEnterWorkspace={() => {
										if (!canOpenWorkspace) return;
										void navigate({
											to: "/codebases/$id",
											params: { id: codebase.id },
										});
									}}
									onBackToSync={() => setStep("syncing")}
								/>
							</section>
						) : (
							// No usable snapshot for the current attempt, so there is
							// nothing to analyze yet. Report the real state and send the
							// user back to monitoring instead of showing an analysis
							// loader for work that cannot start.
							<section
								data-testid="codebase-sync-summary"
								className="mx-auto w-full max-w-2xl rounded-xl border border-graphite bg-charcoal p-5 text-center"
							>
								<p className="text-sm font-medium text-snow">
									Belum ada snapshot untuk dianalisis
								</p>
								<p className="mt-1 text-xs text-fog">
									Kesimpulan codebase muncul setelah source code selesai
									tersinkron.
								</p>
								<div className="mt-4 flex flex-wrap items-center justify-center gap-3">
									<button
										type="button"
										onClick={() => setStep("syncing")}
										className="inline-flex min-h-10 items-center rounded-md border border-graphite bg-obsidian px-3.5 text-xs font-medium text-fog hover:border-steel hover:text-snow transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
									>
										Kembali ke Pantau Sync
									</button>
								</div>
							</section>
						))}
				</>
			)}
		</main>
	);
}
