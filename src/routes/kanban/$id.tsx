import { createFileRoute, redirect, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { KanbanBoard } from "@/features/greenfield/components/kanban/kanban-board";
import { useLastRoute } from "@/features/greenfield/hooks/use-last-route";
import { loadKanban } from "@/features/greenfield/services/pipeline-loaders.functions";

export const Route = createFileRoute("/kanban/$id")({
	loader: async ({ params }) => {
		try {
			return await loadKanban({ data: params.id });
		} catch (e) {
			if (e instanceof Error && e.message === "Unauthorized")
				throw redirect({ to: "/login" });
			throw e;
		}
	},
	head: ({ loaderData }) => ({
		meta: [{ title: `${loaderData?.projectName ?? "Kanban"} - Kanban Board` }],
	}),
	component: KanbanPage,
	errorComponent: () => (
		<div className="p-10 text-center text-fog">Board tidak ditemukan.</div>
	),
});

function KanbanPage() {
	const { projectId, projectName, latestPrdContent, latestAcContent } =
		Route.useLoaderData();
	const pathname = useLocation({ select: (l) => l.pathname });
	const reportLastRoute = useLastRoute(projectId);

	useEffect(() => {
		reportLastRoute(pathname);
	}, [pathname, reportLastRoute]);
	return (
		<KanbanBoard
			projectId={projectId}
			projectName={projectName}
			latestPrdContent={latestPrdContent}
			latestAcContent={latestAcContent}
		/>
	);
}
