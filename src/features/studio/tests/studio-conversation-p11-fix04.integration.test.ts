import { and, eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import { db } from "@/db";
import {
	studioFrames,
	studioMessages,
	studioProjects,
	studioRevisions,
	users,
} from "@/db/schema";
import { synchronizeStudioConversation } from "../services/studio-conversation";
import type * as FrameGeneration from "../services/studio-frame-generation";
import { runStudioJobPipeline } from "../services/studio-job-pipeline";
import { enqueueStudioOperation } from "../services/studio-operation-enqueue";
import { getStudioProjectDetail } from "../services/studio-project-detail";
import {
	buildStudioThumbnailDocument,
	readStudioThumbnailHttp,
} from "../services/studio-thumbnail-http";

const generation = vi.hoisted(() => ({
	html: (screen: string) =>
		`<html><head></head><body><h1>${screen}</h1><label>Nama</label><input><button>Simpan</button></body></html>`,
	calls: 0,
}));
vi.mock("../services/studio-frame-generation", async (importOriginal) => {
	const original = await importOriginal<typeof FrameGeneration>();
	return {
		...original,
		generateValidatedFrameHtml: async (input: { activeScreen: string }) => {
			generation.calls += 1;
			return generation.html(input.activeScreen);
		},
	};
});

const BLUEPRINT = {
	productIdentity: {
		productName: "Kasir Cepat",
		targetAudience: "Pemilik warung",
		platform: "web" as const,
		visualDirection: "Editorial",
	},
	designTokens: {
		primary: "#123456",
		secondary: "#555555",
		background: "#ffffff",
		surface: "#fafafa",
		fontFamily: "Arial",
		radius: 8,
		border: "1px solid #dddddd",
		elevation: "none",
	},
	sharedComponents: {
		header: "App bar",
		navigation: "Top tabs",
		buttons: "Solid",
		inputs: "Bordered",
		cards: "Flat",
		tabs: "Underline",
		icons: "Outline",
	},
	navigationContract: {
		destinations: ["dashboard"],
		labels: ["Dashboard"],
		iconMapping: { dashboard: "home" },
		ordering: ["dashboard"],
		activeItemRule: "Match screen",
	},
	screenPlan: [{ name: "Dashboard", role: "Ringkasan penjualan", order: 0 }],
};

const BASE_HTML = "<html><head></head><body><h1>Dashboard</h1></body></html>";
const owners: string[] = [];
async function seed() {
	const userId = crypto.randomUUID();
	owners.push(userId);
	await db
		.insert(users)
		.values({ id: userId, email: `${userId}@example.test` });
	const [project] = await db
		.insert(studioProjects)
		.values({ userId, title: "Kasir", designBlueprint: BLUEPRINT })
		.returning();
	const [frame] = await db
		.insert(studioFrames)
		.values({
			projectId: project.id,
			name: "Dashboard",
			order: 0,
			htmlCode: BASE_HTML,
			status: "ready",
			revision: 1,
		})
		.returning();
	// Every persisted revision has a history row; a revise turn compares against it.
	await db.insert(studioRevisions).values({
		projectId: project.id,
		frameId: frame.id,
		frameRevision: 1,
		prompt: "Buat dashboard",
		htmlCode: BASE_HTML,
		version: 1,
	});
	return { userId, project, frame };
}
async function run(
	projectId: string,
	userId: string,
	prompt: string,
	frameIds?: string[],
) {
	const accepted = await enqueueStudioOperation(projectId, userId, {
		prompt,
		frameIds,
		requestId: crypto.randomUUID(),
	});
	if (accepted.intent === "clarify") throw new Error("expected operation");
	for (const job of accepted.jobs)
		await runStudioJobPipeline(job.id, projectId, userId);
	return accepted;
}
afterEach(async () => {
	for (const id of owners.splice(0))
		await db.delete(users).where(eq(users.id, id));
	generation.calls = 0;
});

const assistant = async (projectId: string, userId: string) =>
	(await getStudioProjectDetail(projectId, userId)).messages?.filter(
		(message) => message.role === "assistant",
	) ?? [];

it("queued turns carry no authored text and no template that a worker tick could shorten", async () => {
	const { userId, project } = await seed();
	await enqueueStudioOperation(project.id, userId, {
		prompt: "Tambah halaman Profil dengan data pemesan",
		requestId: crypto.randomUUID(),
	});
	const [queued] = await assistant(project.id, userId);
	expect(queued.status).toBe("queued");
	expect(queued.content).toBe("");
	expect(queued.progress?.frames?.[0]).toMatchObject({ status: "pending" });
});

it("explains an added screen from its real HTML, attaches only its own frame, and survives reload unchanged", async () => {
	const { userId, project, frame } = await seed();
	await run(project.id, userId, "Tambah halaman Profil dengan data pemesan");
	const [turn] = await assistant(project.id, userId);
	expect(turn.status).toBe("completed");
	const added = turn.progress?.frames ?? [];
	expect(added).toHaveLength(1);
	expect(added[0].frameId).not.toBe(frame.id);
	expect(added[0].facts?.fields).toEqual(["Nama"]);
	expect(turn.content).toContain("“Simpan”");
	expect(turn.content).toContain("Autentikasi, penyimpanan data");
	// Reload: content and frames are persisted, not recomputed differently.
	const again = (await assistant(project.id, userId))[0];
	expect(again.content).toBe(turn.content);
	expect(again.progress?.frames).toEqual(turn.progress?.frames);
});

it("does not rewrite a finished explanation on repeated synchronisation or after the frame is edited", async () => {
	const { userId, project } = await seed();
	await run(project.id, userId, "Tambah halaman Profil dengan data pemesan");
	const [before] = await assistant(project.id, userId);
	const pinned = before.progress?.frames?.[0];
	if (!pinned) throw new Error("expected pinned frame");
	await db
		.update(studioFrames)
		.set({
			htmlCode: "<html><body><h1>Diganti lewat Pencil</h1></body></html>",
			revision: pinned.revision + 3,
		})
		.where(eq(studioFrames.id, pinned.frameId));
	for (let i = 0; i < 3; i++)
		await db.transaction((tx) =>
			synchronizeStudioConversation(tx, project.id, userId),
		);
	const [after] = await assistant(project.id, userId);
	expect(after.content).toBe(before.content);
	expect(after.content).not.toContain("Diganti lewat Pencil");
	expect(after.progress?.frames).toEqual(before.progress?.frames);
	expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
});

it("reports a revision from the two committed revisions and keeps it truthful when output is unchanged", async () => {
	const { userId, project, frame } = await seed();
	generation.html = (screen) =>
		`<html><head></head><body><h1>${screen}</h1><button>Bayar Sekarang</button></body></html>`;
	await run(project.id, userId, "Ubah teks tombol menjadi Bayar Sekarang", [
		frame.id,
	]);
	const [revision] = await assistant(project.id, userId);
	expect(revision.progress?.kind).toBe("revise");
	expect(revision.progress?.frames?.[0].changes).toMatchObject({
		kind: "text",
	});
	expect(revision.content).toContain("“Bayar Sekarang”");
	expect(revision.progress?.frames?.[0].revision).toBeGreaterThan(
		frame.revision,
	);

	// A second revision that produces identical markup must say so.
	await run(
		project.id,
		userId,
		"Ubah teks tombol menjadi Bayar Sekarang lagi",
		[frame.id],
	);
	const turns = await assistant(project.id, userId);
	expect(turns).toHaveLength(2);
	expect(turns[1].content).toContain("identik");
	// The first turn is untouched by the second operation.
	expect(turns[0].content).toBe(revision.content);
});

it("keeps concurrent operations bound to their own jobs and frames with no duplicates", async () => {
	const { userId, project } = await seed();
	const [a, b] = await Promise.all([
		enqueueStudioOperation(project.id, userId, {
			prompt: "Tambah halaman Profil dengan data pemesan",
			requestId: crypto.randomUUID(),
		}),
		enqueueStudioOperation(project.id, userId, {
			prompt: "Tambah halaman Riwayat dengan daftar transaksi",
			requestId: crypto.randomUUID(),
		}),
	]);
	if (a.intent === "clarify" || b.intent === "clarify")
		throw new Error("expected operations");
	await Promise.all([
		runStudioJobPipeline(a.jobs[0].id, project.id, userId),
		runStudioJobPipeline(b.jobs[0].id, project.id, userId),
	]);
	const turns = await assistant(project.id, userId);
	expect(turns).toHaveLength(2);
	const ids = turns.flatMap((turn) =>
		(turn.progress?.frames ?? []).map((entry) => entry.frameId),
	);
	expect(new Set(ids).size).toBe(2);
	expect(ids).toHaveLength(2);
	for (const turn of turns) expect(turn.progress?.frames).toHaveLength(1);
});

it("reports a failed screen as failed with no description of unseen content", async () => {
	const { userId, project } = await seed();
	generation.html = () => {
		throw new Error("provider failed");
	};
	await run(project.id, userId, "Tambah halaman Profil dengan data pemesan");
	const [turn] = await assistant(project.id, userId);
	expect(turn.status).toBe("failed");
	expect(turn.progress?.frames?.[0].status).toBe("failed");
	expect(turn.content).toContain("belum berhasil");
	expect(turn.content).not.toContain("“Simpan”");
	expect(JSON.stringify(turn)).not.toContain("provider failed");
	generation.html = (screen) => `<html><body><h1>${screen}</h1></body></html>`;
});

it("adds no model call for explanations and charges no credit for reading them", async () => {
	const { userId, project } = await seed();
	await run(project.id, userId, "Tambah halaman Profil dengan data pemesan");
	const generated = generation.calls;
	for (let i = 0; i < 3; i++) await assistant(project.id, userId);
	expect(generation.calls).toBe(generated);
	expect(generated).toBe(1);
});

it("never touches another user's messages when synchronising", async () => {
	const first = await seed();
	const second = await seed();
	await run(
		first.project.id,
		first.userId,
		"Tambah halaman Profil dengan data pemesan",
	);
	const rows = await db
		.select()
		.from(studioMessages)
		.where(
			and(
				eq(studioMessages.projectId, second.project.id),
				eq(studioMessages.userId, second.userId),
			),
		);
	expect(rows).toHaveLength(0);
});

it("serves a script-free thumbnail document only to the owner and only for ready frames", async () => {
	const { userId, project, frame } = await seed();
	await db
		.update(studioFrames)
		.set({
			htmlCode:
				'<html><head><script>window.pwn=1</script></head><body onload="x()"><h1>Halo</h1><a href="https://evil.test">x</a></body></html>',
		})
		.where(eq(studioFrames.id, frame.id));
	const document = await buildStudioThumbnailDocument(
		{ projectId: project.id, frameId: frame.id },
		userId,
		"http://localhost:3000",
	);
	expect(document.html).toContain("Halo");
	expect(document.html).not.toContain("window.pwn");
	expect(document.html).not.toContain("onload");
	expect(document.html).not.toContain("evil.test");
	expect(document.html).toContain("script-src 'none'");
	expect(document.revision).toBe(frame.revision);

	const stranger = await seed();
	await expect(
		buildStudioThumbnailDocument(
			{ projectId: project.id, frameId: frame.id },
			stranger.userId,
			"http://localhost:3000",
		),
	).rejects.toThrow();
	await db
		.update(studioFrames)
		.set({ status: "failed" })
		.where(eq(studioFrames.id, frame.id));
	await expect(
		buildStudioThumbnailDocument(
			{ projectId: project.id, frameId: frame.id },
			userId,
			"http://localhost:3000",
		),
	).rejects.toThrow();
	expect(
		await readStudioThumbnailHttp(
			new URL("http://localhost:3000/api/studio/frame?x=1"),
			userId,
		),
	).toBeNull();
});
