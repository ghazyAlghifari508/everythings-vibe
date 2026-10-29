/**
 * How the workspace directs a new chat message.
 *
 * Explicit composer mode: "plan" starts or clarifies feature planning, while
 * "revise" submits a revision proposal against an explicit target artifact.
 * Legacy aliases ("create", "clarify") normalize to "plan".
 */
export type CodebaseComposerMode = "plan" | "create" | "clarify" | "revise";

export function normalizeComposerMode(
	mode?: CodebaseComposerMode | null,
): "plan" | "revise" {
	return mode === "revise" ? "revise" : "plan";
}

export interface RevisionContextInput {
	/** The feature name the user is revising. */
	featureName: string;
	/** The user's own instruction for this revision. */
	instruction: string;
}

/**
 * Message sent to the revision engine. It carries the user's instruction
 * verbatim plus the revision scope, so the engine can decide which sections
 * actually need to change instead of being handed a rewritten document.
 */
export function buildRevisionRequest(input: RevisionContextInput): string {
	const name = input.featureName.trim() || "fitur ini";
	return [
		`Revisi fitur ${name}.`,
		`Perubahan yang diminta: ${input.instruction.trim()}`,
		"Terapkan hanya pada bagian yang benar-benar terdampak oleh permintaan di atas, dan jaga bagian lain tetap seperti semula.",
	].join("\n");
}
