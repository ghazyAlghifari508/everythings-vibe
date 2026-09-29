/**
 * Fitur stage service: parse/validate/persist ProjectFeatureTree + SSOT grounding.
 * Fitur adalah daftar gliederung terstruktur (features → subfeatures) yang menjadi
 * satu-satunya sumber daftar fitur untuk PRD Bab 4-5, AC, dan Task.
 */

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { type ProjectFeatureTree, projects } from "@/db/schema";
import { advanceStep } from "@/lib/flow-progress";

export * from "@/lib/feature-tree";

/** Thrown when the project does not exist or belongs to another tenant. */
export class FeatureProjectNotFoundError extends Error {
	readonly code = "FEATURE_PROJECT_NOT_FOUND" as const;

	constructor() {
		super("Project not found");
		this.name = "FeatureProjectNotFoundError";
	}
}

/**
 * Persist a validated tree. Ownership, the write, and the forward-only step
 * advance run in one transaction with the project row locked, so a concurrent
 * writer can neither write into a foreign project nor rewind the step.
 */
export async function saveFeatureTree(
	projectId: string,
	userId: string,
	tree: ProjectFeatureTree,
): Promise<void> {
	await db.transaction(async (tx) => {
		const [project] = await tx
			.select({ id: projects.id, step: projects.step })
			.from(projects)
			.where(
				and(
					eq(projects.id, projectId),
					eq(projects.userId, userId),
					isNull(projects.deletedAt),
				),
			)
			.for("update")
			.limit(1);
		if (!project) throw new FeatureProjectNotFoundError();
		const updateData: {
			featureTree: ProjectFeatureTree;
			featuresStatus: string;
			updatedAt: Date;
			step?: string;
		} = {
			featureTree: tree,
			featuresStatus: "completed",
			updatedAt: new Date(),
		};
		const next = advanceStep(project.step, "fitur");
		if (next) updateData.step = next;
		await tx.update(projects).set(updateData).where(eq(projects.id, projectId));
	});
}
