import { createFileRoute } from "@tanstack/react-router";
import { handleKanbanUpdateStatusRequest } from "@/features/greenfield/services/kanban-update-status.server";

export const Route = createFileRoute("/api/kanban/update-status")({
	server: {
		handlers: {
			POST: ({ request }: { request: Request }) =>
				handleKanbanUpdateStatusRequest(request),
		},
	},
});
