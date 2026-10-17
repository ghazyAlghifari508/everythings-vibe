"use client";

import type { ReactNode } from "react";
import { resolveCodebaseDisplayName } from "@/features/codebase/services/naming";

interface CodebaseChatWorkspaceHeaderProps {
	codebaseName?: string;
	featureName: string;
	planSwitcher?: ReactNode;
	kanbanProgress: { done: number; total: number; pct: number } | null;
	planningMovedOn: boolean;
	onReviewPlan?: () => void;
}

export function CodebaseChatWorkspaceHeader({
	codebaseName,
	featureName,
	planSwitcher,
	kanbanProgress,
	planningMovedOn,
	onReviewPlan,
}: CodebaseChatWorkspaceHeaderProps) {
	// Repository identity only. A feature plan title is a different identity,
	// so it is never borrowed as the repository name; when the repository is not
	// identified the header stays neutral instead of mislabeling the plan. The
	// feature name still labels the subtitle, where it is context, not identity.
	const resolvedRepoName = resolveCodebaseDisplayName(codebaseName);
	const resolvedFeatureName = resolveCodebaseDisplayName(featureName);
	const headerTitle = resolvedRepoName
		? `Workspace · ${resolvedRepoName}`
		: "Workspace · Perencanaan codebase";
	const hasLiveData = kanbanProgress !== null && kanbanProgress.total > 0;

	return (
		<>
			<div className="shrink-0 border-b border-graphite bg-charcoal px-4 py-3">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<p
							data-testid="codebase-chat-title"
							className="truncate text-sm font-semibold text-snow"
						>
							{headerTitle}
						</p>
						{resolvedRepoName ? (
							<p className="truncate text-[11px] text-fog">
								Planning workspace
							</p>
						) : resolvedFeatureName ? (
							<p className="truncate text-[11px] text-fog">
								{`Perencanaan · ${resolvedFeatureName}`}
							</p>
						) : null}
					</div>
					<div className="flex shrink-0 items-center gap-2">
						{planSwitcher}
						{hasLiveData && kanbanProgress ? (
							<span
								data-testid="codebase-kanban-badge"
								className="shrink-0 rounded-md border border-graphite bg-obsidian px-2 py-1 font-mono text-[11px] text-fog"
							>
								{`Kanban Live: ${kanbanProgress.done}/${kanbanProgress.total} Selesai (${kanbanProgress.pct}%)`}
							</span>
						) : null}
					</div>
				</div>
			</div>
			{planningMovedOn ? (
				<div
					data-testid="codebase-planning-review-notice"
					className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-amber/30 bg-amber/10 px-4 py-2 text-[11px] text-amber"
				>
					<span>
						Repository sudah disinkronkan ulang setelah planning ini dibuat.
						Planning lama tetap tersimpan — tinjau apakah masih sesuai.
					</span>
					{onReviewPlan ? (
						<button
							type="button"
							onClick={onReviewPlan}
							className="min-h-7 shrink-0 rounded-md border border-amber/40 px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
						>
							Tinjau planning
						</button>
					) : null}
				</div>
			) : null}
		</>
	);
}
