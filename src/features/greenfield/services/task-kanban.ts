/**
 * Kanban reads for the task domain.
 *
 * One DB source feeds both transports (polling GET `/api/kanban/$pid` and SSE
 * push `/api/kanban/stream`) so the board cannot drift between them. The
 * feature-tree SSOT decides which rows are shown and what their official
 * feature name is.
 */
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
	acVersions,
	type ProjectFeatureTree,
	projects,
	tasks,
} from "@/db/schema";
import { featureTreeSchema } from "@/features/greenfield/types/feature-tree";
import { cleanFeatureName } from "@/lib/kanban-utils";

export interface KanbanSsotTaskRef {
	readonly featureName: string | null;
	readonly subfeatureId: string | null;
}

/**
 * SSOT owner for one kanban row. Returns the official feature name, or null
 * when the row links to nothing in the tree (Phase-0/orphan rows are dropped
 * by the caller). Empty tree means legacy project: stored name or "Umum".
 */
export function resolveKanbanFeatureName(
	task: KanbanSsotTaskRef,
	ssotFeatures: ProjectFeatureTree["features"],
): string | null {
	if (ssotFeatures.length === 0) return task.featureName || "Umum";
	if (typeof task.subfeatureId === "string" && task.subfeatureId) {
		for (const feature of ssotFeatures) {
			for (const sub of feature.subfeatures) {
				if (sub.id === task.subfeatureId) return feature.name;
			}
		}
	}
	// Single regex source (@/lib/kanban-utils); lowercase for case-insensitive
	// key. whiteboard-canvas.tsx keeps its own display-local copy (out of scope).
	const cleaned = cleanFeatureName(
		typeof task.featureName === "string" ? task.featureName : "",
	).toLowerCase();
	if (!cleaned) return null;
	for (const feature of ssotFeatures) {
		if (cleanFeatureName(feature.name).toLowerCase() === cleaned)
			return feature.name;
	}
	return null;
}

/**
 * Kanban board data — shared between polling GET (`/api/kanban/$pid`)
 * and SSE push (`/api/kanban/stream`). Single DB source so both transports
 * stay in sync. Returns the same shape the hook expects.
 */
export async function getKanbanData(projectId: string): Promise<{
	columns: Record<
		string,
		Array<{
			id: string;
			type: "task";
			featureName: string;
			name: string;
			description: string;
			status: "pending" | "in_progress" | "completed" | "failed";
			subtaskCount: number;
			subtaskCompleted: number;
			dependencies: string[];
			startedAt: string | null;
			completedAt: string | null;
			subtasks: Array<{ name: string; status: string }>;
		}>
	>;
	staleness: "live";
	lastUpdateAt: string;
	acChanged: boolean;
	taskStatus: string | null;
}> {
	const [project] = await db
		.select({
			taskStatus: projects.taskStatus,
			featureTree: projects.featureTree,
		})
		.from(projects)
		.where(eq(projects.id, projectId))
		.limit(1);

	const taskRows = await db
		.select({
			id: tasks.id,
			title: tasks.title,
			description: tasks.description,
			status: tasks.status,
			priority: tasks.priority,
			featureName: tasks.featureName,
			subfeatureId: tasks.subfeatureId,
			dependencies: tasks.dependencies,
			subtasks: tasks.subtasks,
			startedAt: tasks.startedAt,
			completedAt: tasks.completedAt,
			createdAt: tasks.createdAt,
		})
		.from(tasks)
		.where(eq(tasks.projectId, projectId))
		.orderBy(asc(tasks.order));

	// acChanged: whether an AC version is newer than the oldest task creation.
	// Single source of truth: UI polling, SSE, and v1 REST all read through
	// getKanbanData, so the signal is computed once here.
	const [acRow] = await db
		.select({ createdAt: acVersions.createdAt })
		.from(acVersions)
		.where(eq(acVersions.projectId, projectId))
		.orderBy(desc(acVersions.version))
		.limit(1);

	const columns: Record<
		string,
		Array<{
			id: string;
			type: "task";
			featureName: string;
			name: string;
			description: string;
			status: "pending" | "in_progress" | "completed" | "failed";
			priority?: string | null;
			subtaskCount: number;
			subtaskCompleted: number;
			dependencies: string[];
			startedAt: string | null;
			completedAt: string | null;
			subtasks: Array<{ name: string; status: string }>;
		}>
	> = {
		pending: [],
		in_progress: [],
		completed: [],
		failed: [],
	};

	const VALID_CARD_STATUSES = new Set([
		"pending",
		"in_progress",
		"completed",
		"failed",
	] as const);
	type CardStatus = "pending" | "in_progress" | "completed" | "failed";
	const toIso = (d: unknown): string | null => {
		if (!d) return null;
		if (d instanceof Date)
			return Number.isFinite(d.getTime()) ? d.toISOString() : null;
		const parsed = new Date(d as string);
		return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
	};

	// SSOT sync: keep only tasks linked to featureTree; rename cards to official owner.
	const parsedTree = featureTreeSchema.safeParse(project?.featureTree ?? null);
	const ssotFeatures: ProjectFeatureTree["features"] = parsedTree.success
		? parsedTree.data.features
		: [];
	let oldestTaskAt: Date | null = null;
	for (const t of taskRows) {
		if (t.createdAt) {
			const created =
				t.createdAt instanceof Date ? t.createdAt : new Date(t.createdAt);
			if (
				Number.isFinite(created.getTime()) &&
				(!oldestTaskAt || created < oldestTaskAt)
			) {
				oldestTaskAt = created;
			}
		}
		const featureName = resolveKanbanFeatureName(
			{ featureName: t.featureName, subfeatureId: t.subfeatureId },
			ssotFeatures,
		);
		if (featureName === null) continue;
		// Normalize DB values into the declared card shape instead of
		// casting: invalid statuses fall back to pending, malformed subtask
		// entries are dropped, non-string dependencies are filtered out.
		const sub = Array.isArray(t.subtasks) ? t.subtasks : [];
		const validSubs = sub.filter(
			(s): s is Record<string, unknown> =>
				s !== null &&
				typeof s === "object" &&
				typeof (s as Record<string, unknown>).name === "string",
		);
		const rawStatus = t.status ?? "pending";
		const status: CardStatus = VALID_CARD_STATUSES.has(rawStatus as CardStatus)
			? (rawStatus as CardStatus)
			: "pending";
		const card = {
			id: t.id,
			type: "task" as const,
			featureName,
			name: t.title,
			description: t.description ?? "",
			status,
			priority: t.priority ?? "medium",
			subtaskCount: validSubs.length,
			subtaskCompleted: validSubs.filter((s) => s.status === "completed")
				.length,
			dependencies: Array.isArray(t.dependencies)
				? t.dependencies.filter((d): d is string => typeof d === "string")
				: [],
			startedAt: toIso(t.startedAt),
			completedAt: toIso(t.completedAt),
			subtasks: validSubs.map((s) => ({
				name: s.name as string,
				status:
					typeof s.status === "string" &&
					VALID_CARD_STATUSES.has(s.status as CardStatus)
						? (s.status as string)
						: "pending",
			})),
		};
		(columns[card.status] ?? columns.pending).push(card);
	}
	const latestAcAt = acRow?.createdAt ?? null;
	const acChanged = Boolean(
		latestAcAt &&
			oldestTaskAt &&
			new Date(latestAcAt).getTime() > oldestTaskAt.getTime(),
	);

	return {
		columns,
		staleness: "live",
		lastUpdateAt: new Date().toISOString(),
		acChanged,
		taskStatus: project?.taskStatus ?? null,
	};
}
