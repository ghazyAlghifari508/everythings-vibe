import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { studioFrames, users } from "@/db/schema";
import type { EvvibeDesignReference } from "../design-intelligence/evvibe-design";
import {
	buildEvvibeDesignContext,
	EVVIBE_DESIGN_STAGE_BUDGET_CHARS,
	EVVIBE_DESIGN_STAGE_REFERENCES,
	planEvvibeDesignContext,
} from "../design-intelligence/evvibe-design";
import { EVVIBE_DESIGN_EXAMPLES } from "../design-intelligence/evvibe-design/examples";
import { EVVIBE_DESIGN_REFERENCES } from "../design-intelligence/evvibe-design/references";
import { buildStudioFrameCorrection } from "../services/studio-frame-correction";
import { validateGeneratedHtml } from "../services/studio-generated-html-validation";
import {
	inspectStudioHtml,
	studioIssueCode,
} from "../services/studio-html-diagnostics";
import { runStudioJobPipeline } from "../services/studio-job-pipeline";
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
import { portfolioBlueprint } from "./fixtures/studio-evaluation-fixtures";
import {
	aiCalls,
	createStudioUser,
	resetStudioProvider,
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

describe("the internal standard reaches the real Studio engine", () => {
	it("sends the planning and frame system prompts unchanged through the job pipeline", async () => {
		const userId = await createStudioUser();
		try {
			const { project, job } = await createStudioProjectWithJob(userId, {
				prompt: "Build a compact inventory console",
				initialPageCount: 1,
			});
			await runStudioJobPipeline(job.id, project.id, userId);

			const planning = aiCalls("planning");
			const frames = aiCalls("frame");
			expect(planning).toHaveLength(1);
			expect(frames.length).toBeGreaterThan(0);
			expect(planning[0]?.[0]?.content).toBe(STUDIO_PLANNING_SYSTEM_PROMPT);
			for (const messages of frames)
				expect(messages[0]?.content).toBe(STUDIO_FRAME_SYSTEM_PROMPT);
			for (const messages of [...planning, ...frames])
				expect(messages[0]?.content).toContain(
					'<EVVIBE_DESIGN_INTELLIGENCE id="evvibe-design"',
				);

			// The prompt contract changes; the generated document is stored untouched.
			const framesInDb = await db
				.select()
				.from(studioFrames)
				.where(eq(studioFrames.projectId, project.id));
			expect(framesInDb.some((frame) => Boolean(frame.htmlCode))).toBe(true);
		} finally {
			await db.delete(users).where(eq(users.id, userId));
		}
	}, 60_000);

	it("keeps the universal quality contract first in both system prompts", () => {
		for (const prompt of [
			STUDIO_PLANNING_SYSTEM_PROMPT,
			STUDIO_FRAME_SYSTEM_PROMPT,
		]) {
			expect(prompt).toContain(STUDIO_BASE_QUALITY_PROMPT);
			expect(prompt).toContain("No page-level horizontal overflow");
			expect(prompt).toMatch(/stage="(planning|generation)"/);
			// The retired user-facing design-skill language must not return.
			expect(prompt).not.toMatch(/design skill/i);
		}
	});
});

describe("stage-specific context", () => {
	it.each([
		[
			"planning",
			undefined,
			["design-reasoning", "navigation-patterns", "anti-slop"],
		],
		["generation", undefined, ["typography-and-layout", "component-library"]],
		[
			"initial",
			"web" as const,
			["web-design", "website-patterns", "media-and-imagery"],
		],
		["initial", "mobile" as const, ["mobile-design", "mobile-patterns"]],
		["add-screen", "web" as const, ["navigation-patterns", "web-design"]],
		[
			"revision",
			"web" as const,
			["typography-and-layout", "anti-slop", "good-vs-bad"],
		],
		["correction", "web" as const, ["typography-and-layout"]],
	] as const)("delivers the references %s needs", (stage, viewport, expected) => {
		const plan = planEvvibeDesignContext(stage, viewport ? { viewport } : {});
		for (const id of expected) expect(plan.includedIds).toContain(id);
	});

	it("keeps the two platform families apart", () => {
		const web = planEvvibeDesignContext("initial", { viewport: "web" });
		const mobile = planEvvibeDesignContext("initial", { viewport: "mobile" });
		expect(web.includedIds).toContain("web-design");
		expect(web.includedIds).not.toContain("mobile-design");
		expect(mobile.includedIds).toContain("mobile-design");
		expect(mobile.includedIds).not.toContain("web-design");
		expect(web.text).toContain(
			"purposeful subset of the real information architecture",
		);
		expect(mobile.text).toContain("Back navigation is justified and expected");
	});

	it("gives every stage a different, bounded context and drops nothing mid-rule", () => {
		const stages = Object.keys(
			EVVIBE_DESIGN_STAGE_REFERENCES,
		) as (keyof typeof EVVIBE_DESIGN_STAGE_REFERENCES)[];
		const texts = new Set<string>();
		for (const stage of stages) {
			for (const viewport of ["web", "mobile"] as const) {
				const plan = planEvvibeDesignContext(stage, { viewport });
				expect(plan.chars).toBeLessThanOrEqual(
					EVVIBE_DESIGN_STAGE_BUDGET_CHARS[stage],
				);
				expect(plan.text.length).toBe(plan.chars);
				expect(plan.includedIds.length).toBeGreaterThan(0);
				texts.add(plan.text);
				for (const id of plan.includedIds)
					expect(plan.text).toContain(referenceBody(id));
				// An omitted section never appears in part.
				for (const id of plan.omittedIds)
					expect(plan.includedIds).not.toContain(id);
			}
		}
		expect(texts.size).toBeGreaterThanOrEqual(stages.length);
	});

	it("selects only references the package declares", () => {
		const known = new Set(REFERENCES.map((reference) => reference.id));
		for (const ids of Object.values(EVVIBE_DESIGN_STAGE_REFERENCES))
			for (const id of ids) expect(known.has(id)).toBe(true);
	});

	it("returns no context instead of failing when nothing is applicable", () => {
		const plan = planEvvibeDesignContext("correction", { viewport: "mobile" });
		expect(plan.text).toContain(
			"Responsive layout, intrinsic sizing and atomic values",
		);
		expect(plan.omittedIds).toEqual([]);
	});
});

describe("prompt builders use the stage that matches the request", () => {
	const base = {
		screenName: "Beranda",
		projectPrompt: "Portfolio fotografer lepas",
		designMode: "web" as const,
		blueprint: null,
	};

	it("separates a first screen from an added screen", () => {
		const initial = buildStudioFramePrompt({
			...base,
			screenOrigin: "initial",
		});
		const added = buildStudioFramePrompt({ ...base, screenOrigin: "add" });
		expect(initial).toContain('stage="initial"');
		expect(added).toContain('stage="add-screen"');
		expect(added).toContain("Navigation models and controlled assembly");
		expect(initial).not.toContain("Navigation models and controlled assembly");
	});

	it("switches to the revision stage when existing HTML is supplied", () => {
		const prompt = buildStudioFramePrompt({
			...base,
			previousHtml: "<html><body><main>Lama</main></body></html>",
		});
		expect(prompt).toContain('stage="revision"');
		expect(prompt).toContain("Decoration versus information");
	});

	it("carries the narrow correction rules next to the reported issues", () => {
		const prompt = buildStudioFrameCorrection(
			{
				framePrompt: "prompt",
				activeScreen: "Beranda",
				blueprint: null,
				viewport: "web",
				expectTokens: false,
				dsTokens: null,
				logoUrl: null,
			},
			["Essential control/option text has an ellipsis clipping rule."],
			page("<section>Isi</section>"),
		);
		expect(prompt).toContain('stage="correction"');
		expect(prompt).toContain(
			"Responsive layout, intrinsic sizing and atomic values",
		);
		expect(prompt).not.toContain(
			"Component anatomy distilled from mature libraries",
		);
	});

	it("keeps DESIGN.md above the internal intelligence in the precedence chain", () => {
		const prompt = buildStudioFramePrompt({
			...base,
			designMd: "# Tokens\nprimary: #123456",
		});
		expect(prompt).toContain("#123456");
		const precedence = prompt.slice(prompt.indexOf("Precedence:"));
		expect(precedence.indexOf("DESIGN.md")).toBeLessThan(
			precedence.indexOf("EvVibe design intelligence"),
		);
	});

	it("never injects context into the single-shot user prompt twice", () => {
		const prompt = buildStudioUserPrompt("Buat halaman kontak", {
			designMode: "web",
		});
		expect(prompt.match(/<EVVIBE_DESIGN_INTELLIGENCE/g)).toHaveLength(1);
	});
});

describe("the imagery contract cannot fabricate assets", () => {
	it("states the three permitted sources and forbids invented URLs", () => {
		const body = referenceBody("media-and-imagery");
		expect(body).toContain("https URL to a real, licensed asset");
		expect(body).toContain("/api/studio/asset?");
		expect(body).toContain("Never invent a URL");
		expect(body).not.toMatch(/https?:\/\/\S+\.(?:jpe?g|png|webp|avif)\b/i);
	});

	it("keeps the hard rejection of an unresolved image source", () => {
		const { hard } = inspectStudioHtml(
			page('<img alt="Pantai" src="destinasi.jpg">'),
		);
		expect(hard).toContain("Unresolved component image asset.");
	});
});

describe("card-only public composition is enforced, not just described", () => {
	const cardWall = page(
		[
			"<section data-card><h2>Tentang</h2><p>Paragraf panjang.</p></section>",
			"<section data-card><h2>Pengalaman</h2><p>Paragraf panjang.</p></section>",
			"<section data-card><h2>Keahlian</h2><p>Paragraf panjang.</p></section>",
		].join(""),
	);

	it("reports a wall of text-only cards on a public website", () => {
		const issues = validateGeneratedHtml(cardWall, {
			blueprint: publicWebsite,
			viewport: "web",
			expectTokens: false,
		});
		const cardIssue =
			"Komposisi halaman publik hanya berupa kartu teks; gunakan hero, karya, editorial, atau galeri sesuai isi.";
		expect(issues).toContain(cardIssue);
		expect(studioIssueCode(cardIssue)).toBe("CARD_ONLY_COMPOSITION");
	});

	it("does not report a composed page or a task-oriented application", () => {
		const withMedia = validateGeneratedHtml(
			page(
				[
					'<section data-card><h2>Tentang</h2><p>Paragraf.</p><img alt="Karya" src="https://example.com/karya.jpg"></section>',
					"<section data-card><h2>Pengalaman</h2><p>Paragraf.</p></section>",
					"<section data-card><h2>Keahlian</h2><p>Paragraf.</p></section>",
				].join(""),
			),
			{ blueprint: publicWebsite, viewport: "web", expectTokens: false },
		);
		expect(withMedia.join(" ")).not.toContain("kartu teks");

		const application = validateGeneratedHtml(cardWall, {
			blueprint: {
				...portfolioBlueprint,
				productIdentity: {
					...portfolioBlueprint.productIdentity,
					layoutIntent: "web-application",
				},
			},
			viewport: "web",
			expectTokens: false,
		});
		expect(application.join(" ")).not.toContain("kartu teks");
	});
});

describe("the intelligence has no user-facing selector", () => {
	it("delivers context for every stage without a project or user choice", () => {
		const stages = Object.keys(EVVIBE_DESIGN_STAGE_REFERENCES);
		expect(stages.sort()).toEqual([
			"add-screen",
			"correction",
			"generation",
			"initial",
			"planning",
			"revision",
		]);
		for (const stage of stages) {
			expect(
				buildEvvibeDesignContext(
					stage as keyof typeof EVVIBE_DESIGN_STAGE_REFERENCES,
				),
			).not.toBe("");
		}
	});
});
