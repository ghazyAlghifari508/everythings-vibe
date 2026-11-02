import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
	acVersions,
	featureVersions,
	prdVersions,
	projects,
	tasks,
	taskVersions,
} from "@/db/schema";

export type RevisionTargetKind = "feature" | "prd" | "ac" | "tasks";

/**
 * The immutable version the user is about to review. The client sends this exact
 * id back with the revision request, so a proposal is always prepared against a
 * version the user could actually see — never a guessed one.
 */
export async function resolveRevisionBaseVersion(
	userId: string,
	projectId: string,
	targetKind: RevisionTargetKind,
): Promise<string | null> {
	const [project] = await db
		.select({ id: projects.id, featureTree: projects.featureTree })
		.from(projects)
		.where(
			and(
				eq(projects.id, projectId),
				eq(projects.userId, userId),
				eq(projects.projectMode, "existing_codebase"),
				isNull(projects.deletedAt),
			),
		)
		.limit(1);
	if (!project) return null;

	if (targetKind === "prd" || targetKind === "ac") {
		const table = targetKind === "prd" ? prdVersions : acVersions;
		const [row] = await db
			.select({ id: table.id })
			.from(table)
			.where(eq(table.projectId, project.id))
			.orderBy(desc(table.version))
			.limit(1);
		return row?.id ?? null;
	}

	if (targetKind === "feature") {
		const [row] = await db
			.select({ id: featureVersions.id })
			.from(featureVersions)
			.where(eq(featureVersions.projectId, project.id))
			.orderBy(desc(featureVersions.version))
			.limit(1);
		// A tree written before the version table existed still has exactly one
		// reviewable state; the first apply creates its version row.
		return row?.id ?? (project.featureTree ? "v1" : null);
	}

	const [taskVersion] = await db
		.select({ id: taskVersions.id })
		.from(taskVersions)
		.where(eq(taskVersions.projectId, project.id))
		.orderBy(desc(taskVersions.version))
		.limit(1);
	if (taskVersion) return taskVersion.id;
	const [existingTask] = await db
		.select({ id: tasks.id })
		.from(tasks)
		.where(eq(tasks.projectId, project.id))
		.limit(1);
	return existingTask ? "v1" : null;
}
