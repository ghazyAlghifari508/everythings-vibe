import { createFileRoute } from "@tanstack/react-router";
import { handleCodebaseSyncHandshake } from "@/features/codebase/services/sync-handshake-route.server";

// CLI codebase-sync handshake boundary:
// `everythings-vibe codebase sync --project-id <id> --sync-token <token>`.
//
// Server-import exception: the top-level `.server` import is correct here — this
// module registers a server handler only (no client component), following the
// neighboring `/api/v1` pattern. Never import this route module (or the
// `.server` modules) from client code.
//
// Bearer-only credential resolution, the fail-closed CLI version gate, rate
// limiting, and the atomic handshake transaction live in
// `src/features/codebase/services/sync-handshake-*.server.ts`.

export const Route = createFileRoute("/api/v1/codebases/$id/codebase/sync")({
	server: {
		handlers: {
			POST: async ({
				request,
				params,
			}: {
				request: Request;
				params: { id: string };
			}) => handleCodebaseSyncHandshake({ request, params }),
		},
	},
});
