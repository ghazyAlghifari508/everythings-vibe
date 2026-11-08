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
			sessionError={ws.sessionError}
			onRetrySession={ws.retrySession}
			status={ws.status}
			statusError={ws.statusError}
			onReplacePrompt={ws.replacePrompt}
			onRetrySync={ws.retrySync}
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
