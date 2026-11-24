import { eq } from "drizzle-orm";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import {
	creditLedgerEntries,
	studioElementRevisions,
	studioJobs,
	studioMessages,
	studioRevisions,
} from "@/db/schema";
import { indexStudioElements } from "../services/studio-element-document";
import {
	mutateStudioElementHttp,
	readStudioElementHttp,
} from "../services/studio-element-http";
import {
	readStudioElementRevisions,
	transitionStudioElementRevision,
} from "../services/studio-element-revision";
import { buildStudioPrototypeDocument } from "../services/studio-prototype-document";
import {
	fixture,
	html,
	prepareWithRevision,
	stored,
} from "./studio-element-revision-fixture";

const model = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@/lib/services/ai-orchestrator", () => ({
	selectModels: () => ["test"],
	tryStreamWithFallback: model.generate,
}));

describe("direct persisted element revisions", () => {
	it("applies a direct text edit deterministically and restores it through Undo", async () => {
		const { userId, project, frames, input } = await fixture();
		const hero = indexStudioElements(html, {
			projectId: project.id,
			frameId: frames[0].id,
			baseRevision: 5,
		}).elements.find((item) => item.selector === "#hero");
		if (!hero) throw new Error("Missing hero target");
		const text = '<script>alert(1)</script> "Promo"';
		const applied = await prepareWithRevision(userId, {
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
		expect(model.generate).not.toHaveBeenCalled();
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
		const applied = await prepareWithRevision(userId, {
			...input,
			edit: { kind: "remove" },
		});
		expect(applied.status).toBe("applied");
		const [savedRevision] = await db
			.select()
			.from(studioElementRevisions)
			.where(eq(studioElementRevisions.id, applied.id));
		expect(savedRevision.edit).toEqual({ kind: "remove" });
		expect(model.generate).not.toHaveBeenCalled();
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
	it("requires an explicit committed revision for inspection even at revision zero", async () => {
		const { userId, project, frames } = await fixture(html, 0);
		const url = new URL("https://studio.test/api/studio/frame");
		url.search = new URLSearchParams({
			inspect: "1",
			projectId: project.id,
			frameId: frames[0].id,
			channel: crypto.randomUUID(),
		}).toString();
		await expect(readStudioElementHttp(url, userId)).rejects.toMatchObject({
			code: "STUDIO_INVALID_INPUT",
		});
		url.searchParams.set("baseRevision", "0");
		expect((await readStudioElementHttp(url, userId))?.status).toBe(200);
	});
	it("does not create rows or messages for an unchanged text revision", async () => {
		const source = html.replace("Hero", "H&#101;ro");
		const { userId, project, frames, input } = await fixture(source);
		const hero = indexStudioElements(source, input.target).elements.find(
			(item) => item.selector === "#hero",
		);
		if (!hero) throw new Error("Missing hero target");
		const response = await mutateStudioElementHttp(
			{
				action: "element-prepare",
				request: {
					...input,
					target: { ...hero, bounds: input.target.bounds },
					edit: { kind: "text", text: "Hero" },
				},
			},
			userId,
			new AbortController().signal,
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ revision: null });
		expect(await stored(frames[0].id)).toMatchObject({
			revision: 5,
			htmlCode: source,
		});
		expect(await readStudioElementRevisions(project.id, userId)).toEqual([]);
		expect(
			await db
				.select()
				.from(studioRevisions)
				.where(eq(studioRevisions.projectId, project.id)),
		).toEqual([]);
		expect(
			await db
				.select()
				.from(studioMessages)
				.where(eq(studioMessages.userId, userId)),
		).toEqual([]);
		expect(model.generate).not.toHaveBeenCalled();
	});

	it("rebuilds the prototype manifest after deleting a tab panel and restores it on Undo", async () => {
		const source = html
			.replace(
				'<section id="stats">',
				'<section id="stats" data-proto-tab-group="views" data-proto-tab-panel="stats">',
			)
			.replace(
				'<section id="projects">',
				'<section id="projects" data-proto-tab-group="views" data-proto-tab-panel="projects" hidden>',
			)
			.replace(
				"<nav>Navbar</nav>",
				`<nav><button id="stats-tab" role="tab" aria-selected="true" data-proto-action="select_tab" data-proto-tab-group="views" data-proto-tab="stats">Stats</button>
				<button id="projects-tab" role="tab" data-proto-action="select_tab" data-proto-tab-group="views" data-proto-tab="projects">Projects</button></nav>`,
			);
		const { userId, project, frames, input } = await fixture(source);
		const readPrototype = () =>
			buildStudioPrototypeDocument(
				{
					projectId: project.id,
					frameId: frames[0].id,
					channel: crypto.randomUUID(),
				},
				userId,
				"https://studio.test",
			);
		expect(await readPrototype()).toMatchObject({
			interactionCount: 2,
			issues: [],
		});
		const applied = await prepareWithRevision(userId, {
			...input,
			edit: { kind: "remove" },
		});
		const prototype = await readPrototype();
		expect(prototype).toMatchObject({
			interactionCount: 1,
			issues: [expect.objectContaining({ code: "MISSING_TARGET_ELEMENT" })],
		});
		const dom = new JSDOM(prototype.html);
		try {
			const triggers = dom.window.document.querySelectorAll(
				'[data-proto-tab-group="views"][data-proto-tab]',
			);
			expect([...triggers].map((node) => node.id)).toEqual(["projects-tab"]);
		} finally {
			dom.window.close();
		}
		expect((await stored(frames[0].id)).htmlCode).toContain(
			'data-proto-tab="stats"',
		);
		await transitionStudioElementRevision(
			userId,
			project.id,
			applied.id,
			"undo",
		);
		expect(await readPrototype()).toMatchObject({
			interactionCount: 2,
			issues: [],
		});
	});
});
