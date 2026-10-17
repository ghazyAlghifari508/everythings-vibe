import { createFileRoute } from "@tanstack/react-router";
import { handleSnapshotCompleteUpload } from "@/features/codebase/services/sync-upload-complete-route.server";

// CLI snapshot completion boundary: the verified counts/hashes contract, the
// idempotent claim, and the Bearer sync credential rules live in
// `sync-upload-complete-route.server.ts`.
//
// Server-import exception: the top-level `.server` import is correct here —
// this module registers a server handler only (no client component). Never
// import it from client code.

export const Route = createFileRoute("/api/v1/codebases/$id/codebase/complete")(
	{
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
						recordLifecycleEvents: true,
					}),
			},
		},
	},
);
