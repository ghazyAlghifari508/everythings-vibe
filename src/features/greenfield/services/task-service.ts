/**
 * Task tree persistence: DB reads and writes for the flat `tasks` table.
 *
 * Schema fork: old normalized `features`/`tasks`/`subtasks` tables collapsed
 * into flat `tasks` (project_id, title, description, subtasks jsonb, order).
 * The TaskTree shape (features→tasks→subtasks) is reconstructed from rows
 * grouped by `featureName`.
 *
 * Pure contract + parsing live in `./task-tree`; Kanban reads in `./task-kanban`.
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { projects, tasks } from "@/db/schema";
import {
	coversFromLegacyDescription,
	normalizeSurfaceName,
	type TaskTree,
} from "@/features/greenfield/services/task-tree";
import { canonicalAcId } from "@/features/greenfield/utils/ac-coverage";
import { storedTaskPriority } from "@/features/greenfield/utils/task-priority";
import { advanceStep } from "@/lib/flow-progress";

/**
 * Save task tree. One `tasks` row per task (not per feature).
 * featureName preserves feature grouping. Each subtask gets status: "pending".
 */
export async function saveTaskTree(
	projectId: string,
	taskTree: TaskTree,
): Promise<
	| { success: true; artifactId: string; taskCount: number }
	| { success: false; error: string }
> {
	try {
		const artifactId = crypto.randomUUID();
		// Build all rows first, then one bulk insert: per-task round trips
		// held the transaction (and its locks) open for large trees.
		let order = 0;
		const rows = taskTree.features.flatMap((feature) =>
			feature.tasks.map((task) => ({
				id: crypto.randomUUID(),
				projectId,
				title: task.name,
				description: task.description || null,
				featureName: feature.name,
				subfeatureId: task.subfeatureId ?? null,
				subfeatureName: task.subfeatureName ?? null,
				status: "pending",
				priority: task.priority,
				covers: task.covers,
				surfaces: task.surfaces,
				subtasks: task.subtasks.map((s) => ({
					name: s.name,
					description: s.description,
					details: s.details ?? [],
					status: "pending" as const,
				})),
				order: order++,
			})),
		);
		const totalTasks = rows.length;
		await db.transaction(async (tx) => {
			const [proj] = await tx
				.select({ step: projects.step, projectMode: projects.projectMode })
				.from(projects)
				.where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
				.for("update")
				.limit(1);
			if (!proj) throw new Error("Project tidak tersedia.");
			if (proj.projectMode === "existing_codebase") {
				const [existing] = await tx
					.select({ id: tasks.id })
					.from(tasks)
					.where(eq(tasks.projectId, projectId))
					.limit(1);
				// ponytail: replacement requires approved reconciliation, not generation.
				if (existing)
					throw new Error(
						"Task sudah tersedia dan tidak dapat diganti otomatis.",
					);
			} else {
				await tx.delete(tasks).where(eq(tasks.projectId, projectId));
			}
			if (rows.length > 0) await tx.insert(tasks).values(rows);

			const updateData: Record<string, unknown> = {
				taskStatus: "completed",
				updatedAt: new Date(),
			};
			const next = advanceStep(proj?.step, "task");
			if (next) updateData.step = next;
			await tx
				.update(projects)
				.set(updateData)
				.where(eq(projects.id, projectId));
		});
		return { success: true, artifactId, taskCount: totalTasks };
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		console.error("saveTaskTree error:", msg);
		return { success: false, error: msg };
	}
}

/**
 * Fetch task tree. DB rows are one-per-task with featureName for grouping.
 * Reconstruct features → tasks → subtasks from the flat rows.
 */
export async function getTaskTree(projectId: string): Promise<TaskTree | null> {
	try {
		const rows = await db
			.select({
				title: tasks.title,
				description: tasks.description,
				status: tasks.status,
				featureName: tasks.featureName,
				subfeatureId: tasks.subfeatureId,
				subfeatureName: tasks.subfeatureName,
				priority: tasks.priority,
				covers: tasks.covers,
				surfaces: tasks.surfaces,
				subtasks: tasks.subtasks,
			})
			.from(tasks)
			.where(eq(tasks.projectId, projectId))
			.orderBy(asc(tasks.order));

		if (rows.length === 0) return null;

		const featureMap = new Map<string, TaskTree["features"][number]>();
		for (const row of rows) {
			const fname =
				typeof row.featureName === "string" && row.featureName
					? row.featureName
					: "Umum";
			const feature =
				featureMap.get(fname) ??
				(() => {
					const f = {
						name: fname,
						tasks: [] as TaskTree["features"][number]["tasks"],
					};
					featureMap.set(fname, f);
					return f;
				})();

			// Same normalization as getKanbanData: drop malformed subtask
			// entries instead of trusting jsonb casts.
			const subtasks = (Array.isArray(row.subtasks) ? row.subtasks : [])
				.filter(
					(s): s is Record<string, unknown> =>
						s !== null &&
						typeof s === "object" &&
						typeof (s as Record<string, unknown>).name === "string",
				)
				.map((s) => ({
					name: s.name as string,
					description: typeof s.description === "string" ? s.description : "",
					details: Array.isArray(s.details)
						? s.details.filter((d): d is string => typeof d === "string")
						: [],
				}));

			// Coverage is structural when persisted; legacy rows without the
			// column fall back to their prose references so export/CLI keep
			// reporting the traceability that was actually generated.
			const storedCovers = Array.isArray(row.covers)
				? row.covers.filter((c): c is string => typeof c === "string")
				: [];
			const covers =
				storedCovers.length > 0
					? storedCovers.map(canonicalAcId)
					: coversFromLegacyDescription(row.description || "");

			// ponytail: feature guaranteed present via lazy-init above; push onto it
			feature.tasks.push({
				name: row.title,
				description: row.description || "",
				status: row.status ?? "pending",
				// Legacy rows predate the priority contract: they read as the
				// documented default rather than surfacing an unknown level.
				priority: storedTaskPriority(row.priority),
				covers,
				surfaces: Array.isArray(row.surfaces)
					? row.surfaces
							.map((surface) => normalizeSurfaceName(surface))
							.filter((surface): surface is string => surface !== null)
					: [],
				...(typeof row.subfeatureId === "string" && row.subfeatureId
					? { subfeatureId: row.subfeatureId }
					: {}),
				...(typeof row.subfeatureName === "string" && row.subfeatureName
					? { subfeatureName: row.subfeatureName }
					: {}),
				subtasks,
			});
		}

		return { features: Array.from(featureMap.values()) };
	} catch (error) {
		console.error("getTaskTree error:", error);
		throw error;
	}
}
