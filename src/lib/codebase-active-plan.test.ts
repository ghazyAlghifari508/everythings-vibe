import { describe, expect, it } from "vitest";
import {
	type ActivePlanCandidate,
	resolveActivePlan,
} from "./codebase-active-plan";

function plan(
	id: string,
	overrides: Partial<ActivePlanCandidate> = {},
): ActivePlanCandidate {
	return {
		id,
		name: id,
		updatedAt: "2026-01-01T00:00:00.000Z",
		hasArtifacts: false,
		...overrides,
	};
}

describe("resolveActivePlan", () => {
	it("reports an empty repository when no plan exists", () => {
		expect(resolveActivePlan({ plans: [] })).toEqual({ kind: "empty" });
	});

	it("reports unknown when the plan list was never read", () => {
		// A list still in flight must not be reported as a repository with no
		// planning: that is the false empty state this module exists to prevent.
		expect(resolveActivePlan({ plans: undefined })).toEqual({
			kind: "unknown",
		});
		expect(resolveActivePlan({ plans: null })).toEqual({ kind: "unknown" });
	});

	it("honours the explicitly requested plan", () => {
		const result = resolveActivePlan({
			requestedProjectId: "plan-b",
			anchorProjectId: "plan-a",
			plans: [plan("plan-a"), plan("plan-b")],
		});
		expect(result).toEqual({
			kind: "resolved",
			plan: plan("plan-b"),
			source: "explicit",
		});
	});

	it("ignores an explicit pointer that names a plan this codebase does not own", () => {
		// A stale or foreign id must never resolve, and must not be an error
		// either: the caller still gets a usable plan.
		const result = resolveActivePlan({
			requestedProjectId: "someone-elses-plan",
			plans: [plan("plan-a", { hasArtifacts: true }), plan("plan-b")],
		});
		expect(result).toEqual({
			kind: "resolved",
			plan: plan("plan-a", { hasArtifacts: true }),
			source: "sole_plan_with_artifacts",
		});
	});

	it("resolves the only plan that exists", () => {
		const result = resolveActivePlan({
			requestedProjectId: null,
			plans: [plan("only")],
		});
		expect(result).toEqual({
			kind: "resolved",
			plan: plan("only"),
			source: "only_plan",
		});
	});

	it("prefers the plan holding real artifacts over the onboarding anchor", () => {
		// The reported bug: the anchor is repository analysis context, so it must
		// not win over the plan that actually carries the user's planning.
		const result = resolveActivePlan({
			anchorProjectId: "anchor-plan",
			plans: [plan("anchor-plan"), plan("watchlist", { hasArtifacts: true })],
		});
		expect(result).toEqual({
			kind: "resolved",
			plan: plan("watchlist", { hasArtifacts: true }),
			source: "sole_plan_with_artifacts",
		});
	});

	it("falls back to the anchor when no plan carries artifacts yet", () => {
		const result = resolveActivePlan({
			anchorProjectId: "anchor-plan",
			plans: [plan("anchor-plan"), plan("fresh")],
		});
		expect(result).toEqual({
			kind: "resolved",
			plan: plan("anchor-plan"),
			source: "anchor",
		});
	});

	it("asks the user to choose when several plans all carry artifacts", () => {
		// No positional or recency guess is allowed to decide this.
		const plans = [
			plan("watchlist", { hasArtifacts: true }),
			plan("review-film", { hasArtifacts: true }),
		];
		const result = resolveActivePlan({ plans });
		expect(result).toEqual({ kind: "needs_selection", plans });
	});

	it("asks the user to choose when several empty plans exist without an anchor", () => {
		const plans = [plan("one"), plan("two")];
		const result = resolveActivePlan({ plans });
		expect(result).toEqual({ kind: "needs_selection", plans });
	});

	it("never uses updatedAt to decide the active plan", () => {
		// A plan whose row was touched most recently (for example by a later
		// analysis run) must not outrank the plan that holds the planning.
		const result = resolveActivePlan({
			plans: [
				plan("recently-touched", {
					updatedAt: "2026-06-01T00:00:00.000Z",
					hasArtifacts: false,
				}),
				plan("planned-earlier", {
					updatedAt: "2026-01-01T00:00:00.000Z",
					hasArtifacts: true,
				}),
			],
		});
		expect(result).toEqual({
			kind: "resolved",
			plan: plan("planned-earlier", {
				updatedAt: "2026-01-01T00:00:00.000Z",
				hasArtifacts: true,
			}),
			source: "sole_plan_with_artifacts",
		});
	});

	it("treats a blank explicit pointer as absent", () => {
		const result = resolveActivePlan({
			requestedProjectId: "   ",
			plans: [plan("only")],
		});
		expect(result).toEqual({
			kind: "resolved",
			plan: plan("only"),
			source: "only_plan",
		});
	});

	it("does not mutate the caller's plan list", () => {
		const plans = [
			plan("b", { hasArtifacts: true }),
			plan("a", { hasArtifacts: true }),
		];
		const snapshot = plans.map((item) => ({ ...item }));
		resolveActivePlan({ plans });
		expect(plans).toEqual(snapshot);
	});
});
