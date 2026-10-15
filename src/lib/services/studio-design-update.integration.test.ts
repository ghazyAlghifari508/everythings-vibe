import { eq } from "drizzle-orm";
import { expect, it, vi } from "vitest";
import { db } from "@/db";
import { studioAssets, studioFrames, studioProjects, users } from "@/db/schema";
import { getStudioPresetDesignMd } from "@/lib/studio-presets";
import { updateStudioDesignSystem } from "./studio-service";

vi.mock("./ai-orchestrator", () => ({
	selectModels: () => [],
	tryStreamWithFallback: () => new Promise(() => {}),
}));

it("persists the selected specification and applies it to actual existing HTML with owner isolation", async () => {
	const userId = crypto.randomUUID();
	await db
		.insert(users)
		.values({ id: userId, email: `${userId}@example.test` });
	try {
		const [project] = await db
			.insert(studioProjects)
			.values({ userId, title: "Sample" })
			.returning();
		await db.insert(studioFrames).values({
			projectId: project.id,
			name: "Sample",
			status: "ready",
			htmlCode: "<html><head></head><body>Sample</body></html>",
		});
		const designMd = getStudioPresetDesignMd("midnight");
		await expect(
			updateStudioDesignSystem(project.id, crypto.randomUUID(), { designMd }),
		).rejects.toThrow();
		await updateStudioDesignSystem(project.id, userId, { designMd });
		const [stored] = await db
			.select()
			.from(studioProjects)
			.where(eq(studioProjects.id, project.id));
		expect(stored.designMd).toBe(designMd);
		const [frame] = await db
			.select()
			.from(studioFrames)
			.where(eq(studioFrames.projectId, project.id));
		expect(frame.htmlCode).toContain("studio-design-tokens");
		expect(frame.htmlCode).toContain("--canvas-bg: #101828");
		await expect(
			updateStudioDesignSystem(project.id, userId, { designMd: "bad" }),
		).rejects.toThrow();
	} finally {
		await db.delete(studioAssets).where(eq(studioAssets.userId, userId));
		await db.delete(users).where(eq(users.id, userId));
	}
});
