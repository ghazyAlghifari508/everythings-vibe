import { asc, eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import { db } from "@/db";
import {
	studioFrames,
	studioJobs,
	studioProjects,
	studioRevisions,
	users,
} from "@/db/schema";
import { enqueueStudioOperation } from "../services/studio-operation-enqueue";
import { getStudioProjectDetail } from "../services/studio-project-detail";

// The bounded classifier answers "clarify" for anything the deterministic
// resolver cannot decide; deterministic prompts never reach the provider.
vi.mock("@/lib/services/ai-orchestrator", () => ({
	selectModels: () => ["fixture"],
	tryStreamWithFallback: async () => ({
		firstChunk: '{"intent":"clarify"}',
		generator: (async function* () {})(),
	}),
}));

const owners: string[] = [];
async function seedProject() {
	const userId = crypto.randomUUID();
	owners.push(userId);
	await db
		.insert(users)
		.values({ id: userId, email: `${userId}@example.test` });
	const [project] = await db
		.insert(studioProjects)
		.values({ userId, title: "Sample" })
		.returning();
	const frames = await db
		.insert(studioFrames)
		.values(
			["First", "Second", "Third", "Fourth"].map((name, order) => ({
				projectId: project.id,
				name,
				order,
				htmlCode: `<html><head></head><body>${name}</body></html>`,
				status: "ready" as const,
			})),
		)
		.returning();
	return { userId, project, frames };
}

async function storedFrames(projectId: string) {
	return db
		.select()
		.from(studioFrames)
		.where(eq(studioFrames.projectId, projectId))
		.orderBy(asc(studioFrames.order));
}

afterEach(async () => {
	for (const id of owners.splice(0))
		await db.delete(users).where(eq(users.id, id));
});

it("adds exactly one screen and leaves every existing frame untouched", async () => {
	const { userId, project, frames } = await seedProject();
	const accepted = await enqueueStudioOperation(project.id, userId, {
		prompt: "Tambah halaman Profile untuk aplikasi ini",
		requestId: crypto.randomUUID(),
	});
	expect(accepted.intent).toBe("add_screen");
	if (accepted.intent !== "add_screen") throw new Error("expected add_screen");
	expect(accepted.frames).toHaveLength(1);
	expect(accepted.frames[0]?.name).toBe("Profile");
	expect(accepted.jobs).toHaveLength(1);
	expect(accepted.jobs[0]?.jobType).toBe("add");

	// The new frame is persisted and the four existing rows are byte-identical.
	const stored = await storedFrames(project.id);
	expect(stored).toHaveLength(5);
	for (const frame of frames) {
		const after = stored.find((entry) => entry.id === frame.id);
		expect(after?.htmlCode).toBe(frame.htmlCode);
		expect(after?.status).toBe("ready");
	}
	// Reopening the project keeps the new screen available on the canvas.
	const detail = await getStudioProjectDetail(project.id, userId);
	expect(detail.frames).toHaveLength(5);
	expect(detail.frames.map((frame) => frame.name)).toContain("Profile");
	expect(detail.activeJob?.jobType).toBe("add");
});

it("creates one frame per requested screen name", async () => {
	const { userId, project } = await seedProject();
	const accepted = await enqueueStudioOperation(project.id, userId, {
		prompt: "Buat dua halaman: Login dan Register",
		requestId: crypto.randomUUID(),
	});
	expect(accepted.intent).toBe("add_screen");
	if (accepted.intent !== "add_screen") throw new Error("expected add_screen");
	expect(accepted.frames.map((frame) => frame.name)).toEqual([
		"Login",
		"Register",
	]);
	expect(accepted.frames.map((frame) => frame.order)).toEqual([4, 5]);
	const stored = await storedFrames(project.id);
	expect(stored).toHaveLength(6);
	expect(stored.slice(4).map((frame) => frame.status)).toEqual([
		"queued",
		"queued",
	]);
});

it("does not duplicate added frames when the same request is repeated", async () => {
	const { userId, project } = await seedProject();
	const requestId = crypto.randomUUID();
	const input = {
		prompt: "Tambah halaman Profile",
		requestId,
	};
	const first = await enqueueStudioOperation(project.id, userId, input);
	const repeated = await enqueueStudioOperation(project.id, userId, input);
	if (first.intent !== "add_screen" || repeated.intent !== "add_screen")
		throw new Error("expected add_screen");
	expect(repeated.jobs.map((job) => job.id)).toEqual(
		first.jobs.map((job) => job.id),
	);
	expect(repeated.frames).toHaveLength(0);
	expect(await storedFrames(project.id)).toHaveLength(5);
});

it("rejects a new screen whose name already exists", async () => {
	const { userId, project } = await seedProject();
	await expect(
		enqueueStudioOperation(project.id, userId, {
			prompt: "Tambah halaman First",
			requestId: crypto.randomUUID(),
		}),
	).rejects.toThrow();
	expect(await storedFrames(project.id)).toHaveLength(4);
});

it("targets only the selected frames for a selected-frame revision", async () => {
	const { userId, project, frames } = await seedProject();
	const accepted = await enqueueStudioOperation(project.id, userId, {
		frameIds: frames.slice(0, 2).map((frame) => frame.id),
		prompt: "Perbaiki padding halaman yang saya pilih",
		requestId: crypto.randomUUID(),
	});
	expect(accepted.intent).toBe("revise_selected");
	if (accepted.intent === "clarify") throw new Error("unexpected clarify");
	expect(accepted.jobs).toHaveLength(2);
	expect(accepted.jobs.map((job) => job.targetFrameId)).toEqual(
		frames.slice(0, 2).map((frame) => frame.id),
	);
	const stored = await storedFrames(project.id);
	expect(stored[2]?.status).toBe("ready");
	expect(stored[2]?.htmlCode).toBe(frames[2]?.htmlCode);
});

it("revises every frame only when the message explicitly asks for it", async () => {
	const { userId, project } = await seedProject();
	const accepted = await enqueueStudioOperation(project.id, userId, {
		prompt: "Ubah semua halaman menjadi lebih minimal",
		requestId: crypto.randomUUID(),
	});
	expect(accepted.intent).toBe("revise_project");
	if (accepted.intent === "clarify") throw new Error("unexpected clarify");
	expect(accepted.jobs).toHaveLength(4);
	const stored = await storedFrames(project.id);
	expect(stored.every((frame) => frame.status === "queued")).toBe(true);
});

it("clarifies instead of regenerating when the instruction has no target", async () => {
	const { userId, project, frames } = await seedProject();
	const accepted = await enqueueStudioOperation(project.id, userId, {
		prompt: "Bikin lebih bagus",
		requestId: crypto.randomUUID(),
	});
	expect(accepted.intent).toBe("clarify");
	expect(
		await db
			.select()
			.from(studioJobs)
			.where(eq(studioJobs.projectId, project.id)),
	).toHaveLength(0);
	const stored = await storedFrames(project.id);
	for (const frame of frames) {
		const after = stored.find((entry) => entry.id === frame.id);
		expect(after?.status).toBe("ready");
		expect(after?.htmlCode).toBe(frame.htmlCode);
	}
});

it("enforces project ownership and frame membership", async () => {
	const { userId, project, frames } = await seedProject();
	await expect(
		enqueueStudioOperation(project.id, crypto.randomUUID(), {
			prompt: "Perbaiki padding halaman yang saya pilih",
			frameIds: [frames[0]?.id ?? "missing"],
			requestId: crypto.randomUUID(),
		}),
	).rejects.toThrow();
	await expect(
		enqueueStudioOperation(project.id, userId, {
			prompt: "Perbaiki padding halaman yang saya pilih",
			frameIds: ["foreign-frame"],
			requestId: crypto.randomUUID(),
		}),
	).rejects.toThrow();
	expect(
		await db
			.select()
			.from(studioJobs)
			.where(eq(studioJobs.projectId, project.id)),
	).toHaveLength(0);
});

it("writes a revision row for a completed pipeline, not for a queued operation", async () => {
	const { userId, project } = await seedProject();
	await enqueueStudioOperation(project.id, userId, {
		prompt: "Tambah halaman Profile",
		requestId: crypto.randomUUID(),
	});
	const revisions = await db
		.select()
		.from(studioRevisions)
		.where(eq(studioRevisions.projectId, project.id));
	// A queued add must not fabricate an empty revision; the worker writes it
	// only after real HTML exists.
	expect(revisions).toHaveLength(0);
});
