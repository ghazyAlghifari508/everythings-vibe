"use client";

import { AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import type { AnalysisResponse } from "@/lib/codebase-analysis";
import type { SyncStatusResponse } from "@/lib/codebase-sync";
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
	analysis: AnalysisResponse | null;
	isAnalyzing: boolean;
}): ConclusionState {
	const { snapshotId, snapshotAnalysisStatus, analysis, isAnalyzing } = input;
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
	if (analysisFailed || snapshotAnalysisStatus === "failed") return "failed";
	return "analyzing";
}

export function CodebaseConclusion({
	snapshot,
	analysis,
	isAnalyzing,
	errorMessage,
	onRetryAnalysis,
	onEnterWorkspace,
	onBackToSync,
}: CodebaseConclusionProps) {
	const state = resolveConclusionState({
		snapshotId: snapshot.snapshotId,
		snapshotAnalysisStatus: snapshot.analysisStatus,
		analysis,
		isAnalyzing,
	});

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
							<AlertCircle
								size={18}
								className="shrink-0 text-crimson"
								aria-hidden="true"
							/>
						</span>
						<h2 className="font-inter text-lg font-[620] text-snow">
							Analisis belum berhasil
						</h2>
						<p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-fog">
							Repository sudah berhasil disinkronkan, tetapi ringkasan belum
							dapat disiapkan.
						</p>
						{errorMessage && (
							<p role="alert" className="mt-3 text-xs text-crimson">
								{errorMessage}
							</p>
						)}
					</>
				) : (
					<>
						<span className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full border border-graphite bg-obsidian">
							<Loader2
								size={18}
								className="shrink-0 animate-spin text-fog"
								aria-hidden="true"
							/>
						</span>
						<h2 className="font-inter text-lg font-[620] text-snow">
							Menganalisis codebase
						</h2>
						<p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-fog">
							Sinkronisasi repository sudah selesai. VibeEverything sedang
							memahami teknologi, struktur project, dependensi, dan modul utama.
						</p>
						{errorMessage && (
							<p role="alert" className="mt-3 text-xs text-crimson">
								{errorMessage}
							</p>
						)}
					</>
				)}

				<div className="mt-6 flex flex-col items-stretch justify-center gap-2.5 sm:flex-row sm:items-center">
					{state === "failed" && (
						<button
							type="button"
							onClick={onRetryAnalysis}
							className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-graphite bg-obsidian px-4 text-xs font-medium text-mist transition hover:border-steel hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
						>
							Coba analisis lagi
						</button>
					)}
					<button
						type="button"
						data-testid="conclusion-enter-workspace"
						onClick={onEnterWorkspace}
						className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md bg-snow px-5 text-xs font-semibold text-onyx transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
					>
						{state === "analyzing"
							? "Masuk ke Workspace tanpa menunggu"
							: "Masuk ke Workspace"}
						<ArrowRight size={14} aria-hidden="true" />
					</button>
				</div>
			</section>
		</div>
	);
}
