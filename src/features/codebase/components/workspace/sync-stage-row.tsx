// The row primitives shared by the sync stage list.
//
// Extracted so the stage list stays a composition file. Nothing here decides a
// stage state: every state, timestamp, and count is handed in by
// `resolveSyncStageView` or the analysis contract that owns it.
import {
	AlertCircleIcon,
	CircleIcon,
	Tick01Icon,
} from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import type {
	SyncStageRow,
	SyncStageState,
} from "@/features/codebase/services/sync";

export const STAGE_TITLE: Record<SyncStageState, string> = {
	done: "font-medium text-snow",
	active: "font-semibold text-snow",
	waiting: "font-normal text-fog",
	failed: "font-semibold text-crimson",
	blocked: "font-semibold text-amber-400",
};

/** The one set of row indicators: checkmark, spinner, neutral dot, error. */
export function StageIcon({ state }: { state: SyncStageState }) {
	if (state === "done") {
		return (
			<Icon
				icon={Tick01Icon}
				size={14}
				className="shrink-0 text-emerald-400"
				aria-hidden="true"
			/>
		);
	}
	if (state === "active") {
		return <Spinner size={14} className="text-blue-400" />;
	}
	if (state === "blocked") {
		return (
			<Icon
				icon={AlertCircleIcon}
				size={14}
				className="shrink-0 text-amber-400"
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

export function StageRow({
	testId,
	row,
}: {
	testId: string;
	row: SyncStageRow;
}) {
	const elapsed = useElapsedSeconds(row.startedAt);
	const completedAt = row.completedAt
		? formatCompletedAt(row.completedAt)
		: null;
	return (
		<div
			data-testid={testId}
			data-stage-state={row.state}
			className="flex items-start gap-2.5 py-1.5 text-[11px] transition-colors"
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
