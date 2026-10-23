import { eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import { db } from "@/db";
import { studioFrames, studioJobs, studioProjects, users } from "@/db/schema";
import { runStudioJobPipeline } from "../services/studio-job-pipeline";
import { getStudioProjectDetail } from "../services/studio-project-detail";
import {
	retryStudioFrame,
	retryStudioPlanning,
} from "../services/studio-retry-service";
import { STUDIO_JOB_CLAIM_TTL_MS } from "../types/studio-constants";

const provider = vi.hoisted(() => ({
	calls: 0,
	run: async (_signal?: AbortSignal, _prompt?: string): Promise<string> => {
		throw new Error("synthetic failure");
	},
}));
vi.mock("@/lib/services/ai-orchestrator", () => ({
	selectModels: () => ["fixture"],
	tryStreamWithFallback: async (
		_models: unknown,
		messages: Array<{ role: string; content: string }>,
		signal?: AbortSignal,
	) => {
		provider.calls++;
		return {
			firstChunk: await provider.run(
				signal,
				messages.find((message) => message.role === "user")?.content,
			),
			generator: (async function* () {})(),
		};
	},
}));
vi.mock("../services/studio-job-runtime", async (importOriginal) => {
	const original =
		await importOriginal<typeof import("../services/studio-job-runtime")>();
	return {
		...original,
		withStudioHeartbeat: <T>(
			renew: () => Promise<boolean>,
			work: (signal: AbortSignal) => Promise<T>,
		) =>
			original.withStudioHeartbeat(renew, work, {
				heartbeatMs: 10,
				timeoutMs: 5_000,
			}),
	};
});
const owners: string[] = [];
async function seed(jobType = "initial", planned = true) {
	const userId = crypto.randomUUID();
	owners.push(userId);
	await db
		.insert(users)
		.values({ id: userId, email: `${userId}@example.test` });
	const [project] = await db
		.insert(studioProjects)
		.values({ userId, title: "Fixture", initialPageCount: 1 })
		.returning();
	const [frame] = await db
		.insert(studioFrames)
		.values({
			projectId: project.id,
			name: planned ? "Overview" : "Layar 1",
			status: "queued",
		})
		.returning();
	const [job] = await db
		.insert(studioJobs)
		.values({
			projectId: project.id,
			userId,
			jobType,
			targetFrameId: jobType === "initial" ? null : frame.id,
			prompt: "Synthetic brief",
		})
		.returning();
	return { userId, project, frame, job };
}
afterEach(async () => {
	for (const id of owners.splice(0))
		await db.delete(users).where(eq(users.id, id));
	provider.calls = 0;
});

it.each([
	"initial",
	"revise",
])("fences stale %s frame failure and completion writes", async (jobType) => {
	for (const success of [false, true]) {
		const { job, project, frame, userId } = await seed(jobType);
		provider.run = async () => {
			await db
				.update(studioJobs)
				.set({
					claimedBy: "replacement",
					leaseExpiresAt: new Date(Date.now() + 60_000),
				})
				.where(eq(studioJobs.id, job.id));
			await db
				.update(studioFrames)
				.set({ status: "ready", htmlCode: "replacement output" })
				.where(eq(studioFrames.id, frame.id));
			if (!success) throw new Error("synthetic failure");
			return '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>sample</body></html>';
		};
		await runStudioJobPipeline(job.id, project.id, userId);
		const [stored] = await db
			.select()
			.from(studioFrames)
			.where(eq(studioFrames.id, frame.id));
		expect(stored.status).toBe("ready");
		expect(stored.htmlCode).toBe("replacement output");
		const [current] = await db
			.select()
			.from(studioJobs)
			.where(eq(studioJobs.id, job.id));
		expect(current.status).toBe("generating");
		expect(current.claimedBy).toBe("replacement");
	}
});

it("does not persist a stale planning failure", async () => {
	const { job, project, userId } = await seed("initial", false);
	provider.run = async () => {
		await db
			.update(studioJobs)
			.set({ claimedBy: "replacement" })
			.where(eq(studioJobs.id, job.id));
		throw new Error("synthetic failure");
	};
	await runStudioJobPipeline(job.id, project.id, userId);
	const [stored] = await db
		.select()
		.from(studioJobs)
		.where(eq(studioJobs.id, job.id));
	expect(stored.status).toBe("planning");
	expect(stored.error).toBeNull();
});

it("detail reads do not recover or execute queued work", async () => {
	const { job, project, userId } = await seed();
	provider.run = async () => {
		throw new Error("read must not execute");
	};
	await getStudioProjectDetail(project.id, userId);
	const [stored] = await db
		.select()
		.from(studioJobs)
		.where(eq(studioJobs.id, job.id));
	expect(stored.claimedBy).toBeNull();
	expect(stored.attempts).toBe(0);
	expect(provider.calls).toBe(0);
});

it("manual planning retry clears terminal claims and rejects duplicate retry", async () => {
	const { job, project, userId } = await seed("initial", false);
	await db
		.update(studioJobs)
		.set({
			status: "failed",
			attempts: 3,
			claimedBy: "old",
			leaseExpiresAt: new Date(),
			finishedAt: new Date(),
		})
		.where(eq(studioJobs.id, job.id));
	const retried = await retryStudioPlanning(project.id, userId);
	expect(retried.status).toBe("queued");
	expect(retried.claimedBy).toBeNull();
	expect(retried.leaseExpiresAt).toBeNull();
	expect(retried.attempts).toBe(0);
	expect(retried.finishedAt).toBeNull();
	await expect(retryStudioPlanning(project.id, userId)).rejects.toThrow();
});

it("manual operation retry clears its old lease and permits only one concurrent retry", async () => {
	const { job, project, frame, userId } = await seed("revise");
	await db
		.update(studioJobs)
		.set({
			status: "failed",
			attempts: 3,
			claimedBy: "old",
			leaseExpiresAt: new Date(),
			finishedAt: new Date(),
		})
		.where(eq(studioJobs.id, job.id));
	await db
		.update(studioFrames)
		.set({ status: "failed" })
		.where(eq(studioFrames.id, frame.id));
	const results = await Promise.allSettled([
		retryStudioFrame(project.id, userId, frame.id),
		retryStudioFrame(project.id, userId, frame.id),
	]);
	expect(
		results.filter((result) => result.status === "fulfilled"),
	).toHaveLength(1);
	const [stored] = await db
		.select()
		.from(studioJobs)
		.where(eq(studioJobs.id, job.id));
	expect(stored.status).toBe("queued");
	expect(stored.attempts).toBe(0);
	expect(stored.claimedBy).toBeNull();
	expect(stored.leaseExpiresAt).toBeNull();
	expect(stored.finishedAt).toBeNull();
});

it("persists one ready frame while another frame is still generating", async () => {
	const { job, project, frame, userId } = await seed();
	const [second] = await db
		.insert(studioFrames)
		.values({
			projectId: project.id,
			name: "Second",
			order: 1,
			status: "queued",
		})
		.returning();
	let release: () => void = () => {};
	const waiting = new Promise<void>((resolve) => {
		release = resolve;
	});
	// Block the frame by its own target marker, not the second provider call:
	// workers reach the provider in whatever order the pool schedules them, and
	// every prompt lists all screen names for navigation continuity.
	provider.run = async (_signal, prompt) => {
		if (prompt?.includes('SCREEN TO BUILD: "Second"')) await waiting;
		return '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>sample</body></html>';
	};
	const running = runStudioJobPipeline(job.id, project.id, userId);
	try {
		await vi.waitFor(async () => {
			const [stored] = await db
				.select()
				.from(studioFrames)
				.where(eq(studioFrames.id, frame.id));
			expect(stored.status).toBe("ready");
		});
		const [pending] = await db
			.select()
			.from(studioFrames)
			.where(eq(studioFrames.id, second.id));
		expect(pending.status).toBe("generating");
		const [active] = await db
			.select()
			.from(studioJobs)
			.where(eq(studioJobs.id, job.id));
		expect(active.status).toBe("generating");
	} finally {
		release();
		await running;
	}
});

it.each([
	"planning",
	"initial-frame",
	"operation",
])("renews the lease during long %s model work", async (stage) => {
	const { job, project, userId } = await seed(
		stage === "operation" ? "revise" : "initial",
		stage !== "planning",
	);
	let renewed = false;
	provider.run = async (signal) => {
		expect(signal).toBeInstanceOf(AbortSignal);
		for (let poll = 0; poll < 100; poll++) {
			const [current] = await db
				.select()
				.from(studioJobs)
				.where(eq(studioJobs.id, job.id));
			if (
				current.leaseExpiresAt &&
				current.claimedAt &&
				current.leaseExpiresAt.getTime() >
					current.claimedAt.getTime() + STUDIO_JOB_CLAIM_TTL_MS + 5
			) {
				renewed = true;
				break;
			}
			await new Promise((resolve) => setTimeout(resolve, 5));
		}
		throw new Error("synthetic bounded provider failure");
	};
	await runStudioJobPipeline(job.id, project.id, userId);
	expect(renewed).toBe(true);
});

it("reclaims interrupted initial work without regenerating a ready frame and finalizes once", async () => {
	const { job, project, frame, userId } = await seed();
	await db
		.update(studioFrames)
		.set({ status: "ready", htmlCode: "saved output" })
		.where(eq(studioFrames.id, frame.id));
	await db.insert(studioFrames).values({
		projectId: project.id,
		name: "Second",
		order: 1,
		status: "generating",
	});
	await db
		.update(studioJobs)
		.set({
			status: "generating",
			claimedBy: "interrupted",
			attempts: 1,
			leaseExpiresAt: new Date(0),
		})
		.where(eq(studioJobs.id, job.id));
	provider.run = async () =>
		'<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>sample</body></html>';
	await runStudioJobPipeline(job.id, project.id, userId);
	await runStudioJobPipeline(job.id, project.id, userId);
	expect(provider.calls).toBe(1);
	const [saved] = await db
		.select()
		.from(studioFrames)
		.where(eq(studioFrames.id, frame.id));
	expect(saved.htmlCode).toBe("saved output");
	expect(saved.status).toBe("ready");
	const [finished] = await db
		.select()
		.from(studioJobs)
		.where(eq(studioJobs.id, job.id));
	expect(finished.status).toBe("completed");
	expect(finished.attempts).toBe(2);
	expect(finished.finishedAt).not.toBeNull();
});
