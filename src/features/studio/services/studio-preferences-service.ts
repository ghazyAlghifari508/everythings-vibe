import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { type StudioProjectRow, studioJobs, studioProjects } from "@/db/schema";
import { ScrapeError } from "@/lib/design-errors";
import type { StudioPreferencesInput } from "../types/studio-service";
import { resolveStudioDesignSkill } from "./studio-design-skill-registry.server";
import { studioGenerationOptionsSchema } from "./studio-generation-options";

export async function updateStudioPreferences(
	projectId: string,
	userId: string,
	input: StudioPreferencesInput,
): Promise<StudioProjectRow> {
	const skillId = studioGenerationOptionsSchema.parse({
		designSkillId: input.designSkillId,
	}).designSkillId;
	return db.transaction(async (tx) => {
		const [project] = await tx
			.select()
			.from(studioProjects)
			.where(
				and(
					eq(studioProjects.id, projectId),
					eq(studioProjects.userId, userId),
				),
			)
			.for("update");
		if (!project)
			throw new ScrapeError("WEBSITE_BLOCKED", "Studio tidak ditemukan.");
		const [busy] = await tx
			.select()
			.from(studioJobs)
			.where(
				and(
					eq(studioJobs.projectId, projectId),
					eq(studioJobs.userId, userId),
					inArray(studioJobs.status, ["queued", "planning", "generating"]),
				),
			)
			.limit(1);
		if (busy)
			throw new ScrapeError(
				"INVALID_URL",
				"Tunggu proses desain selesai sebelum mengganti design skill.",
			);
		const [updated] = await tx
			.update(studioProjects)
			.set({
				designSkillId: skillId,
				...(skillId !== project.designSkillId
					? { designSkillVersion: resolveStudioDesignSkill(skillId).version }
					: {}),
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(studioProjects.id, projectId),
					eq(studioProjects.userId, userId),
				),
			)
			.returning();
		if (!updated) throw new ScrapeError("STORAGE_FAILED");
		return updated;
	});
}
