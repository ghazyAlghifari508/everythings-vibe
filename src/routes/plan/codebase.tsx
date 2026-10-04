import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { CodebaseReview } from "@/components/codebase/codebase-review";
import { ScreenConnect } from "@/components/codebase/screen-connect";
import { SyncStatus } from "@/components/codebase/sync-status";
import { HubBreadcrumb } from "@/components/home/hub-breadcrumb";
import {
	type AnalysisResponse,
	analysisResponseSchema,
} from "@/lib/codebase-analysis";
import {
	PLAN_CODEBASE_ID_STORAGE_KEY,
	PLAN_CODEBASE_NAME_STORAGE_KEY,
	PLAN_CODEBASE_PROJECT_STORAGE_KEY,
	SNAPSHOT_CONTEXT_STATUSES,
	type SyncPromptPayload,
	type SyncStatusResponse,
	syncPromptPayloadSchema,
	syncStatusResponseSchema,
} from "@/lib/codebase-sync";
import { useUIStore } from "@/store";

function readStoredPlanCodebase(): { id: string; name: string | null } | null {
	try {
		if (typeof sessionStorage === "undefined") return null;
		const id = sessionStorage.getItem(PLAN_CODEBASE_ID_STORAGE_KEY);
		if (!id) return null;
		// Stored under its own key or absent: the server status response is the
		// authority, so a missing name is never backfilled with a guess.
		const storedName = sessionStorage.getItem(PLAN_CODEBASE_NAME_STORAGE_KEY);
		return {
			id,
			name: storedName && storedName.length > 0 ? storedName : null,
		};
	} catch {
		return null;
	}
}

function storePlanCodebase(id: string, name: string): void {
	try {
		if (typeof sessionStorage === "undefined") return;
		sessionStorage.setItem(PLAN_CODEBASE_ID_STORAGE_KEY, id);
		sessionStorage.setItem(PLAN_CODEBASE_NAME_STORAGE_KEY, name);
	} catch {
		// Storage is a best-effort pointer only; server remains source of truth.
	}
}

function clearStoredPlanCodebase(): void {
	try {
		if (typeof sessionStorage === "undefined") return;
		sessionStorage.removeItem(PLAN_CODEBASE_ID_STORAGE_KEY);
		sessionStorage.removeItem(PLAN_CODEBASE_NAME_STORAGE_KEY);
	} catch {
		// Best-effort only.
	}
}

function readStoredPlanProject(): string | null {
	try {
		if (typeof sessionStorage === "undefined") return null;
		const id = sessionStorage.getItem(PLAN_CODEBASE_PROJECT_STORAGE_KEY);
		return id && id.trim().length > 0 ? id : null;
	} catch {
		return null;
	}
}

function storePlanProject(id: string): void {
	try {
		if (typeof sessionStorage === "undefined") return;
		sessionStorage.setItem(PLAN_CODEBASE_PROJECT_STORAGE_KEY, id);
	} catch {
		// Storage is a best-effort pointer only; server remains source of truth.
	}
}

function clearStoredPlanProject(): void {
	try {
		if (typeof sessionStorage === "undefined") return;
		sessionStorage.removeItem(PLAN_CODEBASE_PROJECT_STORAGE_KEY);
	} catch {
		// Best-effort only.
	}
}

export const Route = createFileRoute("/plan/codebase")({
	head: () => ({
		meta: [
			{ title: "Codebase Existing | VibeEverything" },
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
	const [lastStatus, setLastStatus] = useState<SyncStatusResponse | null>(null);
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

	useEffect(() => {
		setStep("prompt");
	}, [setStep]);

	const createCodebase = useCallback(async () => {
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
			clearStoredPlanProject();
			setFeatureProjectId(null);
			setAnalysis(null);
			setAnalysisError(null);
			analysisAttemptedFor.current = null;
			setPayload(sync.data);
			setLastStatus(null);
			setStep("prompt");
			setSessionNonce((current) => current + 1);
		} catch {
			setError("Server tidak dapat dihubungi.");
		} finally {
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
			const stored = readStoredPlanProject();
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
				storePlanProject(projectId);
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
		const stored = readStoredPlanCodebase();
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
				clearStoredPlanCodebase();
				return false;
			}
			const recovered = statusParsed.data;
			const recoveredName = recovered.codebaseName ?? stored.name;
			if (!recoveredName) {
				clearStoredPlanCodebase();
				return false;
			}
			setCodebase({ id: stored.id, name: recoveredName });
			setLastStatus(recovered);
			setSessionNonce((current) => current + 1);
			// An uploaded snapshot is transport-complete, not analysis-complete.
			// Resume the onboarding review only when validated analysis output for
			// this exact snapshot is already stored; anything less lands on
			// syncing, where live polling and the trigger effect take over
			// honestly instead of showing a snapshot-only summary.
			if (
				recovered.snapshotId &&
				SNAPSHOT_CONTEXT_STATUSES.includes(recovered.status)
			) {
				const storedProject = readStoredPlanProject();
				if (storedProject) {
					setFeatureProjectId(storedProject);
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
						setPayload(null);
						setStep("summary");
						return true;
					}
					if (existing) {
						analysisAttemptedFor.current = recovered.snapshotId;
					}
				}
				setPayload(null);
				setStep("syncing");
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
					setLastStatus(null);
					setStep("prompt");
					return true;
				}
				clearStoredPlanCodebase();
				return false;
			}
			setPayload(null);
			setStep("syncing");
			return true;
		} catch {
			clearStoredPlanCodebase();
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
		if (!readStoredPlanCodebase()) {
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
			setLastStatus(null);
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

	// Domain state and UI navigation are separate concepts. Polling only
	// records the latest server state here; step changes are explicit user
	// actions (or refresh restoration). An `uploaded` snapshot means the
	// transport finished — it is not an analysis conclusion, so it must never
	// auto-navigate away from the screen the user chose to look at.
	const handleStatus = (status: SyncStatusResponse | null) => {
		// SyncStatus no longer reports null on polling errors, so null here
		// means no successful response yet — keep the last known good state.
		if (status === null) return;
		setLastStatus(status);
		// The server owns the name: once the CLI has handshaken it holds the
		// repository folder name, so the open onboarding page must not keep
		// showing the creation placeholder it started with.
		const serverName = status.codebaseName;
		if (!serverName) return;
		setCodebase((current) =>
			current && current.name !== serverName
				? { ...current, name: serverName }
				: current,
		);
	};

	// Persist the pointer whenever the name changes so a refresh does not
	// repaint the placeholder before the first status poll lands.
	useEffect(() => {
		if (!codebase) return;
		storePlanCodebase(codebase.id, codebase.name);
	}, [codebase]);

	// The final review reuses the canonical CodebaseReview only when validated
	// analysis output for the exact current snapshot is in hand. This mirrors
	// the workspace canRenderCodebaseReview predicate; a snapshot alone never
	// counts as a review.
	const reviewReady = Boolean(
		analysis?.output &&
			lastStatus?.snapshotId &&
			analysis.snapshotId === lastStatus.snapshotId &&
			SNAPSHOT_CONTEXT_STATUSES.includes(lastStatus.status),
	);

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

	return (
		<main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
			<HubBreadcrumb
				current="Codebase Existing"
				parent={{ label: "VibePlan", to: "/plan" }}
			/>

			{error && (
				<div
					role="alert"
					className="rounded-xl border border-crimson/40 bg-crimson/10 p-4 text-sm text-crimson"
				>
					{error}
				</div>
			)}

			{!codebase || (!payload && !lastStatus) ? (
				<div className="flex flex-1 items-center justify-center min-h-[50vh] py-12">
					<output className="flex flex-col items-center gap-4 rounded-xl border border-graphite bg-charcoal p-8 sm:p-10 text-center max-w-sm w-full shadow-lg">
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
						{error && !isStarting && (
							<button
								type="button"
								onClick={() => void createCodebase()}
								className="mt-2 inline-flex min-h-10 items-center justify-center rounded-md bg-snow px-5 text-xs font-semibold text-onyx transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
							>
								Coba lagi
							</button>
						)}
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
										onClick={() => setStep("syncing")}
										className="inline-flex min-h-10 items-center rounded-md border border-graphite bg-obsidian px-3.5 text-xs font-medium text-fog hover:border-steel hover:text-snow transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
									>
										Lanjut ke Pantau Sync →
									</button>
								</div>
							</div>
						))}

					{step === "syncing" && (
						<>
							{analysisError && (
								<div
									role="alert"
									className="mx-auto w-full max-w-2xl rounded-xl border border-crimson/40 bg-crimson/10 p-4 text-xs text-crimson"
								>
									{analysisError}
								</div>
							)}
							<SyncStatus
								key={sessionNonce}
								projectId={codebase.id}
								projectName={codebase.name}
								status={lastStatus}
								statusPath={`/api/codebases/${encodeURIComponent(codebase.id)}/status`}
								analysisProjectId={featureProjectId ?? undefined}
								onStatus={handleStatus}
								onRetrySync={() => void retrySession()}
								onRetryAnalysis={
									featureProjectId && lastStatus?.snapshotId
										? retryAnalysis
										: undefined
								}
								onBackToInstructions={() => setStep("prompt")}
								onViewReview={() => setStep("summary")}
							/>
						</>
					)}

					{step === "summary" &&
						(reviewReady && analysis?.output && lastStatus?.snapshotId ? (
							<section data-testid="codebase-sync-summary">
								<CodebaseReview
									analysis={analysis.output}
									snapshotId={lastStatus.snapshotId}
									snapshotCreatedAt={lastStatus.snapshotCreatedAt}
									fileCount={lastStatus.fileCount}
									excludedCount={lastStatus.excludedCount}
									isWorking={analysisWorking}
									errorMessage={analysisError}
									continueLabel="Masuk ke Workspace"
									onRetrySync={() => void retrySession()}
									onRetryAnalysis={retryAnalysis}
									onContinue={() =>
										void navigate({
											to: "/codebases/$id",
											params: { id: codebase.id },
										})
									}
									onBackToSync={() => setStep("syncing")}
								/>
							</section>
						) : (
							<section
								data-testid="codebase-sync-summary"
								className="mx-auto w-full max-w-2xl rounded-xl border border-graphite bg-charcoal p-5 sm:p-6 text-center"
							>
								<p className="text-sm font-medium text-snow">
									Menyiapkan ringkasan analisis...
								</p>
								<p className="mt-1 text-xs text-fog">
									Hasil analisis yang tervalidasi sedang dimuat dari server.
									Ringkasan hanya tampil setelah analisis benar-benar selesai.
								</p>
								{analysisError && (
									<p role="alert" className="mt-3 text-xs text-crimson">
										{analysisError}
									</p>
								)}
								<div className="mt-4 flex flex-wrap items-center justify-center gap-3">
									<button
										type="button"
										onClick={() => setStep("syncing")}
										className="inline-flex min-h-10 items-center rounded-md border border-graphite bg-obsidian px-3.5 text-xs font-medium text-fog hover:border-steel hover:text-snow transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
									>
										← Kembali ke Pantau Sync
									</button>
								</div>
							</section>
						))}
				</>
			)}
		</main>
	);
}
