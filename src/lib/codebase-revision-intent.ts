import type { TaskCardStatus } from "./kanban-utils";

/**
 * What a new chat message in the workspace means.
 *
 * Both intents are real and mutually exclusive, and the workspace must never
 * pick one on the user's behalf: creating a new feature plan and revising the
 * current one change different persisted artifacts, so the choice is always
 * explicit.
 */
export type CodebaseChatIntent = "new_feature" | "revise_current";

export interface IntentOption {
	intent: CodebaseChatIntent;
	label: string;
	description: string;
}

const NEW_FEATURE_OPTION: IntentOption = {
	intent: "new_feature",
	label: "Buat Fitur Baru",
	description:
		"Merencanakan fitur lain di repository yang sama, mulai dari pertanyaan klarifikasi. Fitur yang sekarang tetap tersimpan dan bisa dibuka lagi.",
};

const REVISE_OPTION: IntentOption = {
	intent: "revise_current",
	label: "Revisi Fitur Saat Ini",
	description:
		"Meminta perubahan pada fitur yang sedang dibuka. Spesifikasi, PRD, dan Acceptance Criteria yang terdampak disusun ulang sebagai versi baru; dokumen lama tetap tersimpan.",
};

/**
 * Which intents to offer for a message sent at the given pipeline stage.
 *
 * Before any artifact exists there is nothing to revise, so the only real
 * intent is a new feature and the user is not asked a question with one answer.
 * Once a feature exists, both intents are genuine choices and both are offered.
 */
export function resolveIntentOptions(input: {
	/** A feature project with at least one persisted artifact exists. */
	hasExistingFeature: boolean;
}): IntentOption[] {
	if (!input.hasExistingFeature) return [NEW_FEATURE_OPTION];
	return [REVISE_OPTION, NEW_FEATURE_OPTION];
}

export interface TaskImpactInput {
	status: TaskCardStatus;
}

export interface RevisionImpact {
	/** Tasks that are not pending — the work a revision can invalidate. */
	affectedTaskCount: number;
	inProgressCount: number;
	completedCount: number;
	failedCount: number;
	/**
	 * True when replacing the task list would destroy real progress, so the
	 * user must confirm before any task is replaced.
	 */
	requiresTaskReplacementConfirmation: boolean;
}

/**
 * Impact of a revision on the existing task list.
 *
 * Only non-pending tasks count: replacing a list where everything is still
 * pending loses no work, while replacing in-progress or completed tasks
 * destroys progress the user cannot get back.
 */
export function assessRevisionImpact(
	tasks: readonly TaskImpactInput[],
): RevisionImpact {
	const inProgressCount = tasks.filter(
		(task) => task.status === "in_progress",
	).length;
	const completedCount = tasks.filter(
		(task) => task.status === "completed",
	).length;
	const failedCount = tasks.filter((task) => task.status === "failed").length;
	const affectedTaskCount = inProgressCount + completedCount + failedCount;
	return {
		affectedTaskCount,
		inProgressCount,
		completedCount,
		failedCount,
		requiresTaskReplacementConfirmation: affectedTaskCount > 0,
	};
}

/**
 * Impact copy for the confirmation the user must give before tasks are
 * replaced. Names the real counts so the decision is informed, and states the
 * default (tasks untouched) explicitly.
 */
export function describeRevisionImpact(impact: RevisionImpact): string {
	if (!impact.requiresTaskReplacementConfirmation) {
		return "Revisi ini tidak menyentuh task yang sudah berjalan, jadi status Kanban tetap utuh.";
	}
	const parts: string[] = [];
	if (impact.completedCount > 0)
		parts.push(`${impact.completedCount} task selesai`);
	if (impact.inProgressCount > 0)
		parts.push(`${impact.inProgressCount} task sedang dikerjakan`);
	if (impact.failedCount > 0) parts.push(`${impact.failedCount} task gagal`);
	return `Revisi ini berdampak pada ${parts.join(", ")}. Menyusun ulang task akan mereset progres tersebut. Tanpa konfirmasi, task dan status Kanban saat ini tidak diubah.`;
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
