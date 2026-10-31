"use client";

import { CodebaseResyncModal } from "@/features/codebase/components/planning/codebase-resync-modal";
import type { useCodebaseWorkspace } from "../../hooks/use-codebase-workspace";

export function CodebaseWorkspaceResync({
	projectName,
	ws,
}: {
	projectName: string;
	ws: ReturnType<typeof useCodebaseWorkspace>;
}) {
	return (
		<CodebaseResyncModal
			isOpen={ws.isResyncDrawerOpen}
			onClose={() => ws.setIsResyncDrawerOpen(false)}
			projectName={projectName}
			payload={ws.payload}
			isStarting={ws.isStarting}
			creditMaximum={ws.creditPreflight?.maximumCredits ?? null}
			creditFree={ws.creditPreflight?.code === "FREE_ALLOWANCE_AVAILABLE"}
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
