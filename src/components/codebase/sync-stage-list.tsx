import { AlertCircle, Check, Circle, Loader2 } from "lucide-react";
import {
	resolveSyncStageView,
	type SyncStageRow,
	type SyncStageState,
	type SyncStatusResponse,
} from "@/lib/codebase-sync";
import { cn } from "@/lib/utils";

/**
 * The two sync stages a user can actually observe, and nothing else.
 *
 * Presentation only: every word and every state comes from
 * `resolveSyncStageView`, so mounting this in two different screens cannot
 * produce two different stories about the same server status. The component
 * never polls and never fetches — the owning screen supplies the reconciled
 * snapshot, which is what keeps exactly one reconciliation loop per flow.
 *
 * AI analysis is deliberately absent. It is real server work, but it belongs to
 * the conclusion step and would be a fabricated third transport stage here.
 */

// Success is an accent, not a full surface: light mode stays on the neutral
// theme-aware surface with only the check icon carrying green, while dark mode
// keeps its subtle emerald tint.
const STAGE_CLASS: Record<SyncStageState, string> = {
	done: "border-graphite bg-obsidian text-snow dark:border-emerald-500/25 dark:bg-emerald-500/10",
	active: "border-blue-500/25 bg-blue-500/10 text-blue-200",
	idle: "border-graphite bg-obsidian/70 text-fog",
	failed: "border-crimson/30 bg-crimson/10 text-crimson",
	pending: "border-graphite text-slate",
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
			<AlertCircle
				size={14}
				className="shrink-0 text-crimson"
				aria-hidden="true"
			/>
		);
	}
	if (state === "idle") {
		return (
			<Circle
				size={14}
				className="shrink-0 fill-amber-400/30 text-amber-400/90"
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
				STAGE_CLASS[row.state],
			)}
		>
			<span className="mt-0.5 shrink-0">
				<StageIcon state={row.state} />
			</span>
			<span className="flex flex-1 flex-col gap-0.5">
				<span className="font-semibold">{row.title}</span>
				<span className="leading-relaxed opacity-80">{row.detail}</span>
			</span>
			{row.meta && (
				<span className="ml-auto font-mono text-[11px] opacity-80">
					{row.meta}
				</span>
			)}
		</div>
	);
}

export function SyncStageList({
	status,
	className,
}: {
	status: SyncStatusResponse | null;
	className?: string;
}) {
	const view = resolveSyncStageView(status);

	return (
		<div className={cn("flex flex-col gap-2.5", className)}>
			<StageRow testId="sync-stage-connection" row={view.repository} />
			<StageRow testId="sync-stage-upload" row={view.source} />
			{view.excludedCount !== undefined && (
				<p className="font-mono text-[11px] text-fog">
					{view.excludedCount} file dikecualikan otomatis (rahasia, dependensi,
					build, binary)
				</p>
			)}
		</div>
	);
}
