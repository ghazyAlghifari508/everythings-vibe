/**
 * Pure helpers for managing the durable onboarding project identity on codebases.
 *
 * An onboarding project anchor is explicit and immutable once set.
 * It is never guessed from timestamp ordering or heuristic fallbacks.
 */

export interface OnboardingAnchorProjectLike {
	id: string;
	codebaseId?: string | null;
	[key: string]: unknown;
}

export interface ResolveOnboardingAnchorProjectInput<
	T extends OnboardingAnchorProjectLike,
> {
	onboardingProjectId: string | null | undefined;
	projects: readonly T[] | null | undefined;
	expectedCodebaseId?: string | null;
}

/**
 * Extract clean explicit anchor project ID from codebase record, or null.
 */
export function resolveCodebaseAnchorId(
	codebase: { onboardingProjectId?: string | null } | null | undefined,
): string | null {
	const raw = codebase?.onboardingProjectId;
	if (typeof raw !== "string") return null;
	const trimmed = raw.trim();
	return trimmed.length > 0 ? trimmed : null;
}

/**
 * Select the anchor project strictly by explicit pointer identity.
 *
 * Never falls back to updatedAt / createdAt ordering or array position.
 * Returns null if anchor pointer is unset or no project matches identity.
 */
export function resolveOnboardingAnchorProject<
	T extends OnboardingAnchorProjectLike,
>(input: ResolveOnboardingAnchorProjectInput<T>): T | null {
	const anchorId = resolveCodebaseAnchorId({
		onboardingProjectId: input.onboardingProjectId,
	});
	if (!anchorId || !input.projects || input.projects.length === 0) {
		return null;
	}

	const matched = input.projects.find((project) => project.id === anchorId);
	if (!matched) return null;

	if (
		input.expectedCodebaseId &&
		matched.codebaseId &&
		matched.codebaseId !== input.expectedCodebaseId
	) {
		return null;
	}

	return matched;
}

export interface DetermineOnboardingProjectAssignmentInput {
	currentAnchorId: string | null | undefined;
	newProjectId: string;
}

export interface DetermineOnboardingProjectAssignmentResult {
	shouldAssign: boolean;
	onboardingProjectId: string;
}

/**
 * Determine if a codebase should be assigned an onboarding project anchor.
 *
 * Immutable: once an onboardingProjectId exists, subsequent feature
 * creations never overwrite it.
 */
export function determineOnboardingProjectAssignment(
	input: DetermineOnboardingProjectAssignmentInput,
): DetermineOnboardingProjectAssignmentResult {
	const current = resolveCodebaseAnchorId({
		onboardingProjectId: input.currentAnchorId,
	});
	if (!current) {
		return {
			shouldAssign: true,
			onboardingProjectId: input.newProjectId,
		};
	}
	return {
		shouldAssign: false,
		onboardingProjectId: current,
	};
}
