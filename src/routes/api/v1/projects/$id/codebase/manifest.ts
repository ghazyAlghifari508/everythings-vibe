import { createFileRoute } from "@tanstack/react-router";
import { handleManifestBatchUpload } from "@/features/codebase/services/sync-upload-manifest-route.server";

// Legacy project-scoped facade for the CLI manifest upload boundary.
// `recordLifecycleEvents: false` keeps this historical path off the session
// lifecycle log, exactly as it behaved before the handlers were shared with
// `src/features/codebase/services/sync-upload-manifest-route.server.ts`.
//
// Server-import exception: the top-level `.server` import is correct here —
// this module registers a server handler only (no client component). Never
// import it from client code.

export const Route = createFileRoute("/api/v1/projects/$id/codebase/manifest")({
	server: {
		handlers: {
			POST: async ({
				request,
				params,
			}: {
				request: Request;
				params: { id: string };
			}) =>
				handleManifestBatchUpload(request, params, {
					recordLifecycleEvents: false,
				}),
		},
	},
});
