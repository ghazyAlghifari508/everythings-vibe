import type { TaskCardStatus } from "./kanban-utils";

/**
 * How the workspace directs a new chat message.
 *
 * There is no per-message choice: a message sent while a user-facing feature
 * plan is active revises that plan, and a new plan is only ever created from
 * the explicit "Buat fitur baru" action. The two change different persisted
 * artifacts, so the explicit action is the only thing that may create one.
 */
export type CodebaseComposerMode = "create" | "clarify" | "revise";

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
