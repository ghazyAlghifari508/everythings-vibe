import { eq } from "drizzle-orm";
import { expect, it, vi } from "vitest";
import { db } from "@/db";
import { studioJobs, studioProjects, users } from "@/db/schema";
import { updateStudioPreferences } from "../services/studio-preferences-service";
import { getStudioProjectDetail } from "../services/studio-project-detail";
import { duplicateStudioProject } from "../services/studio-project-lifecycle";

vi.mock("@/lib/services/ai-orchestrator", () => ({
	selectModels: () => [],
	tryStreamWithFallback: () => new Promise(() => {}),
}));

it("persists owner-scoped skills without generation, canonical references, removal and copied preferences", async () => {
	const userId = crypto.randomUUID();
	await db
		.insert(users)
		.values({ id: userId, email: `${userId}@example.test` });
	try {
		const [project] = await db
			.insert(studioProjects)
			.values({ userId, title: "Sample", initialPageCount: 4 })
			.returning();
		await expect(
			updateStudioPreferences(project.id, crypto.randomUUID(), {
				designSkillId: "taste",
			}),
		).rejects.toThrow();
		await updateStudioPreferences(project.id, userId, {
			designSkillId: "taste",
		});
		expect(
			await db
				.select()
				.from(studioJobs)
				.where(eq(studioJobs.projectId, project.id)),
		).toHaveLength(0);
		await updateStudioPreferences(project.id, userId, {
			designReference: { kind: "theme", id: "workspace" },
			designMd: "Untrusted text",
		});
		const detail = await getStudioProjectDetail(project.id, userId);
		expect(detail.project.designSkillId).toBe("taste");
		expect(detail.project.designReference).toEqual({
			kind: "theme",
			id: "workspace",
			source: "studio-presets",
			version: 1,
		});
		expect(detail.project.designMd).toContain("Workspace");
		const copy = await duplicateStudioProject(project.id, userId);
		expect(copy.designSkillId).toBe("taste");
		expect(copy.initialPageCount).toBe(4);
		expect(copy.designReference).toEqual(detail.project.designReference);
		await updateStudioPreferences(project.id, userId, {
			designReference: null,
		});
		const cleared = await getStudioProjectDetail(project.id, userId);
		expect(cleared.project.designMd).toBeNull();
		expect(cleared.project.designReference).toBeNull();
		await db.insert(studioJobs).values({
			userId,
			projectId: project.id,
			prompt: "Sample request",
			status: "queued",
		});
		await expect(
			updateStudioPreferences(project.id, userId, { designSkillId: "none" }),
		).rejects.toThrow();
	} finally {
		await db.delete(users).where(eq(users.id, userId));
	}
});
