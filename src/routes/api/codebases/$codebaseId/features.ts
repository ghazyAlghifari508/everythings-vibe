import { createFileRoute } from "@tanstack/react-router";
import { handleCodebaseFeatureCreate } from "@/features/codebase/services/feature-project-route.server";

// Browser feature-plan boundary for a synced repository.
//
// Server-import exception: top-level `.server` imports are correct here — this
// module registers server handlers only (no client component), following the
// neighboring `/api/codebases/$codebaseId/status` pattern. Never import this
// route module (or the `.server` modules) from client code.
//
// Auth (`requireUser`), the sync rate-limit budget, ownership and synced-snapshot
// checks, project creation, and the ask-handoff write live in
// `src/features/codebase/services/feature-project-route.server.ts`.

export const Route = createFileRoute("/api/codebases/$codebaseId/features")({
	server: {
		handlers: {
			POST: ({
				request,
				params,
			}: {
				request: Request;
				params: { codebaseId: string };
			}) => handleCodebaseFeatureCreate({ request, params }),
		},
	},
});
