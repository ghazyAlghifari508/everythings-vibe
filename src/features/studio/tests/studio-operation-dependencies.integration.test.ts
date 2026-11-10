import { and, eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import { db } from "@/db";
import {
	studioFrames,
	studioJobs,
	studioProjects,
	studioRevisions,
	subscriptions,
	users,
} from "@/db/schema";
import type * as FrameGeneration from "../services/studio-frame-generation";
import { listRunnableStudioJobs } from "../services/studio-job-dependencies";
import {
	claimStudioJob,
	recoverStalledStudioJobs,
	withStudioJobWrite,
} from "../services/studio-job-lease";
import { runStudioJobPipeline } from "../services/studio-job-pipeline";
import { enqueueStudioOperation } from "../services/studio-operation-enqueue";
import { getStudioProjectDetail } from "../services/studio-project-detail";
import {
	retryStudioFrame,
	retryStudioPlanning,
} from "../services/studio-retry-service";
import { financeBlueprint } from "./fixtures/studio-evaluation-fixtures";

const generation = vi.hoisted(() => ({ fail: "", names: [] as string[] }));
vi.mock("../services/studio-frame-generation", async (importOriginal) => ({
	...(await importOriginal<typeof FrameGeneration>()),
	generateValidatedFrameHtml: async (input: { activeScreen: string }) => {
		generation.names.push(input.activeScreen);
		if (generation.fail === input.activeScreen)
			throw new Error("provider fixture failure");
		return `<main>${input.activeScreen} revision ${generation.names.length}</main>`;
	},
}));
const owners: string[] = [];
async function seed(pending = false) {
	const userId = crypto.randomUUID();
	owners.push(userId);
	await db
		.insert(users)
		.values({ id: userId, email: `${userId}@example.test` });
	await db.insert(subscriptions).values({
		id: crypto.randomUUID(),
		userId,
		plan: "free",
		credits: 10,
		creditsUsed: 2,
	});
	const [project] = await db
		.insert(studioProjects)
		.values({
			userId,
			title: "BukuKas",
			designMode: "mobile",
			designBlueprint: pending ? null : financeBlueprint,
		})
		.returning();
	const [initial] = await db
		.insert(studioJobs)
		.values({
			userId,
			projectId: project.id,
			prompt: "Aplikasi untuk pengelolaan kas usaha",
			status: pending ? "planning" : "generating",
			planningCompletedAt: pending ? null : new Date(),
		})
		.returning();
	const frames = await db
		.insert(studioFrames)
		.values(
			financeBlueprint.screenPlan.map((screen, index) => ({
				projectId: project.id,
				originJobId: initial.id,
				initialSlot: index,
				name: screen.name,
				description: screen.role,
				order: index,
				viewport: "mobile",
				status: pending || index > 0 ? "queued" : "ready",
				htmlCode: pending || index > 0 ? null : "<main>approved bytes</main>",
				revision: pending || index > 0 ? 0 : 1,
				lastJobId: pending || index > 0 ? null : initial.id,
			})),
		)
		.returning();
	return { userId, project, initial, frames };
}
async function revise(
	projectId: string,
	userId: string,
	ids: string[],
	requestId = crypto.randomUUID(),
) {
	const result = await enqueueStudioOperation(projectId, userId, {
		prompt: "Perbaiki padding layar terpilih",
		frameIds: ids,
		requestId,
	});
	if (result.intent === "clarify") throw new Error("revision expected");
	return result.jobs;
}
afterEach(async () => {
	for (const id of owners)
		await db.delete(subscriptions).where(eq(subscriptions.userId, id));
	for (const id of owners.splice(0))
		await db.delete(users).where(eq(users.id, id));
	generation.fail = "";
	generation.names = [];
});

it("deduplicates concurrent retries by identity without credits, preserves distinct similar requests", async () => {
	const { project, userId, frames } = await seed();
	const requestId = crypto.randomUUID();
	const input = { prompt: "Tambahkan halaman Profile", requestId };
	const responses = await Promise.all([
		enqueueStudioOperation(project.id, userId, input),
		enqueueStudioOperation(project.id, userId, input),
	]);
	if (responses[0].intent === "clarify" || responses[1].intent === "clarify")
		throw new Error("expected jobs");
	expect(responses[0].jobs.map((job) => job.id)).toEqual(
		responses[1].jobs.map((job) => job.id),
	);
	await expect(
		enqueueStudioOperation(project.id, userId, {
			...input,
			prompt: "Tambahkan halaman Pengaturan",
		}),
	).rejects.toMatchObject({ code: "STUDIO_IDEMPOTENCY_CONFLICT" });
	await expect(
		enqueueStudioOperation(project.id, userId, {
			...input,
			requestId: crypto.randomUUID(),
		}),
	).rejects.toMatchObject({ code: "STUDIO_DUPLICATE_SCREEN" });
	await enqueueStudioOperation(project.id, userId, {
		prompt: "Tambahkan halaman Profile Bisnis",
		requestId: crypto.randomUUID(),
	});
	const detail = await getStudioProjectDetail(project.id, userId);
	expect(detail.frames).toHaveLength(6);
	expect(detail.frames.slice(0, 4)).toEqual(frames);
	expect(detail.jobs.filter((job) => job.jobType === "add")).toHaveLength(2);
	const [balance] = await db
		.select()
		.from(subscriptions)
		.where(eq(subscriptions.userId, userId));
	expect(balance.creditsUsed).toBe(2);
});

it("queues a pending revision for the produced version and lets ready-target revision finish before siblings", async () => {
	const { project, userId, frames, initial } = await seed();
	const [pending] = await revise(project.id, userId, [frames[1].id]);
	expect(pending.dependsOnJobId).toBe(initial.id);
	expect(pending.baseRevision).toBe(1);
	expect(await claimStudioJob(pending.id, userId, "too-early")).toBeNull();
	const [ready] = await revise(project.id, userId, [frames[0].id]);
	expect(ready.dependsOnJobId).toBeNull();
	expect(ready.baseRevision).toBe(1);
	await runStudioJobPipeline(ready.id, project.id, userId);
	const detail = await getStudioProjectDetail(project.id, userId);
	expect(detail.frames[0].revision).toBe(2);
	expect(detail.frames.slice(1)).toEqual(frames.slice(1));
	expect(detail.jobs.find((job) => job.id === initial.id)?.status).toBe(
		"generating",
	);
	expect(detail.jobs.find((job) => job.id === pending.id)?.status).toBe(
		"queued",
	);
	expect(detail.activeJob?.id).toBe(initial.id);
	expect(detail.revisions[0]).toMatchObject({
		frameId: frames[0].id,
		frameRevision: 2,
		jobId: ready.id,
	});
});

it("serializes two revisions of one target without overwriting a newer version", async () => {
	const { project, userId, frames } = await seed();
	const [first] = await revise(project.id, userId, [frames[0].id]);
	const [second] = await revise(project.id, userId, [frames[0].id]);
	expect(second.dependsOnJobId).toBe(first.id);
	expect(second.baseRevision).toBe(2);
	expect(await claimStudioJob(second.id, userId, "early")).toBeNull();
	await runStudioJobPipeline(first.id, project.id, userId);
	await runStudioJobPipeline(second.id, project.id, userId);
	const detail = await getStudioProjectDetail(project.id, userId);
	expect(detail.frames[0].revision).toBe(3);
	expect(
		detail.jobs
			.filter((job) => job.jobType === "revise")
			.map((job) => job.status),
	).toEqual(["completed", "completed"]);
	expect(detail.revisions.map((row) => row.frameRevision).sort()).toEqual([
		2, 3,
	]);
});

it("rejects stale bases at enqueue and claim, retaining newer HTML", async () => {
	const { project, userId, frames } = await seed();
	await expect(
		enqueueStudioOperation(project.id, userId, {
			prompt: "Perbaiki padding layar terpilih",
			frameIds: [frames[0].id],
			requestId: crypto.randomUUID(),
			baseRevisions: { [frames[0].id]: 0 },
		}),
	).rejects.toMatchObject({ code: "STUDIO_STALE_REVISION" });
	const [job] = await revise(project.id, userId, [frames[0].id]);
	await db
		.update(studioFrames)
		.set({ revision: 2, htmlCode: "newer external edit" })
		.where(eq(studioFrames.id, frames[0].id));
	await runStudioJobPipeline(job.id, project.id, userId);
	const detail = await getStudioProjectDetail(project.id, userId);
	expect(detail.frames[0].htmlCode).toBe("newer external edit");
	expect(detail.jobs.find((row) => row.id === job.id)).toMatchObject({
		status: "failed",
		errorCode: "STUDIO_STALE_REVISION",
		attempts: 0,
	});
	expect(generation.names).toEqual([]);
});

it("isolates partial selected-frame failure, retries only the failed job while an add is queued", async () => {
	const { project, userId, frames, initial } = await seed();
	await db
		.update(studioFrames)
		.set({
			status: "ready",
			htmlCode: "second approved",
			revision: 1,
			lastJobId: initial.id,
		})
		.where(eq(studioFrames.id, frames[1].id));
	const jobs = await revise(project.id, userId, [frames[0].id, frames[1].id]);
	generation.fail = frames[1].name;
	await Promise.all(
		jobs.map((job) => runStudioJobPipeline(job.id, project.id, userId)),
	);
	const before = await getStudioProjectDetail(project.id, userId);
	expect(before.frames[0].revision).toBe(2);
	expect(before.frames[1].status).toBe("failed");
	expect(before.frames[1].htmlCode).toBe("second approved");
	expect(before.frames.slice(2)).toEqual(frames.slice(2));
	await enqueueStudioOperation(project.id, userId, {
		prompt: "Tambah halaman Profile",
		requestId: crypto.randomUUID(),
	});
	const retries = await Promise.all([
		retryStudioFrame(project.id, userId, frames[1].id),
		retryStudioFrame(project.id, userId, frames[1].id),
	]);
	expect(retries.map((result) => result.retry).sort()).toEqual([
		"already-running",
		"queued",
	]);
	generation.fail = "";
	await runStudioJobPipeline(jobs[1].id, project.id, userId);
	const after = await getStudioProjectDetail(project.id, userId);
	expect(after.frames[0]).toEqual(before.frames[0]);
	expect(after.frames[1].revision).toBe(2);
	expect(after.jobs.find((job) => job.jobType === "add")?.status).toBe(
		"queued",
	);
});

it("terminates failed dependencies explicitly, allows planning recovery with accepted children", async () => {
	const { project, userId, initial } = await seed(true);
	await enqueueStudioOperation(project.id, userId, {
		prompt: "Tambah halaman Profile",
		requestId: crypto.randomUUID(),
	});
	await db
		.update(studioJobs)
		.set({ status: "failed" })
		.where(eq(studioJobs.id, initial.id));
	expect((await retryStudioPlanning(project.id, userId)).status).toBe("queued");
	await db
		.update(studioJobs)
		.set({ status: "failed" })
		.where(eq(studioJobs.id, initial.id));
	await listRunnableStudioJobs();
	const detail = await getStudioProjectDetail(project.id, userId);
	expect(detail.jobs.find((job) => job.jobType === "add")).toMatchObject({
		status: "failed",
		errorCode: "STUDIO_DEPENDENCY_FAILED",
	});
});

it("recovers a lost writer once, fences stale writes, preserves dependent revision", async () => {
	const { project, userId, frames } = await seed();
	const [job] = await revise(project.id, userId, [frames[0].id]);
	await claimStudioJob(job.id, userId, "old");
	const [queued] = await revise(project.id, userId, [frames[0].id]);
	await db
		.update(studioJobs)
		.set({ leaseExpiresAt: new Date(0) })
		.where(eq(studioJobs.id, job.id));
	expect(await recoverStalledStudioJobs(new Date(), userId)).toBe(2);
	await expect(
		withStudioJobWrite(
			{ jobId: job.id, projectId: project.id, userId, workerId: "old" },
			async (tx) => {
				await tx
					.update(studioFrames)
					.set({ htmlCode: "stale" })
					.where(eq(studioFrames.id, frames[0].id));
			},
		),
	).rejects.toThrow();
	await runStudioJobPipeline(job.id, project.id, userId);
	await runStudioJobPipeline(queued.id, project.id, userId);
	const detail = await getStudioProjectDetail(project.id, userId);
	expect(detail.frames[0].revision).toBe(3);
	expect(detail.jobs.find((row) => row.id === job.id)?.attempts).toBe(2);
	expect(detail.revisions).toHaveLength(2);
});

it("makes an exhausted or still-leased queued job unrunnable instead of spinning the dispatcher", async () => {
	const { initial } = await seed();
	await db
		.update(studioJobs)
		.set({
			status: "queued",
			attempts: 1,
			claimedBy: "crashed",
			leaseExpiresAt: new Date(Date.now() + 60_000),
		})
		.where(eq(studioJobs.id, initial.id));
	expect((await listRunnableStudioJobs()).map((job) => job.id)).not.toContain(
		initial.id,
	);
	const [leased] = await db
		.select()
		.from(studioJobs)
		.where(eq(studioJobs.id, initial.id));
	expect(leased).toMatchObject({ status: "queued", claimedBy: "crashed" });

	await db
		.update(studioJobs)
		.set({ attempts: 3, claimedBy: null, leaseExpiresAt: null })
		.where(eq(studioJobs.id, initial.id));
	expect((await listRunnableStudioJobs()).map((job) => job.id)).not.toContain(
		initial.id,
	);
	const [exhausted] = await db
		.select()
		.from(studioJobs)
		.where(eq(studioJobs.id, initial.id));
	expect(exhausted).toMatchObject({
		status: "failed",
		errorCode: "STUDIO_FRAME_FAILED",
		attempts: 3,
	});
	expect(exhausted.finishedAt).not.toBeNull();
});

it("never exposes or claims another tenant's jobs, even with the same request identity", async () => {
	const first = await seed();
	const second = await seed();
	const id = crypto.randomUUID();
	const [job] = await revise(
		first.project.id,
		first.userId,
		[first.frames[0].id],
		id,
	);
	await revise(second.project.id, second.userId, [second.frames[0].id], id);
	expect(await claimStudioJob(job.id, second.userId, "foreign")).toBeNull();
	await expect(
		getStudioProjectDetail(first.project.id, second.userId),
	).rejects.toThrow();
	await expect(
		revise(second.project.id, second.userId, [first.frames[0].id]),
	).rejects.toMatchObject({ code: "STUDIO_INVALID_INPUT" });
	const history = await db
		.select()
		.from(studioRevisions)
		.where(
			and(
				eq(studioRevisions.projectId, first.project.id),
				eq(studioRevisions.frameId, first.frames[0].id),
			),
		);
	expect(history).toEqual([]);
});
