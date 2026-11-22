import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { studioProjects, studioRevisions, users } from "@/db/schema";
import { studioPreservationPolicy } from "../services/studio-frame-correction";
import { studioFrameOperationContext } from "../services/studio-frame-operation";
import { prepareStudioExistingDocument } from "../services/studio-html-preservation";
import { reviseStudioProject } from "../services/studio-revision-service";
import {
	buildStudioFramePrompt,
	buildStudioUserPrompt,
} from "../services/studio-screen-prompts";
import { STUDIO_PREVIOUS_HTML_MAX_CHARS } from "../types/studio-constants";
import {
	createStudioUser,
	resetStudioProvider,
	studioProvider,
} from "./studio-reference-harness";

vi.mock("@/lib/services/ai-orchestrator", async () => {
	// vi.mock factories are hoisted above imports, so the provider stub can only
	// be reached through a dynamic import here.
	const { studioProviderMock: mock } = await import(
		"./studio-reference-harness"
	);
	return mock;
});

beforeEach(() => {
	resetStudioProvider();
});

const TAIL = `<section id="preserve-this-section"><h2>Karya terpilih</h2><p>Konten pengguna yang harus dipertahankan.</p></section><footer id="original-footer"><p>Original footer</p></footer>`;

/**
 * Mixed inline content where the inter-tag space is a rendered space, plus
 * whitespace-sensitive, SVG, CSS and template content. Compacted away, these
 * all change what the user sees.
 */
const WHITESPACE_HTML = `<html><head><style>.label::after{content:" "}</style></head><body><main data-studio-content>
<span>Total</span> <span>Rp150.000</span>
<p>Hello <strong>world</strong> again.</p>
<p>Read <a href="#details">more</a> here.</p>
<div style="white-space: pre-wrap">
    Preserve this spacing
</div>
<svg viewBox="0 0 10 10"><text x="1" y="5">A B</text></svg>
<template><p>Template  text</p></template>
${TAIL}
</main></body></html>`;

/** The same document pushed past the budget with a large removable comment. */
function oversizedWhitespaceDocument(): string {
	return WHITESPACE_HTML.replace(
		"<main data-studio-content>",
		`<main data-studio-content><!--${"x".repeat(70_000)}-->`,
	);
}

/** A document with nothing safe to remove, used for the refusal path. */
function denseDocument(chars: number): string {
	const head = `<html><body><main data-studio-content><p>`;
	const body = "a".repeat(Math.max(0, chars));
	return `${head}${body}</p>${TAIL}</main></body></html>`;
}

describe("existing documents are preserved exactly, never rewritten", () => {
	it("keeps every meaningful text node when the document fits", () => {
		const prepared = prepareStudioExistingDocument(WHITESPACE_HTML);
		expect(prepared).toBe(WHITESPACE_HTML.trim());
		expect(prepared).toContain("</span> <span>");
		expect(prepared).toContain("<p>Hello <strong>world</strong> again.</p>");
		expect(prepared).toContain('Read <a href="#details">more</a> here.');
		expect(prepared).toContain("\n    Preserve this spacing\n");
		expect(prepared).toContain('content:" "');
		expect(prepared).toContain("Template  text");
		expect(prepared).toContain('<text x="1" y="5">A B</text>');
		expect(prepared).toContain('id="preserve-this-section"');
		expect(prepared).toContain('id="original-footer"');
	});

	it("accepts a document exactly at the boundary", () => {
		const html = WHITESPACE_HTML.padEnd(STUDIO_PREVIOUS_HTML_MAX_CHARS, " ");
		expect(html.length).toBe(STUDIO_PREVIOUS_HTML_MAX_CHARS);
		expect(prepareStudioExistingDocument(html)).toBe(html.trim());
	});

	it("refuses an oversized document instead of compacting or truncating it", () => {
		const oversized = oversizedWhitespaceDocument();
		expect(oversized.length).toBeGreaterThan(STUDIO_PREVIOUS_HTML_MAX_CHARS);
		let message = "";
		try {
			prepareStudioExistingDocument(oversized);
		} catch (error) {
			message = error instanceof Error ? error.message : "";
		}
		// No compaction: even a removable comment does not buy context here.
		expect(message).toContain("terlalu besar untuk direvisi");
		expect(message).not.toContain("<span>");
	});

	it("refuses a dense document it cannot reduce safely", () => {
		expect(() => prepareStudioExistingDocument(denseDocument(80_000))).toThrow(
			/terlalu besar untuk direvisi/,
		);
	});

	it("carries the exact markup into both revision prompt builders", () => {
		const framePrompt = buildStudioFramePrompt({
			screenName: "Karya",
			projectPrompt: "Portfolio fotografer",
			designMode: "web",
			blueprint: null,
			previousHtml: WHITESPACE_HTML,
		});
		const userPrompt = buildStudioUserPrompt("Ubah warna tombol kontak", {
			designMode: "web",
			previousHtml: WHITESPACE_HTML,
		});
		for (const prompt of [framePrompt, userPrompt]) {
			expect(prompt).toContain("</span> <span>Rp150.000</span>");
			expect(prompt).toContain("\n    Preserve this spacing\n");
			expect(prompt).toContain('id="preserve-this-section"');
			expect(prompt).toContain('id="original-footer"');
		}
	});

	it("rejects an oversized document in both revision prompt builders", () => {
		const oversized = oversizedWhitespaceDocument();
		expect(() =>
			buildStudioFramePrompt({
				screenName: "Karya",
				projectPrompt: "Portfolio fotografer",
				designMode: "web",
				blueprint: null,
				previousHtml: oversized,
			}),
		).toThrow(/terlalu besar untuk direvisi/);
		expect(() =>
			buildStudioUserPrompt("Ubah warna tombol kontak", {
				designMode: "web",
				previousHtml: oversized,
			}),
		).toThrow(/terlalu besar untuk direvisi/);
	});
});

describe("preservation follows committed HTML, not job type or status", () => {
	it("treats any frame without committed HTML as new", () => {
		expect(studioFrameOperationContext({ htmlCode: null })).toEqual({
			preservation: "new-frame",
			previousHtml: undefined,
		});
	});

	it("preserves committed HTML for every job type, including add", () => {
		const html = "<html><body><main>Committed</main></body></html>";
		expect(studioFrameOperationContext({ htmlCode: html })).toEqual({
			preservation: "preserve-existing",
			previousHtml: html,
		});
		// The decision never reads job type or status: a recovered, resumed or
		// legacy add that already owns a design must still preserve it.
		const failedFrame: { htmlCode: string | null } = { htmlCode: html };
		expect(studioFrameOperationContext(failedFrame).preservation).toBe(
			"preserve-existing",
		);
	});
});

describe("the preservation policy is explicit and fails closed", () => {
	it("only an explicit new-frame unlocks document-free regeneration", () => {
		expect(studioPreservationPolicy("new-frame")).toBe("new-frame");
		for (const value of [undefined, null, "", "preserve-existing", "legacy"])
			expect(studioPreservationPolicy(value)).toBe("preserve-existing");
	});
});

describe("a refused revision keeps the committed design", () => {
	it("does not add a revision row or change stored HTML when the prompt cannot fit", async () => {
		const userId = await createStudioUser();
		try {
			const [project] = await db
				.insert(studioProjects)
				.values({ userId, title: "Portfolio", designMode: "web" })
				.returning();
			if (!project) throw new Error("project not created");
			const committed = denseDocument(80_000);
			await db.insert(studioRevisions).values({
				projectId: project.id,
				prompt: "Build the portfolio",
				htmlCode: committed,
				version: 1,
			});
			const before = await db
				.select()
				.from(studioRevisions)
				.where(eq(studioRevisions.projectId, project.id));

			await expect(
				reviseStudioProject(project.id, userId, "Ubah warna tombol kontak"),
			).rejects.toMatchObject({ code: "STUDIO_REVISION_TOO_LARGE" });

			const after = await db
				.select()
				.from(studioRevisions)
				.where(eq(studioRevisions.projectId, project.id));
			expect(after).toHaveLength(before.length);
			expect(after.map((row) => row.version)).toEqual(
				before.map((row) => row.version),
			);
			expect(after[0]?.htmlCode).toBe(committed);
			// The refusal is deterministic: no provider request was spent.
			expect(studioProvider.messages).toHaveLength(0);
		} finally {
			await db.delete(users).where(eq(users.id, userId));
		}
	}, 30_000);
});
