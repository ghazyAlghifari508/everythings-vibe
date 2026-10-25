import { createFileRoute } from "@tanstack/react-router";
import { handleLegacyWorkspaceGeneration } from "@/features/codebase/services/workspace-generation-legacy.server";
import { handleTaskGenerateRequest } from "@/features/greenfield/services/task-generate.server";

export const Route = createFileRoute("/api/task/generate")({
	server: {
		handlers: {
			POST: ({ request }: { request: Request }) =>
				handleLegacyWorkspaceGeneration(
					request,
					"task",
					handleTaskGenerateRequest,
				),
		},
	},
});
