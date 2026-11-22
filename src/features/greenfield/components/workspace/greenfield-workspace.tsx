import { useLocation } from "@tanstack/react-router";
import { type ReactNode, useEffect, useLayoutEffect } from "react";
import { useChatStore, useUIStore } from "@/store";
import { useLastRoute } from "../../hooks/use-last-route";
import type { WorkspaceProject } from "../../services/workspace-project.server";

export function GreenfieldWorkspace({
	workspace,
	children,
}: {
	workspace: WorkspaceProject;
	children: ReactNode;
}) {
	const pathname = useLocation({ select: (location) => location.pathname });
	const report = useLastRoute(workspace.projectId);
	const activeProjectId = useChatStore((store) => store.activeProjectId);
	useEffect(() => {
		report(pathname);
	}, [report, pathname]);
	useLayoutEffect(() => {
		const store = useChatStore.getState();
		if (store.activeProjectId !== workspace.projectId) {
			store.resetChat();
			store.setActiveProject(workspace.projectId);
			useUIStore.getState().setProjectDrawerOpen(false);
			useUIStore.getState().setActiveReviewModal(null);
			useUIStore.getState().closePaywallModal();
		}
	}, [workspace.projectId]);
	return (
		<section
			aria-label="VibePlan workspace"
			className="flex min-h-0 flex-1 flex-col overflow-hidden"
		>
			{activeProjectId === workspace.projectId ? children : null}
		</section>
	);
}
