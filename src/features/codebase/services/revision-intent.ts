/**
 * How the workspace directs a new chat message.
 *
 * There is no per-message choice: a message sent while a user-facing feature
 * plan is active revises that plan, and a new plan is only ever created from
 * the explicit "Buat fitur baru" action. The two change different persisted
 * artifacts, so the explicit action is the only thing that may create one.
 */
export type CodebaseComposerMode = "create" | "clarify" | "revise";

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
