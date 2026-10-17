import { createFileRoute } from "@tanstack/react-router";
import { handleProjectStepRequest } from "@/features/greenfield/services/project-progress.server";

export const Route = createFileRoute("/api/projects/$id/step")({
	server: {
		handlers: {
			POST: ({
				request,
				params,
			}: {
				request: Request;
				params: { id: string };
			}) => handleProjectStepRequest(request, params),
		},
	},
});
