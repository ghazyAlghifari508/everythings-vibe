import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { CodebaseConclusion } from "@/components/codebase/codebase-conclusion";
import { ScreenConnect } from "@/components/codebase/screen-connect";
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
	type PlanCodebaseStep,
	readPlanCodebasePointer,
	readPlanCodebaseProjectPointer,
	readPlanCodebaseStepPointer,
	storePlanCodebasePointer,
	storePlanCodebaseProjectPointer,
	storePlanCodebaseStepPointer,
} from "@/lib/codebase-plan-storage";
import {
	canOpenSummary,
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
	// stages, and the conclusion screen needs the persisted analysis status â€” all
	// three read this single snapshot, so no two screens can disagree and no
	// second poller races this one.
	const { status: lastStatus, error: statusPollError } = useCodebaseSyncStatus({
		codebaseId: codebase?.id ?? null,
		analysisProjectId: featureProjectId,
		initialStatus: recoveredStatus,
		enabled: codebase !== null,
	});

	useEffect(() => {
		setStep("sync");
	}, [setStep]);

	// Persist the navigation intent, never the domain state: a refresh returns
	// the user to the screen they were reading, and recovery re-validates it
	// against the server snapshot instead of trusting it.
	useEffect(() => {
		if (!codebase) return;
		storePlanCodebaseStepPointer(step);
	}, [codebase, step]);

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
			setStep("sync");
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

	// Restore the step the user was on, validated against real server evidence.
	// A stored intent is a preference, not a fact, and it is only ever consulted
	// AFTER the server has confirmed the precondition for the step it names:
	// the conclusion step needs a usable current snapshot, and without one there
	// is nothing to analyse, so a refresh always lands back on the sync step
	// rather than faking a summary. When the snapshot does exist, the stored
	// intent still matters — a user who refreshed while the upload was landing
	// should come back to the completed sync state they were watching, not to a
	// conclusion step they never reached.
	const resolveRecoveredStep = useCallback(
		(
			recovered: SyncStatusResponse,
			storedStep: PlanCodebaseStep | null,
		): PlanCodebaseStep => {
			const hasSnapshot =
				Boolean(recovered.snapshotId) &&
				SNAPSHOT_CONTEXT_STATUSES.includes(recovered.status);
			if (!hasSnapshot) return "sync";
			return storedStep === "sync" ? "sync" : "summary";
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
			const storedStep = readPlanCodebaseStepPointer();
			// A usable snapshot is the precondition for the conclusion step, so the
			// onboarding analysis context is restored only here. Which of the two
			// steps the user lands on is then decided by `resolveRecoveredStep`,
			// which keeps the stored intent from overriding this evidence.
			if (
				recovered.snapshotId &&
				SNAPSHOT_CONTEXT_STATUSES.includes(recovered.status)
			) {
				const storedProject = readPlanCodebaseProjectPointer();
				if (storedProject) {
					setFeatureProjectId(storedProject);
					// Only a ready analysis short-circuits the trigger below; a
					// pending or failed row is left for the conclusion step to
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
				setStep(resolveRecoveredStep(recovered, storedStep));
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
					setStep("sync");
					return true;
				}
				clearPlanOnboardingPointers();
				return false;
			}
			// The CLI is mid-attempt. Return the user to the screen they left, and
			// let the prompt screen report the handshake rather than assuming the
			// transport is what they came back to check.
			setStep(resolveRecoveredStep(recovered, storedStep));
			return true;
		} catch {
			clearPlanOnboardingPointers();
			return false;
		} finally {
			setIsStarting(false);
		}
	}, [setStep, fetchAnalysisOutput, resolveRecoveredStep]);

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
			setStep("sync");
		} catch {
			setError("Server tidak dapat dihubungi.");
		} finally {
			setIsStarting(false);
		}
	};

	// Retry resets the per-snapshot guard and clears the previous attempt, then
	// lets the single trigger effect below perform the request. Calling the
	// boundary directly as well would POST twice for one user action.
	const retryAnalysis = useCallback(() => {
		if (!featureProjectId || !lastStatus?.snapshotId) return;
		analysisAttemptedFor.current = null;
		setAnalysis(null);
		setAnalysisError(null);
	}, [featureProjectId, lastStatus]);

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
	// The sync step's continue action is gated on transport completion alone: a
	// valid current snapshot plus a finished upload chain. Copying the prompt is
	// browser feedback and never reaches this predicate, and neither is the
	// analysis state — the conclusion step owns that from the moment it opens.
	const canContinueToSummary = canOpenSummary(lastStatus);

	// The conclusion step is never rendered without a usable current snapshot for
	// this attempt. Without this guard a stale step pointer or a direct jump
	// would show a summary for work that cannot start; the user is returned to
	// the sync step, which reports the real state instead.
	const snapshotReady = Boolean(
		lastStatus?.snapshotId &&
			SNAPSHOT_CONTEXT_STATUSES.includes(lastStatus.status),
	);
	const activeStep: PlanCodebaseStep =
		step === "summary" && !snapshotReady ? "sync" : step;

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
					{/* Step 1 owns the whole sync lifecycle: the prompt, the agent, and
					the live server status of the upload it started. There is no second
					screen to navigate to in order to see the same progress. */}
					{activeStep === "sync" && (
						<ScreenConnect
							projectName={codebase.name}
							payload={payload}
							isStarting={isStarting}
							status={lastStatus}
							statusError={statusPollError}
							onRequestNewToken={() => void retrySession()}
							onRetrySync={() => void retrySession()}
							canContinueToSummary={canContinueToSummary}
							onContinueToSummary={() => setStep("summary")}
						/>
					)}

					{/* Step 2 owns every analysis state. Pending becomes the canonical
					review in this same region once the server reports it, so there is
					no manual step between the two. */}
					{activeStep === "summary" && lastStatus && (
						<section data-testid="codebase-sync-summary">
							<CodebaseConclusion
								snapshot={lastStatus}
								analysis={analysis}
								isAnalyzing={analysisWorking}
								errorMessage={analysisError}
								onRetryAnalysis={retryAnalysis}
								onRetrySync={() => void retrySession()}
								onEnterWorkspace={() => {
									if (!canOpenWorkspace) return;
									void navigate({
										to: "/codebases/$id",
										params: { id: codebase.id },
									});
								}}
								onBackToSync={() => setStep("sync")}
							/>
						</section>
					)}
				</>
			)}
		</main>
	);
}
