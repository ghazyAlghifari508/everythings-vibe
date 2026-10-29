"use client";

import { AlertCircleIcon, Loading01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { AnalysisResponse } from "@/features/codebase/services/analysis";
import type { SyncStatusResponse } from "@/features/codebase/services/sync";
import { CodebaseReview } from "./codebase-review";

type ConclusionState = "analyzing" | "failed" | "ready";

interface CodebaseConclusionProps {
	/** Persisted sync status for the current attempt. */
	snapshot: SyncStatusResponse;
	/** Latest analysis row, from either the trigger or the read boundary. */
	analysis: AnalysisResponse | null;
	/** True while this client has an analysis request in flight. */
	isAnalyzing: boolean;
	errorMessage: string | null;
	onRetryAnalysis: () => void;
	onRetrySync?: () => void;
	onEnterWorkspace: () => void;
	onBackToSync: () => void;
}

/**
 * Resolve the three states of the conclusion step.
 *
 * Order matters and is the whole contract:
 * 1. a ready analysis for the CURRENT snapshot always wins, so a finished
 *    review is never masked by a stale `failed` status still on screen;
 * 2. an in-flight attempt shows the analyzing state, so a retry visibly
 *    replaces the failure it came from;
 * 3. otherwise a persisted failure is reported as a failure.
 *
 * A failure may arrive from either of two snapshot-scoped server sources: the
 * analysis row itself, or `status.analysisStatus`, which the status endpoint
 * reads from the row bound to this exact snapshot. Both are persisted facts, so
 * either one is sufficient; neither is a local guess.
 *
 * An analysis bound to a different snapshot is not evidence about this one, so
 * it can never produce `ready` here.
 */
export function resolveConclusionState(input: {
	snapshotId: string | null | undefined;
	snapshotAnalysisStatus?: "pending" | "ready" | "failed";
	/** Newest stored attempt for the snapshot; reports failures that have no
	 *  ready content, which `snapshotAnalysisStatus` alone can never express. */
	snapshotAttemptStatus?: "pending" | "ready" | "failed";
	analysis: AnalysisResponse | null;
	isAnalyzing: boolean;
}): ConclusionState {
	const {
		snapshotId,
		snapshotAnalysisStatus,
		snapshotAttemptStatus,
		analysis,
		isAnalyzing,
	} = input;
	const matchesCurrentSnapshot =
		Boolean(snapshotId) &&
		analysis !== null &&
		analysis.snapshotId === snapshotId;

	if (
		matchesCurrentSnapshot &&
		analysis.status === "ready" &&
		analysis.output
	) {
		return "ready";
	}
	if (isAnalyzing) return "analyzing";
	const analysisFailed = matchesCurrentSnapshot
		? analysis.status === "failed"
		: false;
	if (
		analysisFailed ||
		snapshotAnalysisStatus === "failed" ||
		snapshotAttemptStatus === "failed"
	)
		return "failed";
	return "analyzing";
}

/**
 * Live elapsed seconds for the running analysis, measured from the persisted
 * attempt's own start time. Renders nothing when the server never recorded
 * one, so the duration is reported rather than invented.
 */
function useAnalysisElapsedSeconds(
	startedAt: string | null | undefined,
): number | null {
	const [elapsed, setElapsed] = useState<number | null>(null);
	useEffect(() => {
		if (!startedAt) {
			setElapsed(null);
			return;
		}
		const startMs = Date.parse(startedAt);
		if (!Number.isFinite(startMs)) {
			setElapsed(null);
			return;
		}
		const tick = () => setElapsed(Math.max(0, (Date.now() - startMs) / 1000));
		tick();
		const timer = setInterval(tick, 1000);
		return () => clearInterval(timer);
	}, [startedAt]);
	return elapsed;
}

export function CodebaseConclusion({
	snapshot,
	analysis,
	isAnalyzing,
	errorMessage,
	onRetryAnalysis,
	onRetrySync,
	onEnterWorkspace,
	onBackToSync,
}: CodebaseConclusionProps) {
	const state = resolveConclusionState({
		snapshotId: snapshot.snapshotId,
		snapshotAnalysisStatus: snapshot.analysisStatus,
		snapshotAttemptStatus: snapshot.analysisAttemptStatus,
		analysis,
		isAnalyzing,
	});
	// The persisted attempt's start is the real measurement point. The local
	// trigger's own start is only a fallback for the window before the first
	// poll lands, and only while this client knows it sent the request.
	const elapsed = useAnalysisElapsedSeconds(snapshot.analysisAttemptCreatedAt);
	// Real persisted counts only; the sentence degrades to a neutral claim when
	// the server never reported them.
	const fileSummary = snapshot.fileCount
		? `Repository berhasil disinkronkan. ${snapshot.fileCount} file tersimpan.`
		: "Repository berhasil disinkronkan.";

	const isInsufficientCredit =
		snapshot.errorCode === "INSUFFICIENT_CREDITS" ||
		Boolean(
			errorMessage &&
				/kredit.*mencukupi|insufficient.*credit/i.test(errorMessage),
		);

	if (state === "ready" && analysis?.output && snapshot.snapshotId) {
		return (
			<CodebaseReview
				analysis={analysis.output}
				snapshotId={snapshot.snapshotId}
				snapshotCreatedAt={snapshot.snapshotCreatedAt}
				fileCount={snapshot.fileCount}
				excludedCount={snapshot.excludedCount}
				continueLabel="Masuk ke Workspace"
				onRetryAnalysis={onRetryAnalysis}
				onRetrySync={onRetrySync}
				onContinue={onEnterWorkspace}
				onBackToSync={onBackToSync}
			/>
		);
	}

	return (
		<div className="flex min-h-[40vh] w-full flex-col items-center justify-center gap-6 py-10">
			<section
				data-testid={
					state === "failed"
						? "codebase-analysis-failed"
						: "codebase-analysis-pending"
				}
				className="w-full max-w-xl rounded-xl border border-graphite bg-charcoal p-6 text-center sm:p-8"
			>
				{state === "failed" ? (
					<>
						<span className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full border border-crimson/30 bg-crimson/10">
							<Icon
								icon={AlertCircleIcon}
								size={18}
								className="shrink-0 text-crimson"
								aria-hidden="true"
							/>
						</span>
						<h2 className="font-inter text-lg font-[620] text-snow">
							{isInsufficientCredit
								? "Analisis belum dapat dimulai"
								: "Analisis belum berhasil"}
						</h2>
						<p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-fog">
							{isInsufficientCredit
								? "Repository berhasil disinkronkan. Analisis belum dapat dimulai karena kredit belum mencukupi."
								: "Repository berhasil disinkronkan. Source code tetap tersimpan."}
						</p>
						{errorMessage && !isInsufficientCredit && (
							<Alert
								variant="subtle"
								role="alert"
								className="mx-auto mt-3 max-w-md border-crimson/30 bg-crimson/5 p-3 text-left text-xs text-crimson"
							>
								{errorMessage}
							</Alert>
						)}
					</>
				) : (
					<>
						<span className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full border border-graphite bg-obsidian">
							<Icon
								icon={Loading01Icon}
								size={18}
								className="shrink-0 animate-spin text-fog"
								aria-hidden="true"
							/>
						</span>
						<h2 className="font-inter text-lg font-[620] text-snow">
							Menganalisis repository...
						</h2>
						<p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-fog">
							{fileSummary}. everythings-vibe sedang memahami teknologi,
							struktur project, dependensi, dan modul utama.
						</p>
						<p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-fog">
							Workspace belum tersedia sampai analisis selesai.
						</p>
						{elapsed !== null ? (
							<p
								role="timer"
								aria-label="Waktu proses analisis"
								className="mt-2 font-mono text-[11px] tabular-nums text-fog"
							>
								{elapsed.toFixed(1)}s
							</p>
						) : null}
						{errorMessage && (
							<Alert
								variant="subtle"
								role="alert"
								className="mx-auto mt-3 max-w-md border-crimson/30 bg-crimson/5 p-3 text-left text-xs text-crimson"
							>
								{errorMessage}
							</Alert>
						)}
					</>
				)}

				{/* Only a ready analysis opens the workspace. A pending or failed attempt
					used to offer "Masuk ke Workspace tanpa menunggu", which dropped the
					user into a composer whose every request fails with
					CODEBASE_CONTEXT_UNAVAILABLE. Recovery is the only exit here. */}
				{state === "failed" && (
					<div className="mt-6 flex flex-col items-stretch justify-center gap-2.5 sm:flex-row sm:items-center">
						{isInsufficientCredit ? (
							<a
								href="/settings/billing"
								className={buttonVariants({
									className:
										"h-10 bg-snow px-5 text-xs font-semibold text-onyx hover:brightness-110",
								})}
							>
								Tambahkan Kredit
							</a>
						) : (
							<Button
								type="button"
								onClick={onRetryAnalysis}
								className="h-10 bg-snow px-5 text-xs font-semibold text-onyx hover:brightness-110"
							>
								Coba analisis lagi
							</Button>
						)}
					</div>
				)}
			</section>
		</div>
	);
}
