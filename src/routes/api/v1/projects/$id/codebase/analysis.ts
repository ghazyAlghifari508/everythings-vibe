import { createFileRoute } from "@tanstack/react-router";
import { readCodebaseAnalysis } from "@/features/codebase/services/analysis-route-read.server";
import { triggerCodebaseAnalysis } from "@/features/codebase/services/analysis-route-trigger.server";

// Analysis trigger/read boundary (Task 6).
//
// Server-import exception: top-level `.server` imports are correct here — this
// module registers server handlers only (no client component), following the
// neighboring `/api/v1` pattern. Never import this route module (or the
// `.server` modules) from client code.
//
// Auth decision: browser session (requireUser), NOT the sync credential and
// NOT an API key. The trigger comes from the review UI after the CLI upload
// finishes; the sync credential must never leave the modal textarea, and the
// CLI itself has no model access to run analysis. Rate limiting reuses the
// sync `api_call` action like the neighboring /api/codebase browser routes.
// Codebase analysis uses adaptive credits (new attempts are billed; ready
// analysis reuse is free).
//
// Handler bodies live in `src/features/codebase/services/analysis-route-*`:
// `read` owns the GET path, `trigger` the POST path, `credits` the credit
// lifecycle tail, and `scope` the shared read/ownership primitives.

export const Route = createFileRoute("/api/v1/projects/$id/codebase/analysis")({
	server: {
		handlers: {
			GET: async ({
				request,
				params,
			}: {
				request: Request;
				params: { id: string };
			}) => readCodebaseAnalysis(request, params.id),
			POST: async ({
				request,
				params,
			}: {
				request: Request;
				params: { id: string };
			}) => triggerCodebaseAnalysis(request, params.id),
		},
	},
});
