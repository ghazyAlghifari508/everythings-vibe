import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { studioProjects, studioRevisions, users } from "@/db/schema";
import { studioFramePreservation } from "../services/studio-frame-operation";
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

/** A trailing-marker document padded with removable comments and whitespace. */
function realisticDocument(padChars: number, marker = "x"): string {
	const head = `<html><head><style>body{margin:0}</style></head><body><main data-studio-content><header><h1>Studio</h1></header><p>Awal halaman.</p>`;
	const padding = `<!--${marker.repeat(Math.max(0, padChars))}-->`;
	return `${head}\n${padding}\n${TAIL}</main></body></html>`;
}

/** A document that has nothing safe to remove, used for the refusal path. */
function denseDocument(chars: number): string {
	const head = `<html><body><main data-studio-content><p>`;
	const body = "a".repeat(Math.max(0, chars));
	return `${head}${body}</p>${TAIL}</main></body></html>`;
}

describe("existing documents are prepared, never truncated", () => {
	it("sends a document that fits unchanged", () => {
		const html = realisticDocument(200);
		expect(prepareStudioExistingDocument(html)).toBe(html.trim());
	});

	it("accepts a document exactly at the boundary without compacting it", () => {
		const base = realisticDocument(0);
		const html = base.padEnd(STUDIO_PREVIOUS_HTML_MAX_CHARS, " ");
		expect(html.length).toBe(STUDIO_PREVIOUS_HTML_MAX_CHARS);
		expect(prepareStudioExistingDocument(html)).toBe(html.trim());
	});

	it("compacts only removable markup and keeps every structural element", () => {
		const html = realisticDocument(70_000);
		expect(html.length).toBeGreaterThan(STUDIO_PREVIOUS_HTML_MAX_CHARS);
		const prepared = prepareStudioExistingDocument(html);
		expect(prepared.length).toBeLessThanOrEqual(STUDIO_PREVIOUS_HTML_MAX_CHARS);
		expect(prepared).toContain('id="preserve-this-section"');
		expect(prepared).toContain('id="original-footer"');
		expect(prepared).not.toContain("xx");
	});

	it("refuses a document it cannot reduce safely instead of cutting it", () => {
		const html = denseDocument(80_000);
		expect(() => prepareStudioExistingDocument(html)).toThrow(
			/terlalu besar untuk direvisi/,
		);
	});

	it("keeps the tail of a large document in both revision prompt builders", () => {
		const html = realisticDocument(70_000);
		const framePrompt = buildStudioFramePrompt({
			screenName: "Karya",
			projectPrompt: "Portfolio fotografer",
			designMode: "web",
			blueprint: null,
			previousHtml: html,
		});
		const userPrompt = buildStudioUserPrompt("Ubah warna tombol kontak", {
			designMode: "web",
			previousHtml: html,
		});
		for (const prompt of [framePrompt, userPrompt]) {
			expect(prompt).toContain('id="preserve-this-section"');
			expect(prompt).toContain('id="original-footer"');
		}
	});

	it("rejects an irreducible revision prompt", () => {
		const html = denseDocument(80_000);
		expect(() =>
			buildStudioFramePrompt({
				screenName: "Karya",
				projectPrompt: "Portfolio fotografer",
				designMode: "web",
				blueprint: null,
				previousHtml: html,
			}),
		).toThrow(/terlalu besar untuk direvisi/);
		expect(() =>
			buildStudioUserPrompt("Ubah warna tombol kontak", {
				designMode: "web",
				previousHtml: html,
			}),
		).toThrow(/terlalu besar untuk direvisi/);
	});
});

describe("preservation policy follows committed HTML, not frame status", () => {
	it("treats an added screen or a never-successful frame as new", () => {
		for (const jobType of ["add", "initial", "retry"])
			expect(studioFramePreservation({ htmlCode: null }, jobType)).toBe(
				"new-frame",
			);
	});

	it("preserves any frame that already owns HTML", () => {
		// The decision reads only the committed document, so a row whose status is
		// failed or generating is still preserved. A complete redesign is a user
		// instruction, never an inference from a failed candidate.
		for (const jobType of ["revision", "revise", "retry"])
			expect(
				studioFramePreservation({ htmlCode: "<html></html>" }, jobType),
			).toBe("preserve-existing");
		// A frame row that also carries status: "failed" still preserves its HTML.
		const failedFrame: { htmlCode: string | null } = {
			htmlCode: "<html></html>",
		};
		expect(studioFramePreservation(failedFrame, "retry")).toBe(
			"preserve-existing",
		);
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
