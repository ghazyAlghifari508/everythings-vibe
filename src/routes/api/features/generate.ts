import { createFileRoute } from "@tanstack/react-router";
import { handleLegacyWorkspaceGeneration } from "@/features/codebase/services/workspace-generation-legacy.server";
import { handleFeatureGenerateRequest } from "@/features/greenfield/services/feature-generate.server";

export const Route = createFileRoute("/api/features/generate")({
	server: {
		handlers: {
			POST: ({ request }: { request: Request }) =>
				handleLegacyWorkspaceGeneration(
					request,
					"feature",
					handleFeatureGenerateRequest,
				),
		},
	},
});
