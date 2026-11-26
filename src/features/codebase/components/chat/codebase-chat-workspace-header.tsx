"use client";

import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { resolveCodebaseDisplayName } from "@/features/codebase/services/naming";

interface CodebaseChatWorkspaceHeaderProps {
	codebaseName?: string;
	featureName?: string;
	planSwitcher?: ReactNode;
	kanbanProgress: { done: number; total: number; pct: number } | null;
	onOpenTaskProgress?: () => void;
}

export function CodebaseChatWorkspaceHeader({
	codebaseName,
	planSwitcher,
	kanbanProgress,
	onOpenTaskProgress,
}: CodebaseChatWorkspaceHeaderProps) {
	// Repository identity only. A feature plan title is a distinct identity,
	// represented separately by the plan switcher on the right; it is never
	// borrowed as repository name. When repository is not identified, the title
	// uses a neutral fallback ("Perencanaan codebase") without middle dots or em dashes.
	const resolvedRepoName = resolveCodebaseDisplayName(codebaseName);
	const headerTitle = resolvedRepoName ?? "Perencanaan codebase";
	const hasLiveData = kanbanProgress !== null && kanbanProgress.total > 0;

	return (
		<div className="shrink-0 border-b border-graphite bg-charcoal px-4 py-3">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<p
						data-testid="codebase-chat-title"
						title={headerTitle}
						className="truncate text-sm font-semibold text-snow"
					>
						{headerTitle}
					</p>
					<p
						data-testid="codebase-chat-subtitle"
						className="truncate text-[11px] text-fog"
					>
						Workspace perencanaan
					</p>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					{planSwitcher}
					{hasLiveData && kanbanProgress ? (
						<button
							type="button"
							onClick={onOpenTaskProgress}
							data-testid="codebase-kanban-badge"
							data-action="open-task-progress"
							aria-label={`Progress task · ${kanbanProgress.done}/${kanbanProgress.total} selesai`}
							title="Buka task progress di panel samping"
							className="group inline-flex shrink-0 items-center gap-1.5 rounded-md border border-graphite bg-obsidian px-2.5 py-1 text-[11px] font-medium text-snow transition-all duration-150 hover:border-graphite/80 hover:bg-graphite/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo/50 active:scale-[0.98]"
						>
							<span className="font-mono text-fog group-hover:text-snow">
								{`Progress task · ${kanbanProgress.done}/${kanbanProgress.total} selesai`}
							</span>
							<Icon
								icon={ArrowRight01Icon}
								size={12}
								aria-hidden="true"
								className="text-slate transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-snow"
							/>
						</button>
					) : null}
				</div>
			</div>
		</div>
	);
}
