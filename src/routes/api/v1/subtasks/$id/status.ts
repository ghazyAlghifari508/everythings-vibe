import { createFileRoute } from "@tanstack/react-router";
import { handleV1SubtaskStatusRequest } from "@/features/greenfield/services/v1-status-write.server";

export const Route = createFileRoute("/api/v1/subtasks/$id/status")({
	server: {
		handlers: {
			POST: ({
				params,
				request,
			}: {
				params: { id: string };
				request: Request;
			}) => handleV1SubtaskStatusRequest(request, params.id),
		},
	},
});
