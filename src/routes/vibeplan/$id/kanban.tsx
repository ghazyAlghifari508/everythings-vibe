import { createFileRoute, redirect } from "@tanstack/react-router";
import { KanbanBoard } from "@/features/greenfield/components/kanban/kanban-board";
import { loadKanban } from "@/features/greenfield/services/pipeline-loaders.functions";

export const Route = createFileRoute("/vibeplan/$id/kanban")({
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
	return (
		<KanbanBoard
			key={projectId}
			projectId={projectId}
			projectName={projectName}
			latestPrdContent={latestPrdContent}
			latestAcContent={latestAcContent}
		/>
	);
}
