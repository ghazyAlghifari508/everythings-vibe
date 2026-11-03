import { eq } from "drizzle-orm";
import { expect, it, vi } from "vitest";
import { db } from "@/db";
import { studioFrames, studioJobs, studioProjects, users } from "@/db/schema";
import { updateStudioPreferences } from "../services/studio-preferences-service";
import { getStudioPresetDesignMd } from "../services/studio-presets";
import { getStudioProjectDetail } from "../services/studio-project-detail";
import { duplicateStudioProject } from "../services/studio-project-lifecycle";

vi.mock("@/lib/services/ai-orchestrator", () => ({
	selectModels: () => [],
	tryStreamWithFallback: () => new Promise(() => {}),
}));

it("persists owner-scoped skills without regenerating frames or mutating stored design references", async () => {
	const userId = crypto.randomUUID();
	await db
		.insert(users)
		.values({ id: userId, email: `${userId}@example.test` });
	try {
		const storedDesignMd = getStudioPresetDesignMd("workspace");
		const storedReference = {
			kind: "theme" as const,
			id: "workspace",
			source: "studio-presets" as const,
			version: 1 as const,
		};
		const [project] = await db
			.insert(studioProjects)
			.values({
				userId,
				title: "Sample",
				initialPageCount: 4,
				designMd: storedDesignMd,
				designReference: storedReference,
			})
			.returning();
		const originalHtml = "<html><body><h1>Ready Screen</h1></body></html>";
		await db.insert(studioFrames).values({
			projectId: project.id,
			name: "Overview",
			status: "ready",
			htmlCode: originalHtml,
		});
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
		const detail = await getStudioProjectDetail(project.id, userId);
		expect(detail.project.designSkillId).toBe("taste");
		expect(detail.project.designReference).toEqual(storedReference);
		expect(detail.project.designMd).toBe(storedDesignMd);
		expect(detail.frames).toHaveLength(1);
		expect(detail.frames[0]?.status).toBe("ready");
		expect(detail.frames[0]?.htmlCode).toBe(originalHtml);
		const copy = await duplicateStudioProject(project.id, userId);
		expect(copy.designSkillId).toBe("taste");
		expect(copy.initialPageCount).toBe(4);
		expect(copy.designReference).toEqual(storedReference);
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
