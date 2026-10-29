export const REVISION_TARGET_LABELS: Record<string, string> = {
	feature: "Feature Specification",
	prd: "PRD",
	ac: "Acceptance Criteria",
	tasks: "Task Breakdown",
};

/** Human label for a revision target, falling back to the raw kind. */
export function revisionTargetLabel(kind: string): string {
	return REVISION_TARGET_LABELS[kind] ?? kind;
}
