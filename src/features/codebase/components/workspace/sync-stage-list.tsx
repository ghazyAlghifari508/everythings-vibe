import {
	AlertCircleIcon,
	CircleIcon,
	Loading01Icon,
	Tick01Icon,
} from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import {
	resolveSyncStageView,
	SYNC_STAGE_ORDER,
	SYNC_STAGE_TEST_IDS,
	type SyncStageRow,
	type SyncStageState,
	type SyncStatusResponse,
} from "@/features/codebase/services/sync";
import { cn } from "@/lib/utils";

/**
 * Clean vertical status list for codebase sync progress.
 *
 * Presentation only: every word and state comes from `resolveSyncStageView`
 * and real server events / persisted timestamps. No card-per-stage, no
 * green success cards, and no fabricated progress.
 */

const STAGE_TITLE: Record<SyncStageState, string> = {
	done: "font-medium text-snow",
	active: "font-semibold text-snow",
	waiting: "font-normal text-fog",
	failed: "font-semibold text-crimson",
};

function StageIcon({ state }: { state: SyncStageState }) {
	if (state === "done") {
		return (
			<Icon
				icon={Tick01Icon}
				size={14}
				className="shrink-0 font-bold text-emerald-400"
				aria-hidden="true"
			/>
		);
	}
	if (state === "active") {
		return (
			<Icon
				icon={Loading01Icon}
				size={14}
				className="shrink-0 animate-spin text-blue-400"
				aria-hidden="true"
			/>
		);
	}
	if (state === "failed") {
		return (
			<Icon
				icon={AlertCircleIcon}
				size={14}
				className="shrink-0 text-crimson"
				aria-hidden="true"
			/>
		);
	}
	return (
		<Icon
			icon={CircleIcon}
			size={14}
			className="shrink-0 text-graphite"
			aria-hidden="true"
		/>
	);
}

/**
 * Live elapsed seconds since a real server-recorded start. Ticks only while a
 * stage is active, and renders nothing when the backend never recorded a
 * start — the timer measures, it never guesses.
 */
function useElapsedSeconds(startedAt: string | undefined): number | null {
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

/** Real completion time, rendered as a short local clock reading. */
function formatCompletedAt(value: string): string | null {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date.toLocaleTimeString("id-ID", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

function StageRow({ testId, row }: { testId: string; row: SyncStageRow }) {
	const elapsed = useElapsedSeconds(row.startedAt);
	const completedAt = row.completedAt
		? formatCompletedAt(row.completedAt)
		: null;
	return (
		<div
			data-testid={testId}
			data-stage-state={row.state}
			className="flex items-start gap-2.5 py-1.5 px-0.5 text-[11px] transition-colors"
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
			{row.meta ||
			completedAt ||
			(row.state === "active" && elapsed !== null) ? (
				<span className="ml-auto flex shrink-0 items-center gap-2">
					{row.meta ? (
						<span className="font-mono text-[11px] text-fog">{row.meta}</span>
					) : null}
					{row.state === "active" && elapsed !== null ? (
						<span
							role="timer"
							aria-label="Waktu proses"
							className="font-mono text-[11px] tabular-nums text-fog"
						>
							{elapsed.toFixed(1)}s
						</span>
					) : completedAt ? (
						<span className="font-mono text-[11px] tabular-nums text-fog">
							{completedAt}
						</span>
					) : null}
				</span>
			) : null}
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

	// The live attempt is the newest persisted analysis row for this snapshot
	// (`analysisAttemptStatus`), which is what actually reports pending and
	// failed. `analysisStatus` only ever carries the ready content, so using it
	// alone made a running analysis invisible until it was already finished —
	// the exact "conclusion appeared instantly" symptom. Ready content still
	// wins whenever it exists, so a failed retry can never hide a usable result.
	const liveAnalysisStatus =
		status?.analysisStatus === "ready"
			? "ready"
			: (status?.analysisAttemptStatus ?? status?.analysisStatus);
	const hasAnalysisStage = Boolean(status?.snapshotId && liveAnalysisStatus);
	let analysisRow: SyncStageRow | null = null;
	if (hasAnalysisStage && liveAnalysisStatus) {
		if (liveAnalysisStatus === "pending") {
			analysisRow = {
				state: "active",
				title: "Menganalisis codebase",
				detail: "AI sedang membaca arsitektur dan menyiapkan rekomendasi",
				// Real start time of this attempt: drives a measured elapsed
				// timer instead of an indeterminate spinner.
				...(status?.analysisAttemptCreatedAt
					? { startedAt: status.analysisAttemptCreatedAt }
					: {}),
			};
		} else if (liveAnalysisStatus === "failed") {
			analysisRow = {
				state: "failed",
				title: "Menganalisis codebase",
				detail: "Analisis belum berhasil diselesaikan",
			};
		} else if (liveAnalysisStatus === "ready") {
			if (isAnalysisReady) {
				analysisRow = {
					state: "done",
					title: "Kesimpulan siap",
					detail: "Ringkasan arsitektur dan rekomendasi task awal tersedia",
					...(status?.analysisAttemptUpdatedAt
						? { completedAt: status.analysisAttemptUpdatedAt }
						: {}),
				};
			} else {
				analysisRow = {
					state: "done",
					title: "Analisis selesai",
					detail: "Perlu pembaruan rekomendasi task awal untuk melanjutkan",
					...(status?.analysisAttemptUpdatedAt
						? { completedAt: status.analysisAttemptUpdatedAt }
						: {}),
				};
			}
		}
	}

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
			{showAnalysisFailure && onRetryAnalysis ? (
				<div
					data-testid="sync-stage-analysis"
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
				<p className="mt-1 font-mono text-[11px] tabular-nums text-fog">
					{summaryParts.join(" · ")}
				</p>
			)}
		</div>
	);
}
