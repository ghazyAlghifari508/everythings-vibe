import { createFileRoute } from "@tanstack/react-router";
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
// `src/features/codebase/services/sync-status*.server.ts`.

export const Route = createFileRoute("/api/codebases/$codebaseId/status")({
	server: {
		handlers: {
			GET: async ({
				request,
				params,
			}: {
				request: Request;
				params: { codebaseId: string };
			}) => handleCodebaseSyncStatus({ request, params }),
		},
	},
});
