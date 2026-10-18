import { createFileRoute } from "@tanstack/react-router";
import { handleV1ProjectDetailRequest } from "@/features/greenfield/services/v1-project-read.server";

export const Route = createFileRoute("/api/v1/projects/$id")({
	server: {
		handlers: {
			GET: ({
				params,
				request,
			}: {
				params: { id: string };
				request: Request;
			}) => handleV1ProjectDetailRequest(request, params.id),
		},
	},
});
