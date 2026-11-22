import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { studioFrames, users } from "@/db/schema";
import {
	buildEvvibeDesignContext,
	EVVIBE_DESIGN_STAGE_BUDGET_CHARS,
	EVVIBE_DESIGN_STAGE_REFERENCES,
	type EvvibeDesignReference,
	planEvvibeDesignContext,
} from "../design-intelligence/evvibe-design";
import { EVVIBE_DESIGN_EXAMPLES } from "../design-intelligence/evvibe-design/examples";
import { EVVIBE_DESIGN_REFERENCES } from "../design-intelligence/evvibe-design/references";
import { buildStudioElementEditSystemPrompt } from "../services/studio-element-generation";
import { buildStudioFrameCorrection } from "../services/studio-frame-correction";
import { validateGeneratedHtml } from "../services/studio-generated-html-validation";
import {
	inspectStudioHtml,
	studioIssueCode,
} from "../services/studio-html-diagnostics";
import { runStudioJobPipeline } from "../services/studio-job-pipeline";
import { buildStudioPlanningPrompt } from "../services/studio-planning-prompt";
import { createStudioProjectWithJob } from "../services/studio-project-enqueue";
import {
	STUDIO_FRAME_SYSTEM_PROMPT,
	STUDIO_PLANNING_SYSTEM_PROMPT,
} from "../services/studio-prompt-contracts";
import { STUDIO_BASE_QUALITY_PROMPT } from "../services/studio-quality-rules";
import {
	buildStudioFramePrompt,
	buildStudioUserPrompt,
} from "../services/studio-screen-prompts";
import { STUDIO_CORRECTION_PROMPT_MAX_CHARS } from "../types/studio-constants";
import { portfolioBlueprint } from "./fixtures/studio-evaluation-fixtures";
import {
	aiCalls,
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

const REFERENCES: readonly EvvibeDesignReference[] = [
	...EVVIBE_DESIGN_REFERENCES,
	...EVVIBE_DESIGN_EXAMPLES,
];

function referenceBody(id: string): string {
	const reference = REFERENCES.find((candidate) => candidate.id === id);
	if (!reference) throw new Error(`missing fixture reference ${id}`);
	return reference.body;
}

const page = (body: string) =>
	`<!doctype html><html><head></head><body><main data-studio-content>${body}</main></body></html>`;

const publicWebsite = {
	...portfolioBlueprint,
	productIdentity: {
		...portfolioBlueprint.productIdentity,
		layoutIntent: "public-website" as const,
	},
};

const application = {
	...portfolioBlueprint,
	productIdentity: {
		...portfolioBlueprint.productIdentity,
		layoutIntent: "web-application" as const,
	},
};

describe("the planning request carries the platform it is planning for", () => {
	it("sends website guidance to a web plan and mobile guidance to a mobile plan", () => {
		const web = buildStudioPlanningPrompt(
			"Portfolio fotografer",
			"web",
			null,
			3,
		);
		const mobile = buildStudioPlanningPrompt(
			"Aplikasi travel",
			"mobile",
			null,
			3,
		);

		expect(web).toContain('stage="planning-platform"');
		expect(web).toContain("Website and web application families");
		expect(web).not.toContain("Mobile screen classes and app bar content");

		expect(mobile).toContain('stage="planning-platform"');
		expect(mobile).toContain("Mobile screen classes and app bar content");
		expect(mobile).not.toContain("Website and web application families");
	});

	it("keeps the cacheable planning prefix platform-neutral", () => {
		expect(STUDIO_PLANNING_SYSTEM_PROMPT).not.toContain(
			"Website and web application families",
		);
		expect(STUDIO_PLANNING_SYSTEM_PROMPT).not.toContain(
			"Mobile screen classes and app bar content",
		);
		expect(STUDIO_PLANNING_SYSTEM_PROMPT).toContain('stage="planning"');
	});
});

describe("stages deliver only what they add", () => {
	it("keeps generation free of the platform families and revision free of the generation standard", () => {
		const generation = planEvvibeDesignContext("generation");
		expect(generation.includedIds).toEqual([
			"typography-and-layout",
			"component-library",
			"media-and-imagery",
			"anti-slop",
		]);
		expect(generation.text).not.toContain(
			"purposeful subset of the real pages",
		);
		expect(generation.text).not.toContain("Back navigation is justified");

		const revision = planEvvibeDesignContext("revision", { viewport: "web" });
		expect(revision.text).not.toContain(
			"min-width: 0 on flex and grid children",
		);
		expect(revision.text).toContain("Change what the request asks for");
	});

	it("sends no design guidance at all into a bounded repair", () => {
		const plan = planEvvibeDesignContext("correction", { viewport: "web" });
		expect(plan.text).toBe("");
		expect(plan.includedIds).toEqual([]);
		expect(buildEvvibeDesignContext("correction")).toBe("");
	});

	it("bounds every stage and never cuts a section mid-rule", () => {
		for (const stage of Object.keys(
			EVVIBE_DESIGN_STAGE_REFERENCES,
		) as (keyof typeof EVVIBE_DESIGN_STAGE_REFERENCES)[]) {
			for (const viewport of ["web", "mobile"] as const) {
				for (const layoutIntent of [
					"public-website",
					"web-application",
					"mobile-application",
				] as const) {
					const plan = planEvvibeDesignContext(stage, {
						viewport,
						layoutIntent,
					});
					expect(plan.chars).toBeLessThanOrEqual(
						EVVIBE_DESIGN_STAGE_BUDGET_CHARS[stage],
					);
					expect(plan.text.length).toBe(plan.chars);
					for (const id of plan.includedIds)
						expect(plan.text).toContain(referenceBody(id));
				}
			}
		}
	});

	it("declares only references the package defines", () => {
		const known = new Set(REFERENCES.map((reference) => reference.id));
		for (const ids of Object.values(EVVIBE_DESIGN_STAGE_REFERENCES))
			for (const id of ids) expect(known.has(id)).toBe(true);
	});

	it("keeps the whole request inside the P1.1 size guards", () => {
		const frame = {
			screenName: "Beranda",
			projectPrompt: "Portfolio fotografer lepas",
			blueprint: null,
		};
		const measure = {
			planningSystem: STUDIO_PLANNING_SYSTEM_PROMPT.length,
			frameSystem: STUDIO_FRAME_SYSTEM_PROMPT.length,
			planningUser: buildStudioPlanningPrompt(
				"Portfolio fotografer lepas",
				"web",
				null,
				3,
			).length,
			frameUser: buildStudioFramePrompt({
				...frame,
				designMode: "web",
			}).length,
			frameUserRevision: buildStudioFramePrompt({
				...frame,
				designMode: "web",
				previousHtml: "<html><body><main>Lama</main></body></html>",
			}).length,
		};
		expect(measure.planningSystem).toBeLessThanOrEqual(19_500);
		expect(measure.frameSystem).toBeLessThanOrEqual(14_500);
		expect(measure.planningUser).toBeLessThanOrEqual(7_500);
		expect(measure.frameUser).toBeLessThanOrEqual(15_500);
		expect(measure.frameUserRevision).toBeLessThanOrEqual(14_500);
		// The frame request is the one paid once per screen; it must stay smaller
		// than the P1 shape that measured 19 484 + 18 519 characters.
		expect(measure.frameSystem + measure.frameUser).toBeLessThan(30_000);
	});
});

describe("guidance adapts to the screen without a fixed template", () => {
	it("uses the same candidate list and filters by platform and page family", () => {
		const marketing = planEvvibeDesignContext("initial", {
			viewport: "web",
			layoutIntent: "public-website",
		});
		const workspace = planEvvibeDesignContext("initial", {
			viewport: "web",
			layoutIntent: "web-application",
		});
		const mobile = planEvvibeDesignContext("initial", {
			viewport: "mobile",
			layoutIntent: "mobile-application",
		});

		expect(marketing.includedIds).toContain("website-patterns");
		expect(marketing.includedIds).not.toContain("good-vs-bad");
		expect(workspace.includedIds).not.toContain("website-patterns");
		expect(workspace.includedIds).toContain("good-vs-bad");
		expect(mobile.includedIds).toContain("mobile-patterns");
		expect(mobile.includedIds).not.toContain("web-design");

		// One candidate list, three different deliveries: the variation comes
		// from filtering, never from an intent-to-layout mapping table.
		expect(EVVIBE_DESIGN_STAGE_REFERENCES.initial).toEqual([
			"web-design",
			"mobile-design",
			"website-patterns",
			"mobile-patterns",
			"good-vs-bad",
		]);
	});

	it("states priorities instead of prescribing sections", () => {
		const text = [
			buildEvvibeDesignContext("initial", {
				viewport: "web",
				layoutIntent: "public-website",
			}),
			buildEvvibeDesignContext("planning"),
		].join("\n");
		expect(text).not.toMatch(/always (?:add|use|include|show)/i);
		expect(text).not.toMatch(/exactly (?:three|four) (?:cards|sections)/i);
		// The alternative is offered, not mandated.
		expect(text).toContain(
			"Principle and alternative, not a portfolio template",
		);
	});
});

describe("the frame path uses the matching stage", () => {
	const base = {
		screenName: "Beranda",
		projectPrompt: "Portfolio fotografer lepas",
		designMode: "web" as const,
		blueprint: null,
	};

	it("separates a first screen from an added screen and a revision", () => {
		const initial = buildStudioFramePrompt({
			...base,
			screenOrigin: "initial",
		});
		const added = buildStudioFramePrompt({ ...base, screenOrigin: "add" });
		const revised = buildStudioFramePrompt({
			...base,
			previousHtml: "<html><body><main>Lama</main></body></html>",
		});
		expect(initial).toContain('stage="initial"');
		expect(added).toContain('stage="add-screen"');
		expect(revised).toContain('stage="revision"');
		expect(added).toContain("Navigation models");
		expect(initial).not.toContain("Navigation models");
	});

	it("never repeats the context in the single-shot user prompt", () => {
		const prompt = buildStudioUserPrompt("Buat halaman kontak", {
			designMode: "web",
		});
		expect(prompt.match(/<EVVIBE_DESIGN_INTELLIGENCE/g)).toHaveLength(1);
	});
});

describe("the repair request stays defect-specific and bounded", () => {
	const input = {
		framePrompt: "prompt",
		activeScreen: "Beranda",
		blueprint: null,
		viewport: "web" as const,
		expectTokens: false,
		dsTokens: null,
		logoUrl: null,
		preservation: "new-frame" as const,
	};
	const issue = "Essential control/option text has an ellipsis clipping rule.";

	it("carries the issues and no general design guidance", () => {
		const prompt = buildStudioFrameCorrection(
			input,
			[issue],
			page("<section>Isi</section>"),
		);
		expect(prompt).toContain(issue);
		expect(prompt).not.toContain("EVVIBE_DESIGN_INTELLIGENCE");
		expect(prompt).not.toContain("Responsive layout");
	});

	it("keeps a document near the limit and omits one that cannot fit", () => {
		const nearLimit = "x".repeat(50_000);
		const nearPrompt = buildStudioFrameCorrection(input, [issue], nearLimit);
		expect(nearPrompt).toContain(nearLimit);
		expect(nearPrompt.length).toBeLessThanOrEqual(
			STUDIO_CORRECTION_PROMPT_MAX_CHARS,
		);

		const oversized = "y".repeat(90_000);
		const omittedPrompt = buildStudioFrameCorrection(
			{ ...input, preservation: "new-frame" },
			[issue],
			oversized,
		);
		expect(omittedPrompt.length).toBeLessThanOrEqual(
			STUDIO_CORRECTION_PROMPT_MAX_CHARS,
		);
		expect(omittedPrompt).toContain(
			"exceeded the repair budget and was omitted",
		);
		// Omitted whole, never truncated into an invalid document.
		expect(omittedPrompt).not.toContain(oversized.slice(0, 200));
		expect(omittedPrompt).toContain(issue);
	});

	it("refuses the repair instead of redesigning a preserved frame", () => {
		const oversized = "y".repeat(90_000);
		expect(() =>
			buildStudioFrameCorrection(
				{ ...input, preservation: "preserve-existing" },
				[issue],
				oversized,
			),
		).toThrow(/terlalu besar untuk direvisi/);

		// A candidate that fits is still repaired in place, document included.
		const candidate = page("<section>Isi</section>");
		const prompt = buildStudioFrameCorrection(
			{ ...input, preservation: "preserve-existing" },
			[issue],
			candidate,
		);
		expect(prompt).toContain(candidate);
	});

	it("keeps the user's requested change inside the repair scope", () => {
		const prompt = buildStudioFrameCorrection(
			{ ...input, requestedChange: "Ubah warna tombol kontak jadi hijau tua" },
			[issue],
			page("<section>Isi</section>"),
		);
		expect(prompt).toContain(
			"Requested change (keep exactly this scope; do not restyle anything else): Ubah warna tombol kontak jadi hijau tua",
		);
	});
});

describe("the element edit boundary stays narrow", () => {
	it("adds compact element guidance instead of the page standard", () => {
		const system = buildStudioElementEditSystemPrompt();
		expect(system).toContain("<ELEMENT_REVISION_GUIDANCE>");
		expect(system).toContain("Edit only the selected element");
		expect(system).not.toContain("EVVIBE_DESIGN_INTELLIGENCE");
		expect(system).not.toContain("component anatomy");
		expect(system.length).toBeLessThan(2_400);
	});
});

describe("the standard reaches the engine without extra requests", () => {
	it("uses one planning request and one request per screen", async () => {
		const userId = await createStudioUser();
		try {
			const { project, job } = await createStudioProjectWithJob(userId, {
				prompt: "Build a compact inventory console",
				initialPageCount: 3,
			});
			await runStudioJobPipeline(job.id, project.id, userId);

			expect(aiCalls("planning")).toHaveLength(1);
			expect(aiCalls("frame")).toHaveLength(3);
			// 1 planning + 3 frames = the normal path; no browsing or selector call.
			expect(studioProvider.messages).toHaveLength(4);

			expect(aiCalls("planning")[0]?.[0]?.content).toBe(
				STUDIO_PLANNING_SYSTEM_PROMPT,
			);
			for (const messages of aiCalls("frame"))
				expect(messages[0]?.content).toBe(STUDIO_FRAME_SYSTEM_PROMPT);

			const frames = await db
				.select()
				.from(studioFrames)
				.where(eq(studioFrames.projectId, project.id));
			expect(frames.some((frame) => Boolean(frame.htmlCode))).toBe(true);
		} finally {
			await db.delete(users).where(eq(users.id, userId));
		}
	}, 60_000);

	it("exposes no component-browsing surface", async () => {
		const pkg = await import("../design-intelligence/evvibe-design");
		for (const name of Object.keys(pkg))
			expect(name).not.toMatch(/browse|catalog|fetch|search|tool/i);
		// Context selection is synchronous: no network stage, no hidden provider call.
		const plan = pkg.planEvvibeDesignContext("generation");
		expect(plan).not.toBeInstanceOf(Promise);
		expect(plan.includedIds.length).toBeGreaterThan(0);
	});

	it("keeps the universal quality contract and drops the retired wording", () => {
		for (const prompt of [
			STUDIO_PLANNING_SYSTEM_PROMPT,
			STUDIO_FRAME_SYSTEM_PROMPT,
		]) {
			expect(prompt).toContain(STUDIO_BASE_QUALITY_PROMPT);
			expect(prompt).toContain("No page-level horizontal overflow");
			expect(prompt).not.toMatch(/design skill/i);
		}
	});

	it("keeps DESIGN.md above the intelligence in the precedence chain", () => {
		const prompt = buildStudioFramePrompt({
			screenName: "Beranda",
			projectPrompt: "Portfolio",
			designMode: "web",
			blueprint: null,
			designMd: "# Tokens\nprimary: #123456",
		});
		expect(prompt).toContain("#123456");
		const precedence = prompt.slice(prompt.indexOf("Precedence:"));
		expect(precedence.indexOf("DESIGN.md")).toBeLessThan(
			precedence.indexOf("EvVibe design intelligence"),
		);
	});

	it("keeps the imagery contract and the hard rejection of unknown sources", () => {
		const body = referenceBody("media-and-imagery");
		expect(body).toContain("/api/studio/asset?");
		expect(body).toContain("Never invent a URL");
		expect(body).not.toMatch(/https?:\/\/\S+\.(?:jpe?g|png|webp|avif)\b/i);
		expect(
			inspectStudioHtml(page('<img alt="Pantai" src="destinasi.jpg">')).hard,
		).toContain("Unresolved component image asset.");
	});
});

describe("card-only public composition stays a bounded structural signal", () => {
	const cards = (tag: "section" | "div") =>
		page(
			[
				`<${tag} data-card><h2>Tentang</h2><p>Paragraf panjang.</p></${tag}>`,
				`<${tag} data-card><h2>Pengalaman</h2><p>Paragraf panjang.</p></${tag}>`,
				`<${tag} data-card><h2>Keahlian</h2><p>Paragraf panjang.</p></${tag}>`,
			].join(""),
		);
	const cardIssue =
		"Komposisi halaman publik hanya berupa kartu teks; gunakan hero, karya, editorial, atau galeri sesuai isi.";

	it("reports a boxed text wall built from sections or plain divs", () => {
		for (const tag of ["section", "div"] as const) {
			const issues = validateGeneratedHtml(cards(tag), {
				blueprint: publicWebsite,
				viewport: "web",
				expectTokens: false,
			});
			expect(issues).toContain(cardIssue);
		}
		expect(studioIssueCode(cardIssue)).toBe("CARD_ONLY_COMPOSITION");
	});

	it("reports a bordered text wall without any card marker", () => {
		const bordered = page(
			[
				'<div style="border:1px solid #ddd"><h2>Tentang</h2><p>Paragraf.</p></div>',
				'<div style="border:1px solid #ddd"><h2>Pengalaman</h2><p>Paragraf.</p></div>',
				'<div style="border:1px solid #ddd"><h2>Keahlian</h2><p>Paragraf.</p></div>',
			].join(""),
		);
		const issues = validateGeneratedHtml(bordered, {
			blueprint: publicWebsite,
			viewport: "web",
			expectTokens: false,
		});
		expect(issues).toContain(cardIssue);
	});

	it("does not report composed pages, applications or text without boxes", () => {
		const composed = validateGeneratedHtml(
			page(
				[
					'<section><h2>Tentang</h2><p>Paragraf.</p><a href="#karya">Karya</a></section>',
					"<section><h2>Pengalaman</h2><p>Paragraf.</p></section>",
					"<section><h2>Keahlian</h2><p>Paragraf.</p></section>",
				].join(""),
			),
			{ blueprint: publicWebsite, viewport: "web", expectTokens: false },
		);
		expect(composed.join(" ")).not.toContain("kartu teks");

		const app = validateGeneratedHtml(cards("section"), {
			blueprint: application,
			viewport: "web",
			expectTokens: false,
		});
		expect(app.join(" ")).not.toContain("kartu teks");
	});

	it("accepts editorial color-block sections and long-form text", () => {
		const colorBlocks = page(
			[
				'<section style="background:#101418;color:#fff"><h1>Studio kami</h1><p>Pembuka editorial yang panjang dan mengalir.</p></section>',
				'<section style="background:#f4f1ea"><h2>Cerita</h2><p>Narasi panjang tentang proses dan orang di baliknya.</p></section>',
				'<section style="background:#2f6f4f;color:#fff"><p>Penutup.</p></section>',
			].join(""),
		);
		const blocks = validateGeneratedHtml(colorBlocks, {
			blueprint: publicWebsite,
			viewport: "web",
			expectTokens: false,
		});
		expect(blocks.join(" ")).not.toContain("kartu teks");

		const narrative = page(
			[
				"<article><h1>Judul</h1><p>Satu paragraf panjang.</p><p>Paragraf kedua.</p></article>",
				"<article><h2>Bagian</h2><p>Paragraf lain.</p></article>",
				"<article><h2>Bagian</h2><p>Paragraf lain.</p></article>",
			].join(""),
		);
		const prose = validateGeneratedHtml(narrative, {
			blueprint: publicWebsite,
			viewport: "web",
			expectTokens: false,
		});
		expect(prose.join(" ")).not.toContain("kartu teks");
	});

	it("does not report a small number of ordinary cards", () => {
		const twoCards = page(
			[
				"<section data-card><h2>Satu</h2><p>Paragraf.</p></section>",
				"<section data-card><h2>Dua</h2><p>Paragraf.</p></section>",
			].join(""),
		);
		const issues = validateGeneratedHtml(twoCards, {
			blueprint: publicWebsite,
			viewport: "web",
			expectTokens: false,
		});
		expect(issues.join(" ")).not.toContain("kartu teks");
	});

	it("leaves subjective aesthetic concerns advisory", () => {
		const { hard, repairable, warnings } = inspectStudioHtml(
			page(
				'<section class="card"><span class="badge">Premium</span><p>—</p></section>',
			),
		);
		expect(hard).toEqual([]);
		expect(repairable).toEqual([]);
		expect(warnings.length).toBeGreaterThan(0);
	});
});
