import { createFileRoute } from "@tanstack/react-router";
import { handleProjectSyncHandshake } from "@/features/codebase/services/sync-handshake-project-route.server";

// Legacy project-scoped CLI handshake boundary:
// `prdfy codebase sync --project-id <id> --sync-token <token>`.
//
// Server-import exception: the top-level `.server` import is correct here — this
// module registers a server handler only (no client component). Never import
// this route module (or the `.server` modules) from client code.
//
// Bearer-only credential resolution, the fail-closed CLI version gate, rate
// limiting, and the advisory-lock handshake transaction live in
// `src/features/codebase/services/sync-handshake-project-route.server.ts`.

export const Route = createFileRoute("/api/v1/projects/$id/codebase/sync")({
	server: {
		handlers: {
			POST: async ({
				request,
				params,
			}: {
				request: Request;
				params: { id: string };
			}) => handleProjectSyncHandshake({ request, params }),
		},
	},
});
