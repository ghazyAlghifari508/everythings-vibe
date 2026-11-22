"use client";
import {
	type StatusIconName,
	StatusIndicator,
	type StatusTone,
	statusIcons,
} from "@/components/ui/status-indicator";

export interface RevisionHistoryEntry {
	id: string;
	targetKind: "feature" | "prd" | "ac" | "tasks";
	instruction: string;
	status: "pending" | "approved" | "rejected";
	baseVersionId: string;
	appliedVersionId: string | null;
	approvedAt: Date | string | null;
	createdAt: Date | string;
}

const TARGET_LABELS: Record<string, string> = {
	feature: "Feature Specification",
	prd: "PRD",
	ac: "Acceptance Criteria",
	tasks: "Task Breakdown",
};

const STATUS_COPY: Record<
	"pending" | "approved" | "rejected",
	{ label: string; tone: StatusTone; icon: StatusIconName }
> = {
	approved: { label: "Diterapkan", tone: "success", icon: "success" },
	rejected: { label: "Ditolak", tone: "neutral", icon: "neutral" },
	pending: { label: "Menunggu", tone: "warning", icon: "pending" },
};

function formatWhen(value: Date | string | null): string {
	if (!value) return "";
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleString("id-ID", {
		day: "2-digit",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

/**
 * Revision history for one plan. A native disclosure keeps it out of the way
 * until asked for, and every row is a real stored proposal: no placeholder or
 * summarised entries. Renders nothing at all when the plan has no history, so an
 * untouched plan carries no empty shell.
 */
export function CodebaseRevisionHistory({
	entries,
}: {
	entries: readonly RevisionHistoryEntry[];
}) {
	if (entries.length === 0) return null;

	return (
		<details
			data-testid="codebase-revision-history"
			className="group rounded-lg border border-graphite bg-charcoal/60 text-xs"
		>
			<summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-fog hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo">
				Riwayat Revisi ({entries.length})
			</summary>
			<ul className="divide-y divide-graphite/60 border-t border-graphite">
				{entries.map((entry) => {
					const status = STATUS_COPY[entry.status] ?? STATUS_COPY.pending;
					return (
						<li
							key={entry.id}
							data-testid="codebase-revision-history-row"
							className="px-3 py-2 space-y-1"
						>
							<div className="flex items-center justify-between gap-2">
								<span className="min-w-0 truncate font-medium text-snow">
									{TARGET_LABELS[entry.targetKind] ?? entry.targetKind}
								</span>
								<StatusIndicator
									tone={status.tone}
									icon={statusIcons[status.icon]}
								>
									{status.label}
								</StatusIndicator>
							</div>
							<p className="truncate text-[11px] text-fog">
								"{entry.instruction}"
							</p>
							<p className="font-mono text-[10px] text-fog/80">
								{entry.status === "approved" && entry.approvedAt
									? `Disetujui ${formatWhen(entry.approvedAt)}`
									: entry.status === "rejected"
										? `Ditolak ${formatWhen(entry.createdAt)}`
										: `Diajukan ${formatWhen(entry.createdAt)}`}
							</p>
						</li>
					);
				})}
			</ul>
		</details>
	);
}
