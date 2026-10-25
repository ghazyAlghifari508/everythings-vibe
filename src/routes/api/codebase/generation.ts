import { createFileRoute } from "@tanstack/react-router";
import {
	handleWorkspaceGenerationGet,
	handleWorkspaceGenerationPost,
} from "@/features/codebase/services/workspace-generation-route.server";

export const Route = createFileRoute("/api/codebase/generation")({
	server: {
		handlers: {
			GET: ({ request }) => handleWorkspaceGenerationGet(request),
			POST: ({ request }) => handleWorkspaceGenerationPost(request),
		},
	},
});
