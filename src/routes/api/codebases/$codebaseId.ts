import { createFileRoute } from "@tanstack/react-router";
import {
	handleCodebaseDelete,
	handleCodebaseRename,
} from "@/features/codebase/services/library-item-route.server";
import { guardCodebaseHandler } from "@/features/codebase/services/route-failure";

// Browser codebase item boundary (rename + delete).
//
// Server-import exception: top-level `.server` imports are correct here — this
// module registers server handlers only (no client component), following the
// neighboring `/api/codebases` pattern. Never import this route module (or the
// `.server` modules) from client code.
//
// Auth (`requireUser`), ownership-scoped rename/delete, the feature-confirmation
// decision, project tombstoning, and the `.server` helpers live in
// `src/features/codebase/services/library-item-route.server.ts`.
//
// `guardCodebaseHandler` classifies anything that escapes the handler (see
// `route-failure.ts`): transient dependency outages answer 503, real faults a
// sanitized 500, and neither becomes an unhandled TanStack Start error.

export const Route = createFileRoute("/api/codebases/$codebaseId")({
	server: {
		handlers: {
			PATCH: ({
				request,
				params,
			}: {
				request: Request;
				params: { codebaseId: string };
			}) =>
				guardCodebaseHandler("codebases/rename", () =>
					handleCodebaseRename({ request, params }),
				),
			DELETE: ({
				request,
				params,
			}: {
				request: Request;
				params: { codebaseId: string };
			}) =>
				guardCodebaseHandler("codebases/delete", () =>
					handleCodebaseDelete({ request, params }),
				),
		},
	},
});
