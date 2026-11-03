"use client";

import type { ReactNode } from "react";
import type { RevisionHistoryEntry } from "../revision/codebase-revision-history";
import { CodebaseRevisionHistory } from "../revision/codebase-revision-history";
import { CodebaseChatWorkspaceRevisionTargetSelector } from "./codebase-chat-workspace-revision-controls";

/**
 * Footer area under the transcript: revision context (target picker + stored
 * history) sits directly above the composer only while the composer's next
 * message would revise an existing plan. Creating or clarifying hides it, so a
 * plan that cannot be revised never shows revision chrome.
 */
export function CodebaseChatWorkspaceComposerDock({
	composerMode,
	revisionTarget,
	revisionHistory,
	isRevisingCompletedPlan = false,
	onChangeRevisionTarget,
	onCancelCompletedRevision,
	composer,
}: {
	composerMode: string;
	revisionTarget?: "feature" | "prd" | "ac" | "tasks";
	revisionHistory?: readonly RevisionHistoryEntry[];
	isRevisingCompletedPlan?: boolean;
	onChangeRevisionTarget?: (target: "feature" | "prd" | "ac" | "tasks") => void;
	onCancelCompletedRevision?: () => void;
	composer: ReactNode;
}) {
	return (
		<div className="shrink-0 bg-transparent px-4 pb-4 pt-2">
			<div className="mx-auto w-full max-w-3xl">
				{composerMode === "revise" ? (
					<>
						<CodebaseRevisionHistory entries={revisionHistory ?? []} />
						<div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
							<CodebaseChatWorkspaceRevisionTargetSelector
								selected={revisionTarget}
								onChange={onChangeRevisionTarget}
							/>
							{isRevisingCompletedPlan && onCancelCompletedRevision ? (
								<button
									type="button"
									onClick={onCancelCompletedRevision}
									data-testid="codebase-cancel-completed-revision-dock"
									className="inline-flex min-h-7 items-center rounded border border-graphite bg-charcoal px-2.5 text-[11px] font-medium text-fog transition-colors hover:border-steel hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
								>
									Batal Revisi
								</button>
							) : null}
						</div>
					</>
				) : null}
				{composer}
			</div>
		</div>
	);
}
