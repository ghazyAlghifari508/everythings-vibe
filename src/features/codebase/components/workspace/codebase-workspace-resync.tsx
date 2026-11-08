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
	const lockedPrompt = useMemo(
		() =>
			buildLockedPrompt(ws.creditPreflight, {
				onTopUpClose: () => void ws.startSession("resync"),
			}),
		[ws.creditPreflight, ws.startSession],
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
			onRequestNewToken={
				!ws.status ||
				["waiting_for_cli", "expired", "failed"].includes(ws.status.status)
					? () => void ws.startSession(ws.status ? "retry" : "resync")
					: undefined
			}
			onRetrySync={
				ws.status && ["expired", "failed"].includes(ws.status.status)
					? () => void ws.startSession("retry")
					: () => void ws.startSession("resync")
			}
			analysis={ws.analysis}
			isAnalyzing={ws.isWorking}
			activeSessionId={ws.activeSessionId}
			onRetryAnalysis={
				ws.status?.snapshotId
					? () => {
							if (ws.status?.snapshotId) {
								ws.analysisAttemptedFor.current = null;
								void ws.triggerAnalysis(ws.status.snapshotId);
							}
						}
					: undefined
			}
		/>
	);
}
