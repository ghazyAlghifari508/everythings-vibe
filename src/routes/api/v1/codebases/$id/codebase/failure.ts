import { createFileRoute } from "@tanstack/react-router";
import { handleSyncFailureReport } from "@/features/codebase/services/sync-upload-failure-route.server";

// CLI preparation-failure boundary: the shared sync guard, the replay of an
// already-failed session, and the server-resolved failure copy live in
// `sync-upload-failure-route.server.ts`.
//
// Server-import exception: the top-level `.server` import is correct here —
// this module registers a server handler only (no client component). Never
// import it from client code.

export const Route = createFileRoute("/api/v1/codebases/$id/codebase/failure")({
	server: {
		handlers: {
			POST: async ({
				request,
				params,
			}: {
				request: Request;
				params: { id: string };
			}) => handleSyncFailureReport(request, params),
		},
	},
});
