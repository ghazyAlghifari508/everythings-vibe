import { createFileRoute } from "@tanstack/react-router";
import { handleLegacyWorkspaceGeneration } from "@/features/codebase/services/workspace-generation-legacy.server";
import { handleAskOptionsRequest } from "@/features/greenfield/services/ask-options-route.server";

export const Route = createFileRoute("/api/ask/options")({
	server: {
		handlers: {
			POST: ({ request }: { request: Request }) =>
				handleLegacyWorkspaceGeneration(
					request,
					"questions",
					handleAskOptionsRequest,
				),
		},
	},
});
