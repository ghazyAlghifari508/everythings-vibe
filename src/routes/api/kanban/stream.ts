import { createFileRoute } from "@tanstack/react-router";
import { handleKanbanStreamRequest } from "@/features/greenfield/services/kanban-stream.server";

export const Route = createFileRoute("/api/kanban/stream")({
	server: {
		handlers: {
			GET: ({ request }: { request: Request }) =>
				handleKanbanStreamRequest(request),
		},
	},
});
