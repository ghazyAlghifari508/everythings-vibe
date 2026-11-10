import { eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import { db } from "@/db";
import { studioFrames, studioJobs, users } from "@/db/schema";
import type * as FrameGeneration from "../services/studio-frame-generation";
import { enqueueStudioOperation } from "../services/studio-operation-enqueue";
import { getStudioProjectDetail } from "../services/studio-project-detail";
import { createStudioProjectWithJob } from "../services/studio-project-enqueue";
import { dispatchStudioWorkerBatch } from "../services/studio-worker-dispatch";
import { financeBlueprint } from "./fixtures/studio-evaluation-fixtures";

const provider = vi.hoisted(() => ({
	active: 0,
	peak: 0,
	initialStarts: 0,
	frame: async (_name: string) => {},
}));
vi.mock("../services/studio-planning-generation", () => ({
	generateStudioPlan: async () => ({
		designBlueprint: financeBlueprint,
		screenPlan: {
			projectTitle: "BukuKas",
			screens: financeBlueprint.screenPlan.map((screen) => ({
				...screen,
				description: screen.role,
				viewport: "mobile",
			})),
		},
	}),
}));
vi.mock("../services/studio-frame-generation", async (importOriginal) => ({
	...(await importOriginal<typeof FrameGeneration>()),
	generateValidatedFrameHtml: async (input: { activeScreen: string }) => {
		provider.peak = Math.max(provider.peak, ++provider.active);
		try {
			await provider.frame(input.activeScreen);
			return `<main>${input.activeScreen}</main>`;
		} finally {
			provider.active--;
		}
	},
}));
const owners: string[] = [];
let seeded = 0;
async function seed() {
	const userId = crypto.randomUUID();
	owners.push(userId);
	await db
		.insert(users)
		.values({ id: userId, email: `${userId}@example.test` });
	return {
		userId,
		...(await createStudioProjectWithJob(userId, {
			prompt: `Aplikasi kas usaha nomor ${++seeded} dengan empat layar berbeda`,
			designMode: "mobile",
			initialPageCount: 4,
		})),
	};
}
afterEach(async () => {
	for (const id of owners.splice(0))
		await db.delete(users).where(eq(users.id, id));
	provider.active = 0;
	provider.peak = 0;
	provider.initialStarts = 0;
	provider.frame = async () => {};
});

it("starts accepted adds before initial completion without exceeding aggregate capacity across projects", async () => {
	const first = await seed();
	const second = await seed();
	const releaseFirst = Promise.withResolvers<void>();
	const releaseSiblings = Promise.withResolvers<void>();
	const allThreeStarted = Promise.withResolvers<void>();
	const profileStarted = Promise.withResolvers<void>();
	const settingsStarted = Promise.withResolvers<void>();
	const initialNames = financeBlueprint.screenPlan.map((screen) => screen.name);
	provider.frame = async (name) => {
		if (initialNames.includes(name)) {
			if (++provider.initialStarts === 3) allThreeStarted.resolve();
			if (name === initialNames[0]) await releaseFirst.promise;
			else await releaseSiblings.promise;
		} else if (name === "Profile") profileStarted.resolve();
		else if (name === "Settings") settingsStarted.resolve();
	};
	const shutdown = new AbortController();
	const dispatch = dispatchStudioWorkerBatch(shutdown.signal);
	try {
		await allThreeStarted.promise;
		const before = await getStudioProjectDetail(first.project.id, first.userId);
		expect(
			before.frames.filter((frame) => frame.status === "generating"),
		).toHaveLength(3);
		const [profile, settings] = await Promise.all([
			enqueueStudioOperation(first.project.id, first.userId, {
				prompt: "Tambahkan halaman Profile",
				requestId: crypto.randomUUID(),
			}),
			enqueueStudioOperation(second.project.id, second.userId, {
				prompt: "Tambahkan halaman Settings",
				requestId: crypto.randomUUID(),
			}),
		]);
		if (profile.intent !== "add_screen" || settings.intent !== "add_screen")
			throw new Error("expected adds");
		await vi.waitFor(
			async () => {
				const [job] = await db
					.select()
					.from(studioJobs)
					.where(eq(studioJobs.id, profile.jobs[0].id));
				expect(job.claimedBy).not.toBeNull();
			},
			{ timeout: 5000 },
		);
		releaseFirst.resolve();
		await profileStarted.promise;
		await vi.waitFor(async () => {
			const detail = await getStudioProjectDetail(
				first.project.id,
				first.userId,
			);
			expect(
				detail.frames.find((frame) => frame.id === profile.frames[0].id)
					?.status,
			).toBe("ready");
			expect(detail.jobs.find((job) => job.id === first.job.id)?.status).toBe(
				"generating",
			);
		});
		const ready = await db
			.select()
			.from(studioFrames)
			.where(eq(studioFrames.id, first.frames[0].id));
		expect(ready[0].revision).toBe(1);
		const revision = await enqueueStudioOperation(
			first.project.id,
			first.userId,
			{
				prompt: "Perbaiki padding layar terpilih",
				frameIds: [first.frames[0].id],
				requestId: crypto.randomUUID(),
			},
		);
		if (revision.intent === "clarify") throw new Error("expected revision");
		releaseSiblings.resolve();
		await settingsStarted.promise;
		await dispatch;
		const final = await getStudioProjectDetail(first.project.id, first.userId);
		expect(final.frames).toHaveLength(5);
		expect(final.frames.slice(0, 4).map((frame) => frame.id)).toEqual(
			first.frames.map((frame) => frame.id),
		);
		expect(final.frames.map((frame) => frame.status)).toEqual([
			"ready",
			"ready",
			"ready",
			"ready",
			"ready",
		]);
		expect(provider.peak).toBe(3);
		expect(provider.active).toBe(0);
		expect(
			(
				await getStudioProjectDetail(second.project.id, second.userId)
			).frames.map((frame) => frame.status),
		).toEqual(["ready", "ready", "ready", "ready", "ready"]);
	} finally {
		releaseFirst.resolve();
		releaseSiblings.resolve();
		// A stuck gate must not outlive the test and keep the cluster-wide dispatch
		// lock, which would block every later worker or lock test.
		shutdown.abort(new Error("test teardown"));
		await dispatch;
	}
}, 20000);

it("merges two concurrent blueprint additions and preserves approved sibling rows", async () => {
	const seeded = await seed();
	await dispatchStudioWorkerBatch();
	const before = await getStudioProjectDetail(seeded.project.id, seeded.userId);
	await enqueueStudioOperation(seeded.project.id, seeded.userId, {
		prompt: "Tambahkan halaman Profile",
		requestId: crypto.randomUUID(),
	});
	await enqueueStudioOperation(seeded.project.id, seeded.userId, {
		prompt: "Tambahkan halaman Settings",
		requestId: crypto.randomUUID(),
	});
	const started = Promise.withResolvers<void>();
	let count = 0;
	provider.frame = async () => {
		if (++count === 2) started.resolve();
		await started.promise;
	};
	const shutdown = new AbortController();
	await dispatchStudioWorkerBatch(shutdown.signal);
	shutdown.abort(new Error("test teardown"));
	const detail = await getStudioProjectDetail(seeded.project.id, seeded.userId);
	expect(detail.frames.slice(0, 4)).toEqual(before.frames);
	expect(
		detail.project.designBlueprint?.screenPlan.map((screen) => screen.name),
	).toEqual(
		expect.arrayContaining([
			"Profile",
			"Settings",
			...financeBlueprint.screenPlan.map((screen) => screen.name),
		]),
	);
	expect(
		detail.jobs.filter((job) => job.jobType === "add").map((job) => job.status),
	).toEqual(["completed", "completed"]);
}, 20000);
