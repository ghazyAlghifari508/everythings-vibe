import { createFileRoute } from "@tanstack/react-router";
import { handleTaskGenerateRequest } from "@/features/greenfield/services/task-generate.server";

export const Route = createFileRoute("/api/task/generate")({
	server: {
		handlers: {
			POST: ({ request }: { request: Request }) =>
				handleTaskGenerateRequest(request),
		},
	},
});
