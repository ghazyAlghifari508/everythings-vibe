import { createFileRoute } from "@tanstack/react-router";
import { handleLegacyWorkspaceGeneration } from "@/features/codebase/services/workspace-generation-legacy.server";
import { handleAcGenerateRequest } from "@/features/greenfield/services/ac-generate.server";

export const Route = createFileRoute("/api/ac/generate")({
	server: {
		handlers: {
			POST: ({ request }: { request: Request }) =>
				handleLegacyWorkspaceGeneration(request, "ac", handleAcGenerateRequest),
		},
	},
});
