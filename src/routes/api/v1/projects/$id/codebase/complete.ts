import { createFileRoute } from "@tanstack/react-router";
import { handleSnapshotCompleteUpload } from "@/features/codebase/services/sync-upload-complete-route.server";

// Legacy project-scoped facade for the CLI snapshot completion boundary.
// `recordLifecycleEvents: false` keeps this historical path off the session
// lifecycle log, exactly as it behaved before the handlers were shared with
// `src/features/codebase/services/sync-upload-complete-route.server.ts`.
//
// Server-import exception: the top-level `.server` import is correct here —
// this module registers a server handler only (no client component). Never
// import it from client code.

export const Route = createFileRoute("/api/v1/projects/$id/codebase/complete")({
	server: {
		handlers: {
			POST: async ({
				request,
				params,
			}: {
				request: Request;
				params: { id: string };
			}) =>
				handleSnapshotCompleteUpload(request, params, {
					recordLifecycleEvents: false,
				}),
		},
	},
});
