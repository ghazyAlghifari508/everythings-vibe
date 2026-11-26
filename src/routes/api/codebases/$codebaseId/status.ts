import { createFileRoute } from "@tanstack/react-router";
import { guardCodebaseHandler } from "@/features/codebase/services/route-failure";
import { handleCodebaseSyncStatus } from "@/features/codebase/services/sync-status.server";

// Browser sync-status polling boundary.
//
// Server-import exception: top-level `.server` imports are correct here — this
// module registers a server handler only (no client component), following the
// neighboring `/api/codebases` pattern. Never import this route module (or the
// `.server` modules) from client code.
//
// Auth (`requireUser`), tenant isolation, the polling rate-limit budget, and the
// documented error contract live in
// `src/features/codebase/services/sync-status*.server.ts`. The handler
// classifies its own failures (client abort, transient outage, real fault);
// `guardCodebaseHandler` only covers what would otherwise escape unclassified.

export const Route = createFileRoute("/api/codebases/$codebaseId/status")({
	server: {
		handlers: {
			GET: async ({
				request,
				params,
			}: {
				request: Request;
				params: { codebaseId: string };
			}) =>
				guardCodebaseHandler("codebases/status", () =>
					handleCodebaseSyncStatus({ request, params }),
				),
		},
	},
});
