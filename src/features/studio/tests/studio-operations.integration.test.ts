import { eq } from "drizzle-orm";
import { expect, it, vi } from "vitest";
import { db } from "@/db";
import { studioFrames, studioJobs, studioProjects, users } from "@/db/schema";
import { enqueueStudioOperation } from "../services/studio-operation-enqueue";

vi.mock("@/lib/services/ai-orchestrator", () => ({
	selectModels: () => [],
	tryStreamWithFallback: () => new Promise(() => {}),
}));

it("acknowledges targeted persisted work before AI finishes and deduplicates repeated submission", async () => {
	const userId = crypto.randomUUID();
	await db
		.insert(users)
		.values({ id: userId, email: `${userId}@example.test` });
	try {
		const [project] = await db
			.insert(studioProjects)
			.values({ userId, title: "Sample" })
			.returning();
		const frames = await db
			.insert(studioFrames)
			.values(
				["First", "Second", "Unaffected"].map((name, order) => ({
					projectId: project.id,
					name,
					order,
					htmlCode: "<html><head></head><body>Original</body></html>",
					status: "ready",
				})),
			)
			.returning();
		const requestId = crypto.randomUUID();
		const input = {
			action: "revise" as const,
			frameIds: frames.slice(0, 2).map((frame) => frame.id),
			prompt: "Revise spacing for selected screens",
			requestId,
		};
		const accepted = await enqueueStudioOperation(project.id, userId, input);
		expect(accepted.jobs).toHaveLength(2);
		expect(accepted.jobs.map((job) => job.targetFrameId)).toEqual(
			input.frameIds,
		);
		const repeated = await enqueueStudioOperation(project.id, userId, input);
		expect(repeated.jobs.map((job) => job.id)).toEqual(
			accepted.jobs.map((job) => job.id),
		);
		const [unaffected] = await db
			.select()
			.from(studioFrames)
			.where(eq(studioFrames.id, frames[2].id));
		expect(unaffected.status).toBe("ready");
		expect(unaffected.htmlCode).toBe(frames[2].htmlCode);
		await expect(
			enqueueStudioOperation(project.id, crypto.randomUUID(), input),
		).rejects.toThrow();
		await expect(
			enqueueStudioOperation(project.id, userId, {
				...input,
				requestId: crypto.randomUUID(),
				frameIds: ["foreign-frame"],
			}),
		).rejects.toThrow();
		const jobs = await db
			.select()
			.from(studioJobs)
			.where(eq(studioJobs.projectId, project.id));
		expect(jobs).toHaveLength(2);
	} finally {
		await db.delete(users).where(eq(users.id, userId));
	}
});
