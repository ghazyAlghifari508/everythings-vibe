"use client";

import { useMemo } from "react";
import { CodebaseResyncModal } from "@/features/codebase/components/planning/codebase-resync-modal";
import { buildLockedPrompt } from "@/features/codebase/components/workspace/locked-prompt-state";
import type { useCodebaseWorkspace } from "../../hooks/use-codebase-workspace";

export function CodebaseWorkspaceResync({
	projectName,
	ws,
}: {
	projectName: string;
	ws: ReturnType<typeof useCodebaseWorkspace>;
}) {
	// Re-sync follows the same policy as onboarding: the prompt takes over the
	// moment the account cannot start a billed sync, and the only way out is a
	// real top-up or one approval for a changed quote.
	const lockedPrompt = useMemo(
		() =>
			buildLockedPrompt(ws.creditPreflight, {
				onApprove: () => void ws.startSession("retry"),
				onTopUpClose: () => void ws.startSession("retry"),
				isApproving: ws.isStarting,
			}),
		[ws.creditPreflight, ws.isStarting, ws.startSession],
	);

	return (
		<CodebaseResyncModal
			isOpen={ws.isResyncDrawerOpen}
			onClose={() => ws.setIsResyncDrawerOpen(false)}
			projectName={projectName}
			payload={ws.payload}
			isStarting={ws.isStarting}
			creditMaximum={ws.creditPreflight?.maximumCredits ?? null}
			creditFree={ws.creditPreflight?.code === "FREE_ALLOWANCE_AVAILABLE"}
			lockedPrompt={lockedPrompt}
			status={ws.status}
			statusError={ws.error}
			onRequestNewToken={() => void ws.startSession("retry")}
			onRetrySync={() => void ws.startSession("retry")}
			analysis={ws.analysis}
			isAnalyzing={ws.isWorking}
			activeSessionId={ws.activeSessionId}
			onRetryAnalysis={
				ws.activeWorkspaceSnapshotId
					? () => {
							if (ws.activeWorkspaceSnapshotId) {
								void ws.triggerAnalysis(ws.activeWorkspaceSnapshotId);
							}
						}
					: undefined
			}
		/>
	);
}
