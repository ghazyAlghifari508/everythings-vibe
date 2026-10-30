import type { TaskTree } from "@/features/greenfield/services/task-tree";

export type ReconciliationAction =
	| "unchanged"
	| "added"
	| "modified"
	| "superseded"
	| "needs_review";

export interface ReconciliationItem {
	name: string;
	action: ReconciliationAction;
	status: string;
	reason?: string;
}

export interface ExistingTaskLike {
	id: string;
	title: string;
	description: string | null;
	status: string | null;
	subtasks?: unknown;
	priority?: string | null;
	covers?: string[] | null;
	surfaces?: string[] | null;
	featureName?: string | null;
	order?: number | null;
	startedAt?: Date | null;
	completedAt?: Date | null;
}

export interface ReconcileResult {
	items: ReconciliationItem[];
	tasksToPersist: Array<{
		id: string;
		title: string;
		description: string | null;
		status: string;
		subtasks: unknown;
		priority: string;
		covers: string[];
		surfaces: string[];
		featureName: string;
		order: number;
		startedAt?: Date | null;
		completedAt?: Date | null;
	}>;
}

export function reconcileTasks(
	existing: readonly ExistingTaskLike[],
	proposed: TaskTree,
): ReconcileResult {
	const items: ReconciliationItem[] = [];
	const tasksToPersist: ReconcileResult["tasksToPersist"] = [];

	// Map existing by title for lookup
	const existingByTitle = new Map<string, ExistingTaskLike>();
	for (const task of existing) {
		existingByTitle.set(task.title.trim().toLowerCase(), task);
	}

	const handledExistingTitles = new Set<string>();

	let order = 0;
	for (const feature of proposed.features) {
		for (const proposedTask of feature.tasks) {
			const key = proposedTask.name.trim().toLowerCase();
			const match = existingByTitle.get(key);

			if (!match) {
				// Added
				items.push({
					name: proposedTask.name,
					action: "added",
					status: "pending",
				});
				tasksToPersist.push({
					id: crypto.randomUUID(),
					title: proposedTask.name,
					description: proposedTask.description || null,
					status: "pending",
					subtasks: proposedTask.subtasks.map((s) => ({
						name: s.name,
						status: "pending",
					})),
					priority: proposedTask.priority,
					covers: proposedTask.covers,
					surfaces: proposedTask.surfaces,
					featureName: feature.name,
					order: order++,
				});
			} else {
				handledExistingTitles.add(key);
				const isUnchanged =
					match.description === (proposedTask.description || null) &&
					JSON.stringify(match.covers ?? []) ===
						JSON.stringify(proposedTask.covers) &&
					JSON.stringify(match.surfaces ?? []) ===
						JSON.stringify(proposedTask.surfaces);

				const action: ReconciliationAction = isUnchanged
					? "unchanged"
					: "modified";

				items.push({
					name: match.title,
					action,
					status: match.status ?? "pending",
				});

				// Preserve status and subtasks completion if in_progress or completed!
				const status = match.status ?? "pending";
				const subtasks =
					status === "in_progress" || status === "completed"
						? (match.subtasks ?? [])
						: proposedTask.subtasks.map((s) => ({
								name: s.name,
								status: "pending",
							}));

				tasksToPersist.push({
					id: match.id,
					title: proposedTask.name,
					description: proposedTask.description || match.description,
					status,
					subtasks,
					priority: proposedTask.priority || match.priority || "medium",
					covers: proposedTask.covers,
					surfaces: proposedTask.surfaces,
					featureName: feature.name,
					order: order++,
					startedAt: match.startedAt,
					completedAt: match.completedAt,
				});
			}
		}
	}

	// Check existing tasks that were not in proposed tree
	for (const task of existing) {
		const key = task.title.trim().toLowerCase();
		if (handledExistingTitles.has(key)) continue;

		const status = task.status ?? "pending";
		if (status === "completed" || status === "in_progress") {
			// MUST protect completed or in_progress tasks!
			items.push({
				name: task.title,
				action: "needs_review",
				status,
				reason:
					"Tugas sedang berjalan atau telah selesai tetapi tidak ada dalam usulan revisi.",
			});
			tasksToPersist.push({
				id: task.id,
				title: task.title,
				description: task.description,
				status,
				subtasks: task.subtasks ?? [],
				priority: task.priority || "medium",
				covers: task.covers ?? [],
				surfaces: task.surfaces ?? [],
				featureName: task.featureName || "Umum",
				order: order++,
				startedAt: task.startedAt,
				completedAt: task.completedAt,
			});
		} else {
			// Pending unstarted task that was superseded
			items.push({
				name: task.title,
				action: "superseded",
				status: "superseded",
				reason: "Tugas belum berjalan dan digantikan oleh struktur baru.",
			});
		}
	}

	return { items, tasksToPersist };
}
