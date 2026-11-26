import { createFileRoute } from "@tanstack/react-router";
import { guardCodebaseHandler } from "@/features/codebase/services/route-failure";
import { handleCodebaseSyncStream } from "@/features/codebase/services/sync-progress-stream.server";

// Live sync progress boundary (Server-Sent Events).
//
// Server-import exception: top-level `.server` imports are correct here — this
// module registers a server handler only (no client component). Never import this
// route module (or the `.server` modules) from client code.
//
// The stream is scoped to one codebase and one sync session, carries the same
// payload as the polling route, and degrades to that route when unavailable.
// `guardCodebaseHandler` covers the pre-stream checks: a dependency outage must
// answer 503 (EventSource then counts a failed attempt and the client falls back
// to polling) instead of an unhandled 500.

export const Route = createFileRoute("/api/codebases/$codebaseId/sync-stream")({
	server: {
		handlers: {
			GET: async ({
				request,
				params,
			}: {
				request: Request;
				params: { codebaseId: string };
			}) =>
				guardCodebaseHandler("codebases/sync-stream", () =>
					handleCodebaseSyncStream({ request, params }),
				),
		},
	},
});
