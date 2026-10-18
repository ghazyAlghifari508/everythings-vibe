import { createFileRoute } from "@tanstack/react-router";
import {
	handleCodebaseSessionCreate,
	handleCodebaseSessionRead,
	handleCodebaseSessionRevoke,
} from "@/features/codebase/services/sync-session-route.server";

export const CODEBASE_SESSION_ROUTE_PATH = "/api/codebases/$codebaseId/session";

// Browser codebase sync-session boundary (read + create/retry + revoke).
//
// Server-import exception: top-level `.server` imports are correct here — this
// module registers server handlers only (no client component), following the
// neighboring `/api/codebases/$codebaseId/status` pattern. Never import this
// route module (or the `.server` modules) from client code.
//
// Auth (`requireUser`), the sync rate-limit budget, tenant isolation, credential
// minting/hashing, the advisory-lock session transaction, and the documented
// error contract live in
// `src/features/codebase/services/sync-session-route.server.ts`.

export const Route = createFileRoute("/api/codebases/$codebaseId/session")({
	server: {
		handlers: {
			GET: ({
				request,
				params,
			}: {
				request: Request;
				params: { codebaseId: string };
			}) => handleCodebaseSessionRead({ request, params }),
			POST: ({
				request,
				params,
			}: {
				request: Request;
				params: { codebaseId: string };
			}) => handleCodebaseSessionCreate({ request, params }),
			DELETE: ({
				request,
				params,
			}: {
				request: Request;
				params: { codebaseId: string };
			}) => handleCodebaseSessionRevoke({ request, params }),
		},
	},
});
