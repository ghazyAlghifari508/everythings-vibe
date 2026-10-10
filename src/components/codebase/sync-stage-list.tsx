import { Check, Circle, Loader2 } from "lucide-react";
import {
	resolveSyncStageView,
	SYNC_STAGE_ORDER,
	SYNC_STAGE_TEST_IDS,
	type SyncStageRow,
	type SyncStageState,
	type SyncStatusResponse,
} from "@/lib/codebase-sync";
import { cn } from "@/lib/utils";

/**
 * The three sync stages a user can actually observe, and nothing else.
 *
 * Presentation only: every word and every state comes from
 * `resolveSyncStageView`, so mounting this in two different screens cannot
 * produce two different stories about the same server status. The component
 * never polls and never fetches — the owning screen supplies the reconciled
 * snapshot, which is what keeps exactly one reconciliation loop per flow.
 *
 * The list is withheld entirely when the state is unknown or the attempt failed,
 * because neither case supports a truthful per-stage claim.
 *
 * AI analysis is deliberately absent. It is real server work, but it belongs to
 * the conclusion step and would be a fabricated stage here.
 */

// Surfaces only; the title and description weights/colors are set per state
// below so a completed row stays on the neutral surface with just the check
// icon carrying success, in both light and dark mode.
const STAGE_SURFACE: Record<SyncStageState, string> = {
	done: "border-graphite bg-obsidian dark:border-emerald-500/25 dark:bg-emerald-500/10",
	active: "border-blue-500/25 bg-blue-500/10",
	waiting: "border-graphite/70 bg-transparent",
	failed: "border-crimson/30 bg-crimson/10",
};

const STAGE_TITLE: Record<SyncStageState, string> = {
	done: "font-medium text-snow",
	active: "font-semibold text-snow",
	waiting: "font-medium text-fog",
	failed: "font-semibold text-snow",
};

function StageIcon({ state }: { state: SyncStageState }) {
	if (state === "done") {
		return (
			<Check
				size={14}
				className="shrink-0 font-bold text-emerald-600 dark:text-emerald-400"
				aria-hidden="true"
			/>
		);
	}
	if (state === "active") {
		return (
			<Loader2
				size={14}
				className="shrink-0 animate-spin text-blue-400"
				aria-hidden="true"
			/>
		);
	}
	if (state === "failed") {
		return (
			<Circle
				size={14}
				className="shrink-0 fill-crimson/40 text-crimson"
				aria-hidden="true"
			/>
		);
	}
	return (
		<Circle size={14} className="shrink-0 text-slate" aria-hidden="true" />
	);
}

function StageRow({ testId, row }: { testId: string; row: SyncStageRow }) {
	return (
		<div
			data-testid={testId}
			data-stage-state={row.state}
			className={cn(
				"flex items-start gap-2.5 rounded-md border p-3 text-[11px] transition-colors",
				STAGE_SURFACE[row.state],
			)}
		>
			<span className="mt-0.5 shrink-0">
				<StageIcon state={row.state} />
			</span>
			<span className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className={STAGE_TITLE[row.state]}>{row.title}</span>
				{row.detail && (
					<span className="leading-relaxed text-fog">{row.detail}</span>
				)}
			</span>
			{row.meta && (
				<span className="ml-auto shrink-0 font-mono text-[11px] text-fog">
					{row.meta}
				</span>
			)}
		</div>
	);
}

export function SyncStageList({
	status,
	className,
	isAnalysisReady = false,
	showAnalysisFailure = false,
	analysisError = null,
	onRetryAnalysis,
	isAnalyzing = false,
}: {
	status: SyncStatusResponse | null;
	className?: string;
	isAnalysisReady?: boolean;
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
}) {
	const view = resolveSyncStageView(status);

	if (view.stages.length === 0) return null;

	const hasAnalysisStage = Boolean(
		status?.snapshotId && status?.analysisStatus,
	);
	let analysisRow: SyncStageRow | null = null;
	if (hasAnalysisStage && status?.analysisStatus) {
		if (status.analysisStatus === "pending") {
			analysisRow = {
				state: "active",
				title: "Menganalisis codebase",
				detail: "AI sedang membaca arsitektur dan menyiapkan rekomendasi",
			};
		} else if (status.analysisStatus === "failed") {
			analysisRow = {
				state: "failed",
				title: "Menganalisis codebase",
				detail: "Analisis belum berhasil diselesaikan",
			};
		} else if (status.analysisStatus === "ready") {
			if (isAnalysisReady) {
				analysisRow = {
					state: "done",
					title: "Kesimpulan siap",
					detail: "Ringkasan arsitektur dan rekomendasi task awal tersedia",
				};
			} else {
				analysisRow = {
					state: "done",
					title: "Analisis selesai",
					detail: "Perlu pembaruan rekomendasi task awal untuk melanjutkan",
				};
			}
		}
	}

	const formatCount = (value: number): string => value.toLocaleString("id-ID");
	const summaryParts: string[] = [];
	if (view.syncComplete && status?.fileCount !== undefined) {
		summaryParts.push(`${formatCount(status.fileCount)} file tersinkron`);
	}
	if (view.syncComplete && view.excludedCount !== undefined) {
		summaryParts.push(`${formatCount(view.excludedCount)} file dikecualikan`);
	}

	return (
		<div className={cn("flex flex-col gap-2.5", className)}>
			{view.stages.map((row, index) => {
				const key = SYNC_STAGE_ORDER[index];
				return key ? (
					<StageRow key={key} testId={SYNC_STAGE_TEST_IDS[key]} row={row} />
				) : null;
			})}
			{showAnalysisFailure && onRetryAnalysis ? (
				<div
					data-testid="sync-stage-analysis"
					data-stage-state="failed"
					className={cn(
						"flex items-start gap-2.5 rounded-md border p-3 text-[11px] transition-colors",
						STAGE_SURFACE.failed,
					)}
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
								Analisis codebase belum berhasil
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
								className="mt-1 inline-flex min-h-8 w-fit items-center rounded border border-iron bg-obsidian px-3 font-sans text-[11px] font-medium text-mist transition hover:bg-steel hover:text-snow disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
							>
								{isAnalyzing ? "Menganalisis..." : "Coba lagi analisis"}
							</button>
						</span>
					</span>
				</div>
			) : (
				analysisRow && (
					<StageRow testId="sync-stage-analysis" row={analysisRow} />
				)
			)}
			{summaryParts.length > 0 && (
				<p className="font-mono text-[11px] tabular-nums text-fog">
					{summaryParts.join(" · ")}
				</p>
			)}
		</div>
	);
}
