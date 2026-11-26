import { createFileRoute } from "@tanstack/react-router";
import { handleCodebaseSyncConnect } from "@/features/codebase/services/sync-connect-route.server";

// CLI attempt-announcement boundary:
// `everythings-vibe codebase sync` POSTs here before it resolves the local root
// and before its handshake, so the browser can render a connecting phase from a
// real server-observed event. Additive: an older CLI simply skips it, and the
// handshake below remains the operation that binds everything.
//
// Server-import exception: this module registers a server handler only (no
// client component), following the neighboring `/api/v1` pattern. Never import
// this route module (or the `.server` modules) from client code.

export const Route = createFileRoute("/api/v1/codebases/$id/codebase/connect")({
	server: {
		handlers: {
			POST: async ({
				request,
				params,
			}: {
				request: Request;
				params: { id: string };
			}) => handleCodebaseSyncConnect({ request, params }),
		},
	},
});
