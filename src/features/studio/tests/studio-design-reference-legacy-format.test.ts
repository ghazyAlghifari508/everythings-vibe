import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { studioFrames, studioProjects } from "@/db/schema";
import { FIXTURE } from "@/lib/design-fixture";
import { renderEvidenceDesignMd } from "@/lib/design-visual-evidence";
import { extractDesignSystemTokens } from "../services/studio-design-tokens";
import { runStudioJobPipeline } from "../services/studio-job-pipeline";
import { createStudioProjectWithJob } from "../services/studio-project-enqueue";
import { getStudioProject } from "../services/studio-project-query";
import { STUDIO_DESIGN_MD_MAX_CHARS } from "../types/studio-constants";
import {
	aiCalls,
	createStudioUser,
	documentHead,
	insertCompletedScrape,
	referenceFailure,
	resetStudioProvider,
} from "./studio-reference-harness";

vi.mock("@/lib/services/ai-orchestrator", async () => {
	const { studioProviderMock: mock } = await import(
		"./studio-reference-harness"
	);
	return mock;
});

beforeEach(() => {
	resetStudioProvider();
});

// The archived VibeScrape document: raw computed `rgb()` values, a typography
// table, and radii stated as measured properties instead of the token sections
// the current producer writes.
const LEGACY = renderEvidenceDesignMd(FIXTURE);

// One measured page with a canvas and body copy only: no action colour, no
// radius, no border. Everything the capture could not measure must stay absent.
const LEGACY_MINIMAL = renderEvidenceDesignMd({
	...FIXTURE,
	elements: FIXTURE.elements.filter((element) => element.role === "canvas"),
});

const SKILLS = [
	"none",
	"impeccable",
	"frontend-design",
	"ui-ux-pro-max",
	"anti-slop",
	"taste",
] as const;

describe("archived VibeScrape reference", () => {
	it("extracts the measured palette, typeface and radii without inventing the rest", () => {
		expect(extractDesignSystemTokens(LEGACY)?.colors).toEqual({
			primary: "#155eef",
			canvas: "#ffffff",
			ink: "#101828",
			surface: "#ffffff",
			muted: "#667085",
			border: null,
			accents: { text: "#ffffff", surface: "#f8fafc" },
		});
		expect(extractDesignSystemTokens(LEGACY)?.typography.fontFamily).toBe(
			"'Inter', system-ui, -apple-system, sans-serif",
		);
		expect(extractDesignSystemTokens(LEGACY)?.shapes.borderRadius).toEqual({
			buttons: "8px",
			nav: "0px",
			cards: "24px",
		});

		// A colour the parser cannot reduce to sRGB is not promoted to a token.
		const unsupported =
			"## Tokens - Colors\n\n| Name | Value | Token | Role |\n| --- | --- | --- | --- |\n| canvas | oklch(98% 0.01 250) | | canvas |\n";
		expect(extractDesignSystemTokens(unsupported)?.colors).toEqual({
			primary: null,
			canvas: null,
			ink: null,
			surface: null,
			muted: null,
			border: null,
			accents: {},
		});
	});

	for (const skill of SKILLS) {
		it(`creates a project and drives planning and every frame with ${skill}`, async () => {
			const userId = await createStudioUser();
			const scrapeId = await insertCompletedScrape(userId, LEGACY);

			const { project, job } = await createStudioProjectWithJob(userId, {
				prompt: "Sample application brief",
				initialPageCount: 2,
				designSkillId: skill,
				designReference: { kind: "scrape", id: scrapeId },
			});

			expect(project.designMd).toBe(LEGACY);
			expect(project.designReference).toMatchObject({
				kind: "scrape",
				id: scrapeId,
				source: "vibescrape",
			});

			await runStudioJobPipeline(job.id, project.id, userId);

			const planning = aiCalls("planning");
			expect(planning).toHaveLength(1);
			const planningUser = planning[0]?.[1]?.content ?? "";
			expect(planningUser).toContain(documentHead(LEGACY));
			expect(planningUser).toContain("- Primary Brand Color: #155eef");
			expect(planningUser).toContain("- Canvas Background: #ffffff");
			expect(planningUser).toContain("- Dominant Text/Ink Color: #101828");
			expect(planningUser).toContain(
				"- Typography: 'Inter', system-ui, -apple-system, sans-serif",
			);
			expect(planningUser).toContain("- Card Border Radius: 24px");
			expect(planningUser).toContain("- Button Border Radius: 8px");

			const frames = aiCalls("frame");
			expect(frames).toHaveLength(2);
			for (const messages of frames) {
				expect(messages[1]?.content).toContain(documentHead(LEGACY));
				expect(messages[1]?.content).toContain("rgb(21, 94, 239)");
				expect(messages[1]?.content).toContain("border-radius | 8px");
			}

			// The frame keeps the reference tokens in its delivered document.
			const stored = await db
				.select()
				.from(studioFrames)
				.where(eq(studioFrames.projectId, project.id));
			expect(stored).toHaveLength(2);
			for (const frame of stored) {
				expect(frame.status).toBe("ready");
				expect(frame.htmlCode).toContain("--color-primary: #155eef");
				expect(frame.htmlCode).toContain("--radius-card: 24px");
			}

			// The reference survives a reload, so a reopened project keeps it.
			const reloaded = await getStudioProject(project.id, userId);
			expect(reloaded.designMd).toBe(LEGACY);
			expect(reloaded.designReference).toMatchObject({
				kind: "scrape",
				id: scrapeId,
			});
		});
	}

	it("creates a project for a document that measures only a canvas", async () => {
		const userId = await createStudioUser();
		const scrapeId = await insertCompletedScrape(userId, LEGACY_MINIMAL);
		const { project } = await createStudioProjectWithJob(userId, {
			prompt: "Sample application brief",
			designReference: { kind: "scrape", id: scrapeId },
		});

		const tokens = extractDesignSystemTokens(project.designMd);
		expect(tokens?.colors.primary).toBeNull();
		expect(tokens?.colors.ink).toBe("#101828");
		expect(tokens?.shapes.borderRadius).toEqual({});
	});

	it("answers a stored document the design system cannot read with actionable copy", async () => {
		const userId = await createStudioUser();
		const unreadable = await insertCompletedScrape(
			userId,
			"# Broken\n| Name | Value |\n| --- | --- |\n| canvas | not-a-colour |\n",
		);
		const error = await referenceFailure(
			createStudioProjectWithJob(userId, {
				prompt: "Sample application brief",
				designReference: { kind: "scrape", id: unreadable },
			}),
		);
		expect(error.failure).toBe("unusable-stored-design");
		expect(error.message).toBe(
			"Referensi desain belum bisa digunakan. Pilih referensi lain atau periksa hasil VibeScrape.",
		);

		// A rejected reference never becomes a project for that user.
		const projects = await db
			.select()
			.from(studioProjects)
			.where(eq(studioProjects.userId, userId));
		expect(projects).toHaveLength(0);
	});

	it("rejects a stored document that exceeds the prompt budget", async () => {
		const userId = await createStudioUser();
		const oversized = await insertCompletedScrape(
			userId,
			`## Tokens - Colors\n\n| Name | Value | Token | Role |\n| --- | --- | --- | --- |\n| canvas | rgb(255, 255, 255) | | canvas |\n${"x".repeat(STUDIO_DESIGN_MD_MAX_CHARS)}`,
		);
		const error = await referenceFailure(
			createStudioProjectWithJob(userId, {
				prompt: "Sample application brief",
				designReference: { kind: "scrape", id: oversized },
			}),
		);
		expect(error.failure).toBe("unusable-stored-design");
	});
});
