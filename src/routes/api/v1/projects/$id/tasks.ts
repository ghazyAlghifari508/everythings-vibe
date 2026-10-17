import { createFileRoute } from "@tanstack/react-router";
import { handleV1ProjectTasksRequest } from "@/features/greenfield/services/v1-project-read.server";

export const Route = createFileRoute("/api/v1/projects/$id/tasks")({
	server: {
		handlers: {
			GET: ({
				params,
				request,
			}: {
				params: { id: string };
				request: Request;
			}) => handleV1ProjectTasksRequest(request, params.id),
		},
	},
});
