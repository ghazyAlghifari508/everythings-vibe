import { eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import { db } from "@/db";
import {
	studioFrames,
	studioJobs,
	studioProjects,
	subscriptions,
	users,
} from "@/db/schema";
import { runStudioJobPipeline } from "../services/studio-job-pipeline";
import { getStudioProjectDetail } from "../services/studio-project-detail";
import { retryStudioFrame } from "../services/studio-retry-service";

const provider = vi.hoisted(() => ({
	run: async (_signal?: AbortSignal, _prompt?: string): Promise<string> => {
		throw new Error("No fixture response");
	},
}));
vi.mock("@/lib/services/ai-orchestrator", () => ({
	selectModels: () => ["fixture"],
	tryStreamWithFallback: async (
		_models: unknown,
		messages: Array<{ role: string; content: string }>,
		signal?: AbortSignal,
	) => ({
		firstChunk: await provider.run(
			signal,
			messages.find((message) => message.role === "user")?.content,
		),
		generator: (async function* () {})(),
	}),
}));
const owners: string[] = [];
async function seed() {
	const userId = crypto.randomUUID();
	owners.push(userId);
	await db
		.insert(users)
		.values({ id: userId, email: `${userId}@example.test` });
	const [project] = await db
		.insert(studioProjects)
		.values({ userId, title: "Synthetic product" })
		.returning();
	await db
		.insert(studioFrames)
		.values({ projectId: project.id, name: "Overview", status: "queued" });
	const [job] = await db
		.insert(studioJobs)
		.values({
			projectId: project.id,
			userId,
			prompt: "Synthetic product requirements",
		})
		.returning();
	return { userId, project, job };
}
afterEach(async () => {
	for (const owner of owners.splice(0)) {
		await db.delete(subscriptions).where(eq(subscriptions.userId, owner));
		await db.delete(users).where(eq(users.id, owner));
	}
});

it("preserves two completed frames when the third fails and retries only that frame without charging", async () => {
	const { job, project, userId } = await seed();
	await db.insert(subscriptions).values({
		id: crypto.randomUUID(),
		userId,
		credits: 10,
		creditsUsed: 2,
		creditsReserved: 1,
	});
	await db.insert(studioFrames).values([
		{ projectId: project.id, name: "Second", order: 1, status: "queued" },
		{ projectId: project.id, name: "Third", order: 2, status: "queued" },
	]);
	provider.run = async (_signal, prompt) => {
		if (prompt?.includes('SCREEN TO BUILD: "Third"'))
			throw new Error("synthetic unrecoverable provider failure");
		return "<html><body>Completed content</body></html>";
	};
	try {
		await runStudioJobPipeline(job.id, project.id, userId);
		const detail = await getStudioProjectDetail(project.id, userId);
		expect(detail.frames.map((frame) => frame.status)).toEqual([
			"ready",
			"ready",
			"failed",
		]);
		const [finished] = await db
			.select()
			.from(studioJobs)
			.where(eq(studioJobs.id, job.id));
		expect(finished.status).toBe("partial");
		const saved = detail.frames.slice(0, 2);
		const failed = detail.frames[2];
		const retries = await Promise.all([
			retryStudioFrame(project.id, userId, failed.id),
			retryStudioFrame(project.id, userId, failed.id),
		]);
		expect(retries.map((result) => result.retry).sort()).toEqual([
			"already-running",
			"queued",
		]);
		provider.run = async () => "<html><body>Recovered content</body></html>";
		const next = await getStudioProjectDetail(project.id, userId);
		if (!next.activeJob) throw new Error("Missing queued retry");
		await runStudioJobPipeline(next.activeJob.id, project.id, userId);
		const after = await getStudioProjectDetail(project.id, userId);
		expect(after.frames.slice(0, 2)).toEqual(saved);
		expect(after.frames[2].status).toBe("ready");
		const [balance] = await db
			.select()
			.from(subscriptions)
			.where(eq(subscriptions.userId, userId));
		expect([
			balance.credits,
			balance.creditsUsed,
			balance.creditsReserved,
		]).toEqual([10, 2, 1]);
	} finally {
		await db.delete(subscriptions).where(eq(subscriptions.userId, userId));
	}
});
