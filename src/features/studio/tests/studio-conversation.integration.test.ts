import { and, eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import { db } from "@/db";
import { studioFrames, studioJobs, users } from "@/db/schema";
import { persistStudioFrameVersion } from "../services/studio-frame-write";
import {
	claimStudioJob,
	withStudioJobWrite,
} from "../services/studio-job-lease";
import { enqueueStudioOperation } from "../services/studio-operation-enqueue";
import { getStudioProjectDetail } from "../services/studio-project-detail";
import { createStudioProjectWithJob } from "../services/studio-project-enqueue";
import {
	retryStudioFrame,
	retryStudioPlanning,
} from "../services/studio-retry-service";

vi.mock("@/lib/services/ai-orchestrator", () => ({
	selectModels: () => [],
	tryStreamWithFallback: async () => ({
		firstChunk: '{"intent":"clarify"}',
		generator: (async function* () {})(),
	}),
}));
const owners: string[] = [];
async function launch() {
	const userId = crypto.randomUUID();
	owners.push(userId);
	await db
		.insert(users)
		.values({ id: userId, email: `${userId}@example.test` });
	return {
		userId,
		...(await createStudioProjectWithJob(userId, {
			prompt: "  Buat aplikasi perjalanan keluarga  ",
			initialPageCount: 2,
		})),
	};
}
afterEach(async () => {
	for (const id of owners.splice(0))
		await db.delete(users).where(eq(users.id, id));
});

it("persists the original landing prompt once across duplicate launch and history reload", async () => {
	const { userId, project, job } = await launch();
	await createStudioProjectWithJob(userId, {
		prompt: "  Buat aplikasi perjalanan keluarga  ",
		initialPageCount: 2,
	});
	for (let i = 0; i < 2; i++) {
		const detail = await getStudioProjectDetail(project.id, userId);
		expect(
			detail.messages?.filter((m) => m.role === "user").map((m) => m.content),
		).toEqual(["  Buat aplikasi perjalanan keluarga  "]);
		expect(detail.messages?.map((m) => m.jobIds)).toEqual([[job.id], [job.id]]);
		expect(detail.messages?.[1].progress?.screenNames).toEqual([]);
	}
});

it("queues concurrent retries exactly once and keeps targets and ordering across reload", async () => {
	const { userId, project, job, frames } = await launch();
	const input = {
		prompt: "Ubah ukuran tombol pada layar ini",
		frameIds: [frames[0].id],
		requestId: crypto.randomUUID(),
	};
	const [a, b] = await Promise.all([
		enqueueStudioOperation(project.id, userId, input),
		enqueueStudioOperation(project.id, userId, input),
	]);
	if (a.intent === "clarify" || b.intent === "clarify")
		throw new Error("Expected operation");
	expect(a.jobs.map((j) => j.id)).toEqual(b.jobs.map((j) => j.id));
	expect(a.jobs[0].dependsOnJobId).toBe(job.id);
	const detail = await getStudioProjectDetail(project.id, userId);
	expect(detail.messages?.map((m) => m.role)).toEqual([
		"user",
		"assistant",
		"user",
		"assistant",
	]);
	expect(detail.messages?.[2].attachments.map((a) => a.frameId)).toEqual([
		frames[0].id,
	]);
	expect(detail.messages?.[3].status).toBe("queued");
	const [initial] = await db
		.select()
		.from(studioJobs)
		.where(and(eq(studioJobs.id, job.id), eq(studioJobs.userId, userId)));
	expect(initial.status).toBe("queued");
	await expect(
		enqueueStudioOperation(project.id, userId, {
			...input,
			prompt: "Permintaan berbeda untuk layar ini",
		}),
	).rejects.toMatchObject({ code: "STUDIO_IDEMPOTENCY_CONFLICT" });
});

it("reconciles plan, independent frames, partial failure and successful recovery from persisted writes", async () => {
	const { userId, project, job, frames } = await launch();
	const workerId = crypto.randomUUID();
	await claimStudioJob(job.id, userId, workerId);
	const claim = { jobId: job.id, projectId: project.id, userId, workerId };
	await withStudioJobWrite(claim, async (tx) => {
		await tx
			.update(studioFrames)
			.set({ name: "Eksplorasi" })
			.where(eq(studioFrames.id, frames[0].id));
		await tx
			.update(studioFrames)
			.set({ name: "Profil" })
			.where(eq(studioFrames.id, frames[1].id));
		await tx
			.update(studioJobs)
			.set({ status: "generating", planningCompletedAt: new Date() })
			.where(eq(studioJobs.id, job.id));
	});
	await withStudioJobWrite(claim, async (tx) => {
		await persistStudioFrameVersion(tx, {
			claim,
			frameId: frames[0].id,
			baseRevision: 0,
			htmlCode: "<main>Travel</main>",
			prompt: job.prompt,
		});
	});
	let detail = await getStudioProjectDetail(project.id, userId);
	expect(detail.messages?.[1].progress).toMatchObject({
		phase: "generating",
		ready: 1,
		total: 2,
		screenNames: ["Eksplorasi", "Profil"],
	});
	await withStudioJobWrite(claim, async (tx) => {
		await tx
			.update(studioFrames)
			.set({ status: "failed" })
			.where(eq(studioFrames.id, frames[1].id));
		await tx
			.update(studioJobs)
			.set({ status: "partial", error: "provider secret must not leak" })
			.where(eq(studioJobs.id, job.id));
	});
	detail = await getStudioProjectDetail(project.id, userId);
	expect(detail.messages?.[1]).toMatchObject({
		status: "partial",
		progress: { ready: 1, failed: 1, total: 2, recovery: "frames" },
	});
	expect(JSON.stringify(detail.messages)).not.toContain("provider secret");
	expect(detail.frames[0].htmlCode).toBe("<main>Travel</main>");
	await retryStudioFrame(project.id, userId, frames[1].id);
	const recovery = await getStudioProjectDetail(project.id, userId);
	const retry = recovery.jobs?.find(
		(entry) => entry.targetFrameId === frames[1].id,
	);
	if (!retry) throw new Error("Expected retry job");
	expect(recovery.messages?.[1]).toMatchObject({
		status: "queued",
		progress: { ready: 1, total: 2, recovery: null },
	});
	await claimStudioJob(retry.id, userId, workerId);
	await withStudioJobWrite({ ...claim, jobId: retry.id }, async (tx) => {
		await persistStudioFrameVersion(tx, {
			claim: { ...claim, jobId: retry.id },
			frameId: frames[1].id,
			baseRevision: 0,
			htmlCode: "<main>Profile</main>",
			prompt: retry.prompt,
		});
		await tx
			.update(studioJobs)
			.set({ status: "completed" })
			.where(and(eq(studioJobs.id, retry.id), eq(studioJobs.userId, userId)));
	});
	expect(
		(await getStudioProjectDetail(project.id, userId)).messages?.[1],
	).toMatchObject({
		status: "completed",
		progress: { ready: 2, total: 2, failed: 0, recovery: null },
	});
});

it("rejects cross-user project reads and cross-project frame targeting without messages", async () => {
	const first = await launch();
	const second = await launch();
	await expect(
		getStudioProjectDetail(first.project.id, second.userId),
	).rejects.toThrow();
	await expect(
		enqueueStudioOperation(first.project.id, second.userId, {
			prompt: "Ubah tombol untuk project ini",
			requestId: crypto.randomUUID(),
		}),
	).rejects.toThrow();
	await expect(
		enqueueStudioOperation(first.project.id, first.userId, {
			prompt: "Ubah tombol untuk layar ini",
			frameIds: [second.frames[0].id],
			requestId: crypto.randomUUID(),
		}),
	).rejects.toThrow();
	const detail = await getStudioProjectDetail(first.project.id, first.userId);
	expect(detail.messages?.map((m) => m.operationId)).toEqual([
		first.job.id,
		first.job.id,
	]);
});

it("keeps failed planning factual, reuses the initial turn on recovery", async () => {
	const { userId, project, job } = await launch();
	const workerId = crypto.randomUUID();
	const claim = { jobId: job.id, projectId: project.id, userId, workerId };
	await claimStudioJob(job.id, userId, workerId);
	await withStudioJobWrite(claim, async (tx) => {
		await tx
			.update(studioJobs)
			.set({ status: "failed" })
			.where(and(eq(studioJobs.id, job.id), eq(studioJobs.userId, userId)));
		await tx
			.update(studioFrames)
			.set({ status: "failed" })
			.where(eq(studioFrames.projectId, project.id));
	});
	expect(
		(await getStudioProjectDetail(project.id, userId)).messages?.[1],
	).toMatchObject({
		status: "failed",
		progress: { screenNames: [], ready: 0, recovery: "planning" },
	});
	await retryStudioPlanning(project.id, userId);
	const detail = await getStudioProjectDetail(project.id, userId);
	expect(detail.messages?.map((message) => message.operationId)).toEqual([
		job.id,
		job.id,
	]);
	expect(detail.messages?.[1]).toMatchObject({
		status: "queued",
		progress: { screenNames: [], recovery: null },
	});
});

it("never mistakes old ready HTML for a failed or queued revision result", async () => {
	const { userId, project, job, frames } = await launch();
	const workerId = crypto.randomUUID();
	const claim = { jobId: job.id, projectId: project.id, userId, workerId };
	await claimStudioJob(job.id, userId, workerId);
	await withStudioJobWrite(claim, async (tx) => {
		await tx
			.update(studioJobs)
			.set({ planningCompletedAt: new Date() })
			.where(and(eq(studioJobs.id, job.id), eq(studioJobs.userId, userId)));
		await persistStudioFrameVersion(tx, {
			claim,
			frameId: frames[0].id,
			baseRevision: 0,
			htmlCode: "<main>Original</main>",
			prompt: job.prompt,
		});
	});
	const result = await enqueueStudioOperation(project.id, userId, {
		prompt: "Ubah ukuran tombol pada layar ini",
		frameIds: [frames[0].id],
		requestId: crypto.randomUUID(),
	});
	if (result.intent === "clarify") throw new Error("Expected revision");
	const revision = result.jobs[0];
	expect(
		(await getStudioProjectDetail(project.id, userId)).messages?.[3],
	).toMatchObject({ status: "queued", progress: { ready: 0, total: 1 } });
	await claimStudioJob(revision.id, userId, workerId);
	await withStudioJobWrite({ ...claim, jobId: revision.id }, async (tx) => {
		await tx
			.update(studioJobs)
			.set({ status: "failed", errorCode: "STUDIO_STALE_REVISION" })
			.where(
				and(eq(studioJobs.id, revision.id), eq(studioJobs.userId, userId)),
			);
	});
	const detail = await getStudioProjectDetail(project.id, userId);
	expect(detail.messages?.[3]).toMatchObject({
		status: "failed",
		progress: { ready: 0, total: 1, recovery: "resubmit" },
	});
	expect(detail.frames[0].htmlCode).toBe("<main>Original</main>");
});
