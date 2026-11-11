import { createFileRoute } from "@tanstack/react-router";
import {
	handleFeatureDelete,
	handleFeaturePlanPatch,
	type FeaturePlanMutationParams,
} from "@/features/codebase/services/feature-plan-mutations.server";
import { guardCodebaseHandler } from "@/features/codebase/services/route-failure";

// Browser feature-plan boundary for one feature of a synced repository:
// rename, archive/unarchive (PATCH), and permanent deletion (DELETE).
//
// Server-import exception: top-level `.server` imports are correct here — this
// module registers server handlers only (no client component), following the
// neighboring `/api/codebases/$codebaseId/features` pattern. Never import this
// route module (or the `.server` modules) from client code.
//
// Every mutation re-validates tenant and feature-under-repository ownership on
// the server; `guardCodebaseHandler` classifies a transient DB outage as a 503.

export const Route = createFileRoute(
	"/api/codebases/$codebaseId/features/$projectId",
)({
	server: {
		handlers: {
			PATCH: ({
				request,
				params,
			}: {
				request: Request;
				params: FeaturePlanMutationParams;
			}) =>
				guardCodebaseHandler("codebases/feature-mutate", () =>
					handleFeaturePlanPatch({ request, params }),
				),
			DELETE: ({
				request,
				params,
			}: {
				request: Request;
				params: FeaturePlanMutationParams;
			}) =>
				guardCodebaseHandler("codebases/feature-delete", () =>
					handleFeatureDelete({ request, params }),
				),
		},
	},
});
