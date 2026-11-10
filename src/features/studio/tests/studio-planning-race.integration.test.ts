import { eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import { db } from "@/db";
import { studioJobs, users } from "@/db/schema";
import type * as FrameGeneration from "../services/studio-frame-generation";
import { claimStudioJob } from "../services/studio-job-lease";
import { runStudioJobPipeline } from "../services/studio-job-pipeline";
import { enqueueStudioOperation } from "../services/studio-operation-enqueue";
import { getStudioProjectDetail } from "../services/studio-project-detail";
import { createStudioProjectWithJob } from "../services/studio-project-enqueue";
import { financeBlueprint } from "./fixtures/studio-evaluation-fixtures";

const provider = vi.hoisted(() => ({
	plan: async () => {},
	frame: async (_name: string) => {},
	calls: [] as string[],
}));
vi.mock("../services/studio-planning-generation", () => ({
	generateStudioPlan: async () => {
		await provider.plan();
		return {
			designBlueprint: financeBlueprint,
			screenPlan: {
				projectTitle: "BukuKas Pro",
				screens: financeBlueprint.screenPlan.map((screen) => ({
					...screen,
					description: screen.role,
					viewport: "mobile",
				})),
			},
		};
	},
}));
vi.mock("../services/studio-frame-generation", async (importOriginal) => ({
	...(await importOriginal<typeof FrameGeneration>()),
	generateValidatedFrameHtml: async (input: { activeScreen: string }) => {
		provider.calls.push(input.activeScreen);
		await provider.frame(input.activeScreen);
		return `<main>${input.activeScreen}</main>`;
	},
}));

function gate() {
	const { promise, resolve } = Promise.withResolvers<void>();
	return { promise, release: resolve };
}
const owners: string[] = [];
async function seed() {
	const userId = crypto.randomUUID();
	owners.push(userId);
	await db
		.insert(users)
		.values({ id: userId, email: `${userId}@example.test` });
	return {
		userId,
		...(await createStudioProjectWithJob(userId, {
			prompt: "Aplikasi kas untuk pemilik usaha kecil dengan empat halaman",
			designMode: "mobile",
			initialPageCount: 4,
		})),
	};
}
afterEach(async () => {
	for (const id of owners.splice(0))
		await db.delete(users).where(eq(users.id, id));
	provider.plan = async () => {};
	provider.frame = async () => {};
	provider.calls = [];
});

it("keeps initial slot IDs and plans only their owner after an add commits during planning", async () => {
	const { userId, project, job, frames } = await seed();
	const planning = gate();
	const started = gate();
	provider.plan = async () => {
		started.release();
		await planning.promise;
	};
	const running = runStudioJobPipeline(job.id, project.id, userId);
	await started.promise;
	const added = await enqueueStudioOperation(project.id, userId, {
		prompt: "Tambahkan halaman Profile",
		requestId: crypto.randomUUID(),
	});
	try {
		expect(added.intent).toBe("add_screen");
	} finally {
		planning.release();
		await running;
	}
	const detail = await getStudioProjectDetail(project.id, userId);
	expect(
		detail.frames
			.filter((frame) => frames.some((slot) => slot.id === frame.id))
			.map((frame) => frame.name),
	).toEqual(financeBlueprint.screenPlan.map((screen) => screen.name));
	expect(detail.frames).toHaveLength(5);
	expect(provider.calls.sort()).toEqual(
		financeBlueprint.screenPlan.map((screen) => screen.name).sort(),
	);
	expect(detail.frames.find((frame) => frame.name === "Profile")?.status).toBe(
		"queued",
	);
});

it("cannot claim an accepted add before its required blueprint is committed", async () => {
	const { userId, project } = await seed();
	const added = await enqueueStudioOperation(project.id, userId, {
		prompt: "Tambahkan halaman Profile",
		requestId: crypto.randomUUID(),
	});
	if (added.intent !== "add_screen") throw new Error("expected add");
	expect(
		await claimStudioJob(added.jobs[0].id, userId, "early-worker"),
	).toBeNull();
	const [stored] = await db
		.select()
		.from(studioJobs)
		.where(eq(studioJobs.id, added.jobs[0].id));
	expect(stored.status).toBe("queued");
	expect(stored.attempts).toBe(0);
});

it("accepts a revision against a pending initial slot without canceling its writer", async () => {
	const { userId, project, frames, job } = await seed();
	const accepted = await enqueueStudioOperation(project.id, userId, {
		prompt: "Perbaiki padding layar yang dipilih",
		frameIds: [frames[0].id],
		requestId: crypto.randomUUID(),
	});
	expect(accepted.intent).toBe("revise_selected");
	const detail = await getStudioProjectDetail(project.id, userId);
	expect(detail.frames).toEqual(frames);
	const [initial] = await db
		.select()
		.from(studioJobs)
		.where(eq(studioJobs.id, job.id));
	expect(initial.status).toBe("queued");
});
