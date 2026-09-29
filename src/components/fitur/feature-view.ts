/**
 * Fitur stage view helpers (frontend-only, UI-owned).
 *
 * Canonical types come from the backend: `ProjectFeatureTree`, `FeatureNode`,
 * and `SubfeatureNode` are imported type-only from `@/db/schema`, and task
 * rows use `TaskTree` from `@/lib/services/task-service`. This module holds
 * no schema of its own — only pure view helpers over those contracts.
 */
import type {
	FeatureNode,
	ProjectFeatureTree,
	SubfeatureNode,
} from "@/db/schema";
import type { TaskTree } from "@/lib/services/task-service";

export type { FeatureNode, ProjectFeatureTree, SubfeatureNode };
export type FeatureTask = TaskTree["features"][number]["tasks"][number];

export interface TaskSubfeatureRef {
	readonly id: string;
	readonly name: string;
}

export interface TaskSubfeatureGroup {
	readonly key: string;
	readonly subfeatureName: string | null;
	readonly taskIndexes: readonly number[];
}

/** True when the persisted tree carries at least one feature. */
export function featureTreeHasContent(
	tree: ProjectFeatureTree | null | undefined,
): tree is ProjectFeatureTree {
	return (
		typeof tree === "object" &&
		tree !== null &&
		Array.isArray(tree.features) &&
		tree.features.length > 0
	);
}

/**
 * Opportunistic subfeature link on a task row. Tasks persisted before the
 * Fitur stage carry no `subfeatureId` and read as null (legacy fallback) —
 * never a crash, never a cast.
 */
export function taskSubfeatureRef(task: unknown): TaskSubfeatureRef | null {
	if (typeof task !== "object" || task === null || Array.isArray(task)) {
		return null;
	}
	if (!("subfeatureId" in task)) return null;
	const rawId: unknown = task.subfeatureId;
	if (typeof rawId !== "string" || rawId.trim().length === 0) return null;
	const id = rawId.trim();
	const rawName: unknown =
		"subfeatureName" in task ? task.subfeatureName : null;
	const name =
		typeof rawName === "string" && rawName.trim().length > 0
			? rawName.trim()
			: id;
	return { id, name };
}

/**
 * Group task indexes by owning subfeature, preserving first-appearance
 * order. Legacy tasks without a link each keep their own group so the
 * canvas falls back to flat feature grouping.
 */
export function groupTasksBySubfeature(
	tasks: readonly unknown[],
): TaskSubfeatureGroup[] {
	const groups: Array<{
		key: string;
		subfeatureName: string | null;
		taskIndexes: number[];
	}> = [];
	const byKey = new Map<string, (typeof groups)[number]>();
	tasks.forEach((task, index) => {
		const ref = taskSubfeatureRef(task);
		if (!ref) {
			groups.push({
				key: `__task:${index}`,
				subfeatureName: null,
				taskIndexes: [index],
			});
			return;
		}
		const existing = byKey.get(ref.id);
		if (existing) {
			existing.taskIndexes.push(index);
			return;
		}
		const group = {
			key: ref.id,
			subfeatureName: ref.name,
			taskIndexes: [index],
		};
		byKey.set(ref.id, group);
		groups.push(group);
	});
	return groups;
}
