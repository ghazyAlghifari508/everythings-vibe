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
	onChangeRevisionTarget,
	composer,
}: {
	composerMode: string;
	revisionTarget?: "feature" | "prd" | "ac" | "tasks";
	revisionHistory?: readonly RevisionHistoryEntry[];
	onChangeRevisionTarget?: (target: "feature" | "prd" | "ac" | "tasks") => void;
	composer: ReactNode;
}) {
	return (
		<div className="shrink-0 bg-transparent px-4 pb-4 pt-2">
			<div className="mx-auto w-full max-w-3xl">
				{composerMode === "revise" ? (
					<>
						<CodebaseRevisionHistory entries={revisionHistory ?? []} />
						<CodebaseChatWorkspaceRevisionTargetSelector
							selected={revisionTarget}
							onChange={onChangeRevisionTarget}
						/>
					</>
				) : null}
				{composer}
			</div>
		</div>
	);
}
