import { createFileRoute } from "@tanstack/react-router";
import { handleFileChunkUpload } from "@/features/codebase/services/sync-upload-files-route.server";

// CLI chunk upload boundary: bounded base64 chunks, per-path chunk identity,
// the 1 MiB / 50 MiB accounting, the idempotent claim, and the Bearer sync
// credential rules live in `sync-upload-files-route.server.ts`.
//
// Server-import exception: the top-level `.server` import is correct here —
// this module registers a server handler only (no client component). Never
// import it from client code.

export const Route = createFileRoute("/api/v1/codebases/$id/codebase/files")({
	server: {
		handlers: {
			POST: async ({
				request,
				params,
			}: {
				request: Request;
				params: { id: string };
			}) =>
				handleFileChunkUpload(request, params, {
					recordLifecycleEvents: true,
				}),
		},
	},
});
