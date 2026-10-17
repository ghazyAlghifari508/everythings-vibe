import { createFileRoute, redirect } from "@tanstack/react-router";
import {
	ExistingCodebaseKanbanError,
	ExistingCodebaseKanbanPage,
} from "@/features/codebase/components/planning/codebase-kanban-page";
import { loadExistingCodebaseKanban } from "@/features/codebase/services/kanban-loader.functions";

export {
	decideExistingCodebaseKanbanAccess,
	existingCodebaseKanbanInputSchema,
} from "@/features/codebase/services/kanban-loader.functions";

export const Route = createFileRoute(
	"/codebases/kanban/$codebaseId/$projectId",
)({
	loader: async ({ params }) => {
		try {
			return await loadExistingCodebaseKanban({
				data: {
					codebaseId: params.codebaseId,
					projectId: params.projectId,
				},
			});
		} catch (error) {
			if (error instanceof Error && error.message === "Unauthorized") {
				throw redirect({ to: "/login" });
			}
			throw error;
		}
	},
	head: ({ loaderData }) => ({
		meta: [
			{
				title: `${loaderData?.projectName ?? "Kanban"} · ${loaderData?.codebaseName ?? "Repository"}`,
			},
		],
	}),
	component: ExistingCodebaseKanbanRoute,
	errorComponent: ({ error, reset }) => (
		<ExistingCodebaseKanbanError error={error} onRetry={reset} />
	),
});

function ExistingCodebaseKanbanRoute() {
	return <ExistingCodebaseKanbanPage data={Route.useLoaderData()} />;
}
