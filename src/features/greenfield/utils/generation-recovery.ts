// Shared recovery decisions for background generation (Task / AC / PRD).
// Loaders are the single source of truth (Postgres); local React state is
// lost on unmount, so a view that returns mid- or post-generation must
// reconcile its props against the persisted status instead of trusting its
// own mount-time flags.
export type GenerationStatus = string | null | undefined;

export function isStaleCompletedLoader(
	status: GenerationStatus,
	hasContent: boolean,
): boolean {
	return status === "completed" && !hasContent;
}

export function isBackgroundGeneration(
	status: GenerationStatus,
	hasContent: boolean,
): boolean {
	return status === "generating" && !hasContent;
}

export function resolveInitialGenerating(
	hasPrereq: boolean,
	status: GenerationStatus,
	hasContent: boolean,
): boolean {
	return hasPrereq && !hasContent && status !== "completed";
}
