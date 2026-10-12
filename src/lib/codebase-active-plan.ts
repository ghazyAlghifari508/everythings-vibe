/**
 * Which feature plan a repository workspace opens on.
 *
 * A codebase can hold many independent feature plans, so "the active plan" is
 * never a positional guess. Resolution is deterministic and ordered by how
 * explicit the evidence is:
 *
 *  1. the plan the user explicitly selected (URL state or persisted pointer);
 *  2. the only plan that exists;
 *  3. the only plan carrying persisted artifacts;
 *  4. the durable onboarding anchor, when no plan carries artifacts yet.
 *
 * `updatedAt` is deliberately absent from this decision. A plan row is touched
 * by unrelated writes, so recency cannot mean "the plan the user meant", and a
 * later analysis run on the onboarding project would otherwise outrank the plan
 * that actually holds the user's PRD, AC and tasks.
 *
 * The onboarding anchor is repository *analysis* context, not the active plan,
 * so it only wins when nothing else has real work in it. Everything genuinely
 * ambiguous returns `needs_selection` and the user chooses.
 */

export interface ActivePlanCandidate {
	id: string;
	name: string;
	/** Display metadata for the plan list. Never used to pick the active plan. */
	updatedAt: string | null;
	/** The plan has at least one persisted artifact (feature/PRD/AC/task). */
	hasArtifacts: boolean;
}

export type ActivePlanSource =
	| "explicit"
	| "only_plan"
	| "sole_plan_with_artifacts"
	| "anchor";

export type ActivePlanResolution =
	| { kind: "resolved"; plan: ActivePlanCandidate; source: ActivePlanSource }
	| { kind: "empty" }
	| { kind: "needs_selection"; plans: readonly ActivePlanCandidate[] };

export interface ResolveActivePlanInput {
	/** Project id the caller explicitly asked for. */
	requestedProjectId?: string | null;
	/** Durable onboarding anchor recorded on the codebase. */
	anchorProjectId?: string | null;
	plans: readonly ActivePlanCandidate[];
}

function cleanId(value: string | null | undefined): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function findById(
	plans: readonly ActivePlanCandidate[],
	id: string,
): ActivePlanCandidate | null {
	return plans.find((plan) => plan.id === id) ?? null;
}

/**
 * Resolve the active plan.
 *
 * An explicit pointer that names a plan this codebase does not own is ignored
 * rather than honoured, so a stale or foreign id can never open another
 * tenant's plan. It is not treated as an error either: the caller still gets a
 * usable plan, and the caller replaces the stale pointer.
 */
export function resolveActivePlan(
	input: ResolveActivePlanInput,
): ActivePlanResolution {
	const plans = input.plans;
	if (plans.length === 0) return { kind: "empty" };

	const requestedId = cleanId(input.requestedProjectId);
	if (requestedId) {
		const requested = findById(plans, requestedId);
		if (requested) {
			return { kind: "resolved", plan: requested, source: "explicit" };
		}
	}

	if (plans.length === 1) {
		return { kind: "resolved", plan: plans[0], source: "only_plan" };
	}

	const withArtifacts = plans.filter((plan) => plan.hasArtifacts);
	if (withArtifacts.length === 1) {
		return {
			kind: "resolved",
			plan: withArtifacts[0],
			source: "sole_plan_with_artifacts",
		};
	}

	const anchorId = cleanId(input.anchorProjectId);
	if (withArtifacts.length === 0 && anchorId) {
		const anchor = findById(plans, anchorId);
		if (anchor) return { kind: "resolved", plan: anchor, source: "anchor" };
	}

	return { kind: "needs_selection", plans };
}
