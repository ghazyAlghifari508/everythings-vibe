import { createFileRoute } from "@tanstack/react-router";
import { handleFileChunkUpload } from "@/features/codebase/services/sync-upload-files-route.server";

// Legacy project-scoped facade for the CLI chunk upload boundary.
// `recordLifecycleEvents: false` keeps this historical path off the session
// lifecycle log, exactly as it behaved before the handlers were shared with
// `src/features/codebase/services/sync-upload-files-route.server.ts`.
//
// Server-import exception: the top-level `.server` import is correct here —
// this module registers a server handler only (no client component). Never
// import it from client code.

export const Route = createFileRoute("/api/v1/projects/$id/codebase/files")({
	server: {
		handlers: {
			POST: async ({
				request,
				params,
			}: {
				request: Request;
				params: { id: string };
			}) =>
				handleFileChunkUpload(request, params, {
					recordLifecycleEvents: false,
				}),
		},
	},
});
