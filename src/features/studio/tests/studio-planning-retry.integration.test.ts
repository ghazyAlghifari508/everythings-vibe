import { eq } from "drizzle-orm";
import { afterEach, expect, it } from "vitest";
import { db } from "@/db";
import { studioFrames, studioJobs, studioProjects, users } from "@/db/schema";
import { getStudioProjectDetail } from "../services/studio-project-detail";
import { retryStudioPlanning } from "../services/studio-retry-service";
import { financeBlueprint } from "./fixtures/studio-evaluation-fixtures";

const owners: string[] = [];
async function seed(status: string, saved = false) {
	const userId = crypto.randomUUID();
	owners.push(userId);
	await db
		.insert(users)
		.values({ id: userId, email: `${userId}@example.test` });
	const [project] = await db
		.insert(studioProjects)
		.values({ userId, title: "Planning retry" })
		.returning();
	const [frame] = await db
		.insert(studioFrames)
		.values({
			projectId: project.id,
			name: saved ? "Overview" : "Layar 1",
			description: "",
			status: saved ? "ready" : "failed",
			htmlCode: saved ? "<main>Saved result</main>" : null,
		})
		.returning();
	const [job] = await db
		.insert(studioJobs)
		.values({
			projectId: project.id,
			userId,
			jobType: "initial",
			prompt: "Sample application brief",
			status,
		})
		.returning();
	return { userId, project, frame, job };
}
afterEach(async () => {
	for (const userId of owners.splice(0))
		await db.delete(users).where(eq(users.id, userId));
});

it.each([
	"queued",
	"planning",
	"generating",
])("rejects planning retry during %s without a duplicate", async (status) => {
	const { userId, project, job } = await seed(status);
	await expect(retryStudioPlanning(project.id, userId)).rejects.toMatchObject({
		code: "STUDIO_RETRY_RUNNING",
	});
	const jobs = await db
		.select()
		.from(studioJobs)
		.where(eq(studioJobs.projectId, project.id));
	expect(jobs).toEqual([job]);
});

it.each([
	"completed",
	"partial",
	"failed",
])("does not requeue %s initial work over valid HTML", async (status) => {
	const { userId, project, frame, job } = await seed(status, true);
	await expect(retryStudioPlanning(project.id, userId)).rejects.toMatchObject({
		code: "STUDIO_INVALID_INPUT",
	});
	const detail = await getStudioProjectDetail(project.id, userId);
	expect(detail.frames).toEqual([frame]);
	expect(detail.activeJob).toEqual(job);
});

it("serializes simultaneous planning retries on the original project and job", async () => {
	const { userId, project, frame, job } = await seed("failed");
	const results = await Promise.allSettled([
		retryStudioPlanning(project.id, userId),
		retryStudioPlanning(project.id, userId),
	]);
	expect(
		results.filter((result) => result.status === "fulfilled"),
	).toHaveLength(1);
	expect(results.find((result) => result.status === "rejected")).toMatchObject({
		reason: { code: "STUDIO_RETRY_RUNNING" },
	});
	const detail = await getStudioProjectDetail(project.id, userId);
	expect(detail.project.id).toBe(project.id);
	expect(detail.activeJob).toMatchObject({
		id: job.id,
		status: "queued",
		attempts: 0,
		claimedBy: null,
		finishedAt: null,
	});
	expect(detail.frames).toEqual([frame]);
	expect(
		await db
			.select()
			.from(studioJobs)
			.where(eq(studioJobs.projectId, project.id)),
	).toHaveLength(1);
});

it("refuses another owner's planning retry", async () => {
	const { project } = await seed("failed");
	await expect(
		retryStudioPlanning(project.id, crypto.randomUUID()),
	).rejects.toMatchObject({ code: "STUDIO_NOT_FOUND" });
});

it("rejects whole-plan retry after the blueprint was persisted", async () => {
	const { userId, project, frame } = await seed("failed");
	await db
		.update(studioProjects)
		.set({ designBlueprint: financeBlueprint })
		.where(eq(studioProjects.id, project.id));
	await expect(retryStudioPlanning(project.id, userId)).rejects.toMatchObject({
		code: "STUDIO_INVALID_INPUT",
	});
	expect((await getStudioProjectDetail(project.id, userId)).frames).toEqual([
		frame,
	]);
});

it("refuses planning recovery while another project job is running", async () => {
	const { userId, project, frame } = await seed("failed");
	await db.insert(studioJobs).values({
		projectId: project.id,
		userId,
		jobType: "retry",
		targetFrameId: frame.id,
		prompt: "Sample",
		status: "generating",
	});
	await expect(retryStudioPlanning(project.id, userId)).rejects.toMatchObject({
		code: "STUDIO_RETRY_RUNNING",
	});
	expect((await getStudioProjectDetail(project.id, userId)).frames).toEqual([
		frame,
	]);
});
