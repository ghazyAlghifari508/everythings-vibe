import { createFileRoute } from "@tanstack/react-router";
import { handleProjectResetProgressRequest } from "@/features/greenfield/services/project-progress.server";

export const RESET_PROGRESS_ROUTE_PATH = "/api/projects/$id/reset-progress";

export const Route = createFileRoute("/api/projects/$id/reset-progress")({
	server: {
		handlers: {
			POST: ({
				request,
				params,
			}: {
				request: Request;
				params: { id: string };
			}) => handleProjectResetProgressRequest(request, params),
		},
	},
});
