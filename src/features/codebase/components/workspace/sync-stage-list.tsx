import {
	resolveSyncStageView,
	SYNC_STAGE_ORDER,
	SYNC_STAGE_TEST_IDS,
	type SyncStageRow,
	type SyncStatusResponse,
} from "@/features/codebase/services/sync";
import { cn } from "@/lib/utils";
import { STAGE_TITLE, StageIcon, StageRow } from "./sync-stage-row";

/**
 * Clean vertical status list for codebase sync progress.
 *
 * Presentation only: every word and state comes from `resolveSyncStageView`
 * and real server events / persisted timestamps. No card-per-stage, no
 * green success cards, and no fabricated progress.
 */

const ANALYSIS_TEST_ID = "sync-stage-analysis";

/**
 * The analysis is its own capability with its own persisted attempt, so it is
 * reported on its own row. Before a verified snapshot exists it can only be
 * waiting: the CLI upload is a different operation and does not tell us
 * anything about the model yet.
 *
 * Render priority is the whole contract:
 * 1. a running attempt always beats a previous failure;
 * 2. a ready row for the current snapshot always beats a stale failure;
 * 3. a fresh failure is reported only when nothing running or ready
 *    supersedes it;
 * 4. the local retry flag (explicit user retry, cleared by the real
 *    resolution) paints running before the first poll for the new attempt.
 */
function buildAnalysisRow(input: {
	status: SyncStatusResponse | null;
	isAnalysisReady: boolean;
	analysisBlocked: boolean;
	isRetrying?: boolean;
	isWorking?: boolean;
}): SyncStageRow | null {
	const { status, isAnalysisReady, analysisBlocked, isRetrying, isWorking } =
		input;
	if (!status) return null;

	if (analysisBlocked && status.snapshotId) {
		return {
			state: "blocked",
			title: "Analisis membutuhkan kredit",
			detail: "Source code telah tersimpan.",
		};
	}

	// The live attempt is the newest persisted analysis row for this snapshot
	// (`analysisAttemptStatus`), which is what actually reports pending and
	// failed. `analysisStatus` only ever carries the ready content, so using it
	// alone made a running analysis invisible until it was already finished —
	// the exact "conclusion appeared instantly" symptom. Ready content still
	// wins whenever it exists, so a failed retry can never hide a usable result.
	const liveStatus =
		status.analysisStatus === "ready" ||
		status.analysisAttemptStatus === "ready"
			? "ready"
			: (status.analysisAttemptStatus ?? status.analysisStatus);

	if (!status.snapshotId) {
		// Analysis is its own capability: before a verified snapshot exists it has
		// not been requested, so its row waits openly instead of appearing only
		// once the upload finished.
		return { state: "waiting", title: "Analisis AI" };
	}

	if (liveStatus === "ready") {
		// Ready is terminal for the paint: it wins even while a stale local
		// retry flag has not been cleared yet.
		return {
			state: "done",
			title: "Analisis selesai",
			...(isAnalysisReady
				? {}
				: {
						detail: "Perlu pembaruan rekomendasi task awal untuk melanjutkan",
					}),
			...(status.analysisAttemptUpdatedAt
				? { completedAt: status.analysisAttemptUpdatedAt }
				: {}),
		};
	}

	if (liveStatus === "pending" || isRetrying || isWorking) {
		// A retry paints running immediately; the ready paint above wins on
		// the server real next state.
		return {
			state: "active",
			title: "Menganalisis repository...",
			...(status.analysisAttemptCreatedAt
				? { startedAt: status.analysisAttemptCreatedAt }
				: {}),
		};
	}

	if (liveStatus === "failed") {
		return { state: "failed", title: "Analisis belum berhasil" };
	}

	return { state: "waiting", title: "Analisis AI" };
}

const ACTION_BUTTON =
	"mt-1 inline-flex min-h-8 w-fit items-center rounded border border-iron bg-obsidian px-3 font-sans text-[11px] font-medium text-mist transition hover:bg-steel hover:text-snow disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo";

/** One recovery action for a credit-blocked analysis; the source is safe. */
function AnalysisBlockedRow() {
	return (
		<div
			data-testid={ANALYSIS_TEST_ID}
			data-stage-state="blocked"
			role="alert"
			className="flex items-start gap-2.5 py-1.5 px-0.5 text-[11px]"
		>
			<span className="mt-0.5 shrink-0">
				<StageIcon state="blocked" />
			</span>
			<span className="flex min-w-0 flex-1 flex-col gap-1">
				<span className={STAGE_TITLE.blocked}>Analisis membutuhkan kredit</span>
				<span className="leading-relaxed text-fog">
					Source code telah tersimpan.
				</span>
				<a href="/settings/billing" className={ACTION_BUTTON}>
					Tambahkan Kredit
				</a>
			</span>
		</div>
	);
}

export function SyncStageList({
	status,
	className,
	isAnalysisReady = false,
	analysisBlocked = false,
	showAnalysisFailure = false,
	analysisError = null,
	onRetryAnalysis,
	isAnalyzing = false,
	isRetrying = false,
}: {
	status: SyncStatusResponse | null;
	className?: string;
	isAnalysisReady?: boolean;
	/** Billing/eligibility blocked the analysis; the snapshot is still usable. */
	analysisBlocked?: boolean;
	/**
	 * Render the failed analysis as one integrated error area inside the
	 * analysis row itself (message + retry), instead of a second alert
	 * below the stage list. Owned by the screen: it combines the trigger
	 * error, the polled analysis status, and the persisted analysis record.
	 */
	showAnalysisFailure?: boolean;
	/** Safe user-facing analysis message, rendered only inside the row. */
	analysisError?: string | null;
	onRetryAnalysis?: () => void;
	isAnalyzing?: boolean;
	/** Explicit user retry awaiting the server's real next state. */
	isRetrying?: boolean;
}) {
	const view = resolveSyncStageView(status);

	if (view.stages.length === 0) return null;

	// Running beats failed: a retry replaces the failure row with honest
	// progress in the same paint, so the old error can never linger under
	// a disabled "Menganalisis..." button.
	const runningOverridesFailure =
		isRetrying || isAnalyzing || status?.analysisAttemptStatus === "pending";

	const analysisRow = buildAnalysisRow({
		status,
		isAnalysisReady,
		analysisBlocked,
		isRetrying,
		isWorking: isAnalyzing,
	});

	const formatCount = (value: number): string => value.toLocaleString("id-ID");
	const summaryParts: string[] = [];
	if (view.syncComplete && typeof status?.fileCount === "number") {
		summaryParts.push(`${formatCount(status.fileCount)} file tersinkron`);
	}
	if (view.syncComplete && typeof view.excludedCount === "number") {
		summaryParts.push(`${formatCount(view.excludedCount)} file dikecualikan`);
	}

	return (
		<div className={cn("flex flex-col gap-1 py-1", className)}>
			{view.stages.map((row, index) => {
				const key = SYNC_STAGE_ORDER[index];
				return key ? (
					<StageRow key={key} testId={SYNC_STAGE_TEST_IDS[key]} row={row} />
				) : null;
			})}
			{analysisBlocked && status?.snapshotId ? (
				<AnalysisBlockedRow />
			) : showAnalysisFailure && onRetryAnalysis && !runningOverridesFailure ? (
				<div
					data-testid={ANALYSIS_TEST_ID}
					data-stage-state="failed"
					className="flex items-start gap-2.5 py-1.5 px-0.5 text-[11px]"
				>
					<span className="mt-0.5 shrink-0">
						<StageIcon state="failed" />
					</span>
					<span className="flex min-w-0 flex-1 flex-col gap-1">
						<span
							data-testid="analysis-failure-alert"
							role="alert"
							className="flex flex-col gap-1"
						>
							<span className={STAGE_TITLE.failed}>
								Analisis belum berhasil
							</span>
							{analysisError && (
								<span className="leading-relaxed text-fog">
									{analysisError}
								</span>
							)}
							<span className="leading-relaxed text-fog">
								Snapshot yang sudah diunggah tetap tersimpan — analisis dapat
								dicoba ulang tanpa mengunggah ulang.
							</span>
							<button
								type="button"
								data-testid="retry-analysis-button"
								onClick={onRetryAnalysis}
								disabled={isAnalyzing}
								className={ACTION_BUTTON}
							>
								{isAnalyzing ? "Menganalisis..." : "Coba analisis lagi"}
							</button>
						</span>
					</span>
				</div>
			) : analysisRow ? (
				<StageRow testId={ANALYSIS_TEST_ID} row={analysisRow} />
			) : null}
			{summaryParts.length > 0 && (
				<p className="mt-1 font-mono text-[11px] tabular-nums text-fog">
					{summaryParts.join(" · ")}
				</p>
			)}
		</div>
	);
}
