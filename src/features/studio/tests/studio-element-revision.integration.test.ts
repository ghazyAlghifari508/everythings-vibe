import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import {
	creditLedgerEntries,
	studioElementRevisions,
	studioFrames,
	studioJobs,
	studioMessages,
	studioProjects,
	studioRevisions,
	users,
} from "@/db/schema";
import { indexStudioElements } from "../services/studio-element-document";
import { readStudioElementHttp } from "../services/studio-element-http";
import {
	prepareStudioElementRevision,
	readStudioElementRevisions,
	transitionStudioElementRevision,
} from "../services/studio-element-revision";
import { readStudioFrameDocument } from "../services/studio-frame-document";

const model = vi.hoisted(() => ({
	calls: 0,
	response:
		'{"kind":"replace","html":"<section><h2>Updated card</h2></section>"}',
	wait: Promise.resolve(),
}));
vi.mock("@/lib/services/ai-orchestrator", () => ({
	selectModels: () => ["test"],
	tryStreamWithFallback: async () => {
		model.calls++;
		await model.wait;
		return { firstChunk: model.response, generator: (async function* () {})() };
	},
}));
const owners: string[] = [];
const html =
	'<!doctype html><html><head></head><body><nav>Navbar</nav><main><section id="hero">Hero</section><section id="stats"><h2>Statistics</h2></section><section id="projects">Projects</section></main><footer>Contact</footer></body></html>';
async function fixture() {
	const userId = crypto.randomUUID();
	owners.push(userId);
	await db
		.insert(users)
		.values({ id: userId, email: `${userId}@example.test` });
	const [project] = await db
		.insert(studioProjects)
		.values({ userId, title: "Portfolio" })
		.returning();
	const frames = await db
		.insert(studioFrames)
		.values(
			[0, 1].map((order) => ({
				projectId: project.id,
				name: `Frame ${order}`,
				order,
				htmlCode: html,
				status: "ready",
				revision: 5,
			})),
		)
		.returning();
	const context = {
		projectId: project.id,
		frameId: frames[0].id,
		baseRevision: 5,
	};
	const entry = indexStudioElements(html, context).elements.find(
		(item) => item.selector === "#stats",
	);
	if (!entry) throw new Error("Missing target");
	return {
		userId,
		project,
		frames,
		input: {
			requestId: crypto.randomUUID(),
			prompt: "Hapus section ini saja. Pertahankan bagian lain.",
			target: { ...entry, bounds: { x: 0, y: 20, width: 100, height: 50 } },
		},
	};
}
async function stored(frameId: string) {
	const [frame] = await db
		.select()
		.from(studioFrames)
		.where(eq(studioFrames.id, frameId));
	return frame;
}
afterEach(async () => {
	for (const id of owners.splice(0))
		await db.delete(users).where(eq(users.id, id));
	model.calls = 0;
	model.wait = Promise.resolve();
});

describe("persisted scoped revisions", () => {
	it("auto-applies atomically, leaves other frames untouched and rejects late cancel", async () => {
		const { userId, project, frames, input } = await fixture();
		const applied = await prepareStudioElementRevision(userId, input);
		expect(applied.status).toBe("applied");
		expect(applied.appliedRevision).toBe(6);
		expect((await stored(frames[0].id)).htmlCode).toBe(applied.after);
		expect((await stored(frames[0].id)).revision).toBe(6);
		expect((await stored(frames[1].id)).htmlCode).toBe(html);
		expect(
			(
				await db
					.select()
					.from(studioRevisions)
					.where(eq(studioRevisions.projectId, project.id))
			).map((row) => row.frameRevision),
		).toEqual([6]);
		await expect(
			transitionStudioElementRevision(userId, project.id, applied.id, "cancel"),
		).rejects.toMatchObject({ code: "STUDIO_STALE_REVISION" });
		await expect(
			transitionStudioElementRevision(userId, project.id, applied.id, "apply"),
		).resolves.toMatchObject({ status: "applied", appliedRevision: 6 });
	});
	it("applies once, preserves other frames, restores through monotonic Undo and reloads history", async () => {
		const { userId, project, frames, input } = await fixture();
		const applied = await prepareStudioElementRevision(userId, input);
		expect(applied.status).toBe("applied");
		expect(applied.appliedRevision).toBe(6);
		expect((await stored(frames[0].id)).htmlCode).toBe(applied.after);
		expect(
			(await readStudioFrameDocument(project.id, frames[0].id, userId)).html,
		).toBe(applied.after);
		expect((await stored(frames[1].id)).revision).toBe(5);
		expect(
			(await readStudioElementRevisions(project.id, userId))[0].status,
		).toBe("applied");
		await transitionStudioElementRevision(
			userId,
			project.id,
			applied.id,
			"undo",
		);
		expect(await stored(frames[0].id)).toMatchObject({
			revision: 7,
			htmlCode: html,
		});
		expect(
			(
				await db
					.select()
					.from(studioRevisions)
					.where(eq(studioRevisions.projectId, project.id))
			).map((row) => row.frameRevision),
		).toEqual([6, 7]);
		expect(
			(await readStudioElementRevisions(project.id, userId))[0].status,
		).toBe("undone");
	});
	it("rejects cross-project and cross-user targets including candidate actions", async () => {
		const a = await fixture();
		const b = await fixture();
		await expect(
			prepareStudioElementRevision(b.userId, a.input),
		).rejects.toMatchObject({ code: "STUDIO_NOT_FOUND" });
		await expect(
			prepareStudioElementRevision(a.userId, {
				...a.input,
				target: { ...a.input.target, frameId: b.frames[0].id },
			}),
		).rejects.toMatchObject({ code: "STUDIO_NOT_FOUND" });
		const preview = await prepareStudioElementRevision(a.userId, a.input);
		await expect(
			transitionStudioElementRevision(
				b.userId,
				b.project.id,
				preview.id,
				"apply",
			),
		).rejects.toMatchObject({ code: "STUDIO_NOT_FOUND" });
	});
	it("dedupes a retried request and rejects a stale base without charging credits", async () => {
		const { userId, frames, input } = await fixture();
		const request = { ...input, prompt: "Redesign this selected card only" };
		const first = await prepareStudioElementRevision(userId, request);
		const duplicate = await prepareStudioElementRevision(userId, request);
		expect(duplicate.id).toBe(first.id);
		expect(model.calls).toBe(1);
		expect((await stored(frames[0].id)).revision).toBe(6);
		await expect(
			prepareStudioElementRevision(userId, {
				...request,
				requestId: crypto.randomUUID(),
			}),
		).rejects.toMatchObject({ code: "STUDIO_STALE_REVISION" });
		expect(
			await db
				.select()
				.from(creditLedgerEntries)
				.where(eq(creditLedgerEntries.userId, userId)),
		).toEqual([]);
	});
	it("cannot publish two in-flight edits against the same base", async () => {
		const { userId, frames, input } = await fixture();
		const request = { ...input, prompt: "Redesign this selected card only" };
		let release = () => {};
		model.wait = new Promise<void>((resolve) => {
			release = resolve;
		});
		const first = prepareStudioElementRevision(userId, request);
		await vi.waitFor(() => expect(model.calls).toBe(1));
		const second = prepareStudioElementRevision(userId, {
			...request,
			requestId: crypto.randomUUID(),
		});
		await vi.waitFor(() => expect(model.calls).toBe(2));
		release();
		const attempts = await Promise.allSettled([first, second]);
		expect(
			attempts.filter((attempt) => attempt.status === "fulfilled"),
		).toHaveLength(1);
		expect(
			attempts.find((attempt) => attempt.status === "rejected"),
		).toMatchObject({ reason: { code: "STUDIO_STALE_REVISION" } });
		expect((await stored(frames[0].id)).revision).toBe(6);
		expect(
			await db
				.select()
				.from(creditLedgerEntries)
				.where(eq(creditLedgerEntries.userId, userId)),
		).toEqual([]);
	});
	it("rejects AI scope escape and leaves approved output unchanged during in-flight conflict", async () => {
		const { userId, project, frames, input } = await fixture();
		model.response =
			'{"kind":"replace","html":"<section><style>nav{display:none}</style></section>"}';
		await expect(
			prepareStudioElementRevision(userId, {
				...input,
				prompt: "Redesign this selected card only",
			}),
		).rejects.toMatchObject({ code: "STUDIO_INVALID_INPUT" });
		expect((await stored(frames[0].id)).htmlCode).toBe(html);
		model.response =
			'{"kind":"replace","html":"<section><h2>Updated card</h2></section>"}';
		let release = () => {};
		model.wait = new Promise<void>((resolve) => {
			release = resolve;
		});
		const pending = prepareStudioElementRevision(userId, {
			...input,
			requestId: crypto.randomUUID(),
			prompt: "Redesign this selected card only",
		});
		await vi.waitFor(() => expect(model.calls).toBe(2));
		await db
			.update(studioFrames)
			.set({ revision: 6, htmlCode: html.replace("Hero", "Approved Hero") })
			.where(
				and(
					eq(studioFrames.id, frames[0].id),
					eq(studioFrames.projectId, project.id),
				),
			);
		release();
		await expect(pending).rejects.toMatchObject({
			code: "STUDIO_STALE_REVISION",
		});
		expect((await stored(frames[0].id)).htmlCode).toContain("Approved Hero");
	});
	it("keeps selection instrumentation out of persisted HTML and the export document", async () => {
		const { userId, project, frames, input } = await fixture();
		const url = new URL("https://studio.test/api/studio/frame");
		url.search = new URLSearchParams({
			inspect: "1",
			projectId: project.id,
			frameId: frames[0].id,
			baseRevision: "5",
			channel: crypto.randomUUID(),
		}).toString();
		const inspection = await readStudioElementHttp(url, userId);
		expect(inspection?.headers.get("Cache-Control")).toBe("private, no-store");
		expect(await inspection?.json()).toMatchObject({
			html: expect.stringContaining("data-ev-inspect-id"),
		});
		expect((await stored(frames[0].id)).htmlCode).toBe(html);
		const applied = await prepareStudioElementRevision(userId, input);
		const exported = await readStudioFrameDocument(
			project.id,
			frames[0].id,
			userId,
		);
		expect(exported.html).toBe(applied.after);
		expect(exported.html).not.toMatch(
			/data-ev-inspect|data-ev-editor|studio:element:select/,
		);
		await expect(
			readStudioElementHttp(url, crypto.randomUUID()),
		).rejects.toMatchObject({ code: "STUDIO_NOT_FOUND" });
	});
	it("cancels an in-flight AI candidate once without publishing, billing, or losing its attachment snapshot", async () => {
		const { userId, project, frames, input } = await fixture();
		let release = () => {};
		model.wait = new Promise<void>((resolve) => {
			release = resolve;
		});
		const request = { ...input, prompt: "Redesign this selected card only" };
		const pending = prepareStudioElementRevision(userId, request);
		await vi.waitFor(() => expect(model.calls).toBe(1));
		const duplicate = await prepareStudioElementRevision(userId, request);
		expect(duplicate.status).toBe("generating");
		expect(model.calls).toBe(1);
		await transitionStudioElementRevision(
			userId,
			project.id,
			duplicate.id,
			"cancel",
		);
		const rejected = expect(pending).rejects.toMatchObject({
			code: "STUDIO_CANCELLED",
		});
		release();
		await rejected;
		expect((await stored(frames[0].id)).htmlCode).toBe(html);
		expect(await readStudioElementRevisions(project.id, userId)).toMatchObject([
			{ status: "cancelled" },
		]);
		const messages = await db
			.select()
			.from(studioMessages)
			.where(
				and(
					eq(studioMessages.projectId, project.id),
					eq(studioMessages.userId, userId),
				),
			);
		expect(
			messages.find((row) => row.role === "user")?.attachments[0]?.target,
		).toEqual(input.target);
		expect(messages.find((row) => row.role === "assistant")?.status).toBe(
			"completed",
		);
		expect(
			await db
				.select()
				.from(creditLedgerEntries)
				.where(eq(creditLedgerEntries.userId, userId)),
		).toEqual([]);
	});
	it("rejects Undo after a newer approval rather than overwriting it", async () => {
		const { userId, project, frames, input } = await fixture();
		const applied = await prepareStudioElementRevision(userId, input);
		await db
			.update(studioFrames)
			.set({ revision: 7, htmlCode: html.replace("Hero", "Latest approval") })
			.where(eq(studioFrames.id, frames[0].id));
		await expect(
			transitionStudioElementRevision(userId, project.id, applied.id, "undo"),
		).rejects.toMatchObject({ code: "STUDIO_STALE_REVISION" });
		expect((await stored(frames[0].id)).htmlCode).toContain("Latest approval");
	});
	it("applies a direct text edit deterministically and restores it through Undo", async () => {
		const { userId, project, frames, input } = await fixture();
		const hero = indexStudioElements(html, {
			projectId: project.id,
			frameId: frames[0].id,
			baseRevision: 5,
		}).elements.find((item) => item.selector === "#hero");
		if (!hero) throw new Error("Missing hero target");
		const text = '<script>alert(1)</script> "Promo"';
		const applied = await prepareStudioElementRevision(userId, {
			...input,
			target: { ...hero, bounds: input.target.bounds },
			edit: { kind: "text", text },
		});
		expect(applied.status).toBe("applied");
		const [savedRevision] = await db
			.select()
			.from(studioElementRevisions)
			.where(eq(studioElementRevisions.id, applied.id));
		expect(savedRevision.edit).toEqual({ kind: "text", text });
		expect(model.calls).toBe(0);
		const saved = (await stored(frames[0].id)).htmlCode;
		expect(saved).toContain("&lt;script&gt;");
		expect(saved).not.toContain("<script>");
		expect((await stored(frames[1].id)).htmlCode).toBe(html);
		expect(
			await db
				.select()
				.from(studioJobs)
				.where(eq(studioJobs.projectId, project.id)),
		).toEqual([]);
		expect(
			await db
				.select()
				.from(creditLedgerEntries)
				.where(eq(creditLedgerEntries.userId, userId)),
		).toEqual([]);
		await transitionStudioElementRevision(
			userId,
			project.id,
			applied.id,
			"undo",
		);
		expect((await stored(frames[0].id)).htmlCode).toBe(html);
	});
	it("deletes only the selected element without a model, job or credit charge", async () => {
		const { userId, project, frames, input } = await fixture();
		const applied = await prepareStudioElementRevision(userId, {
			...input,
			edit: { kind: "remove" },
		});
		expect(applied.status).toBe("applied");
		const [savedRevision] = await db
			.select()
			.from(studioElementRevisions)
			.where(eq(studioElementRevisions.id, applied.id));
		expect(savedRevision.edit).toEqual({ kind: "remove" });
		expect(model.calls).toBe(0);
		const saved = (await stored(frames[0].id)).htmlCode;
		expect(saved).not.toContain('<section id="stats">');
		expect(saved).toContain('<section id="hero">Hero</section>');
		expect(saved).toContain('<section id="projects">Projects</section>');
		expect((await stored(frames[1].id)).htmlCode).toBe(html);
		expect(
			await db
				.select()
				.from(studioJobs)
				.where(eq(studioJobs.projectId, project.id)),
		).toEqual([]);
		expect(
			await db
				.select()
				.from(creditLedgerEntries)
				.where(eq(creditLedgerEntries.userId, userId)),
		).toEqual([]);
		await transitionStudioElementRevision(
			userId,
			project.id,
			applied.id,
			"undo",
		);
		expect((await stored(frames[0].id)).htmlCode).toBe(html);
	});
});
