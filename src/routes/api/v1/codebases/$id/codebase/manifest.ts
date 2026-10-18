import { createFileRoute } from "@tanstack/react-router";
import { handleManifestBatchUpload } from "@/features/codebase/services/sync-upload-manifest-route.server";

// CLI manifest upload boundary: batch merge against the stored manifest,
// idempotent batch replay, the idempotent claim, and the Bearer sync credential
// rules live in `sync-upload-manifest-route.server.ts`.
//
// Server-import exception: the top-level `.server` import is correct here —
// this module registers a server handler only (no client component). Never
// import it from client code.

export const Route = createFileRoute("/api/v1/codebases/$id/codebase/manifest")(
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
					handleManifestBatchUpload(request, params, {
						recordLifecycleEvents: true,
					}),
			},
		},
	},
);
