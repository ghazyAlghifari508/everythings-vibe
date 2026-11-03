import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	assembleCanonicalShell,
	validateCanonicalShell,
} from "../services/studio-canonical-shell";
import type { StudioDesignBlueprint } from "../services/studio-design-blueprint";
import {
	resolveStudioDesignSkill,
	resolveStudioFrameSystemPrompt,
	resolveStudioPlanningSystemPrompt,
} from "../services/studio-design-skill-registry.server";
import { enforceDesignSystemOnHtml } from "../services/studio-design-system-html";
import { generateValidatedFrameHtml } from "../services/studio-frame-generation";
import { buildStudioPlanningPrompt } from "../services/studio-planning-prompt";
import { buildStudioFramePrompt } from "../services/studio-screen-prompts";
import {
	buildStudioSkillContext,
	type StudioSkillStage,
} from "../services/studio-skill-context.server";
import { STUDIO_SKILL_STAGE_BUDGET_CHARS } from "../types/studio-constants";
import {
	financeBlueprint,
	travelBlueprint,
	webSaaSBlueprint,
} from "./fixtures/studio-evaluation-fixtures";

const provider = vi.hoisted(() => ({
	calls: 0,
	responses: [] as string[],
}));

vi.mock("@/lib/services/ai-orchestrator", () => ({
	selectModels: () => ["mock"],
	tryStreamWithFallback: async () => {
		const html =
			provider.responses[
				Math.min(provider.calls, provider.responses.length - 1)
			] ?? "";
		provider.calls++;
		return {
			firstChunk: html,
			generator: (async function* () {})(),
			outcome: {},
		};
	},
}));

afterEach(() => {
	provider.calls = 0;
	provider.responses = [];
});

const SKILLS = [
	"none",
	"impeccable",
	"frontend-design",
	"ui-ux-pro-max",
	"anti-slop",
	"taste",
] as const;

interface Brief {
	id: string;
	prompt: string;
	mode: "web" | "mobile";
	blueprint: StudioDesignBlueprint;
	screen: string;
	requiredTerms: string[];
}

const BRIEFS: Brief[] = [
	{
		id: "finance-mobile",
		prompt:
			"Aplikasi keuangan pribadi untuk mencatat pemasukan, pengeluaran, anggaran bulanan, dan laporan arus kas.",
		mode: "mobile",
		blueprint: financeBlueprint,
		screen: "Beranda",
		requiredTerms: ["pemasukan", "anggaran", "arus kas"],
	},
	{
		id: "travel-mobile",
		prompt:
			"Aplikasi travel untuk mencari tiket pesawat, hotel, dan menyusun itinerary perjalanan.",
		mode: "mobile",
		blueprint: travelBlueprint,
		screen: "Eksplorasi",
		requiredTerms: ["tiket pesawat", "hotel", "itinerary"],
	},
	{
		id: "saas-analytics-web",
		prompt:
			"SaaS analytics dashboard untuk memantau metrik produk, retensi, dan performa tim secara real-time.",
		mode: "web",
		blueprint: webSaaSBlueprint,
		screen: "Dashboard",
		requiredTerms: ["metrik produk", "retensi", "real-time"],
	},
	{
		id: "developer-portfolio",
		prompt:
			"Developer portfolio untuk menampilkan proyek, keahlian teknis, dan pengalaman kerja.",
		mode: "web",
		blueprint: webSaaSBlueprint,
		screen: "Dashboard",
		requiredTerms: ["proyek", "keahlian teknis", "pengalaman kerja"],
	},
];

function validRawHtml(): string {
	return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main data-studio-content><section data-card><h2>Ringkasan</h2><p>Data contoh yang realistis</p><button data-primary>Lihat detail</button></section></main></body></html>`;
}

const INVALID_RAW_HTML =
	'<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main data-studio-content></main></body></html>';

function stageChars(skillId: (typeof SKILLS)[number], stage: StudioSkillStage) {
	return buildStudioSkillContext(skillId, { stage }).plan.characterCount;
}

function document(html: string): Document {
	return new JSDOM(html).window.document;
}

describe("Comparative skill evaluation on four representative briefs (Task 02)", () => {
	it("measures planning and frame prompt sizes against the legacy full adapter", () => {
		const rows = BRIEFS.flatMap((brief) =>
			SKILLS.map((skillId) => {
				const legacy = resolveStudioDesignSkill(skillId);
				const planning =
					resolveStudioPlanningSystemPrompt(skillId, brief.prompt, brief.mode) +
					buildStudioPlanningPrompt(brief.prompt, brief.mode, null, 3);
				const frame =
					resolveStudioFrameSystemPrompt(skillId) +
					buildStudioFramePrompt({
						screenName: brief.screen,
						projectPrompt: brief.prompt,
						designMode: brief.mode,
						blueprint: brief.blueprint,
						activeScreen: brief.screen,
					});
				expect(frame).toContain(brief.prompt);
				expect(frame).toContain(
					"Design precedence, highest to lowest: safety and platform validity",
				);
				return {
					brief: brief.id,
					skill: skillId,
					legacySkillChars: legacy.guidance.length,
					planningSkillChars: stageChars(skillId, "planning"),
					frameSkillChars: stageChars(skillId, "frame"),
					planningChars: planning.length,
					frameChars: frame.length,
				};
			}),
		);

		// Every skill stays inside its stage budgets, and the baseline is empty.
		for (const row of rows) {
			expect(row.planningSkillChars).toBeLessThanOrEqual(
				STUDIO_SKILL_STAGE_BUDGET_CHARS.planning,
			);
			expect(row.frameSkillChars).toBeLessThanOrEqual(
				STUDIO_SKILL_STAGE_BUDGET_CHARS.frame,
			);
		}
		expect(rows.filter((row) => row.skill === "none")).toHaveLength(
			BRIEFS.length,
		);
		expect(
			rows
				.filter((row) => row.skill === "none")
				.every(
					(row) => row.planningSkillChars === 0 && row.frameSkillChars === 0,
				),
		).toBe(true);

		console.info(
			JSON.stringify({
				measurement: "deterministic-prompt-size-comparison",
				note: "chars only; provider latency and tokens are mocked/estimated, not real",
				rows,
			}),
		);
	});

	it("runs the real frame pipeline with a mocked provider for every brief and skill", async () => {
		const rows: Array<Record<string, unknown>> = [];
		for (const brief of BRIEFS) {
			for (const skillId of SKILLS) {
				provider.calls = 0;
				provider.responses = [INVALID_RAW_HTML, validRawHtml()];
				const framePrompt = buildStudioFramePrompt({
					screenName: brief.screen,
					projectPrompt: brief.prompt,
					designMode: brief.mode,
					blueprint: brief.blueprint,
					activeScreen: brief.screen,
				});
				let ok = true;
				try {
					await generateValidatedFrameHtml({
						framePrompt,
						activeScreen: brief.screen,
						blueprint: brief.blueprint,
						viewport: brief.mode,
						expectTokens: false,
						designSkillId: skillId,
						dsTokens: null,
						logoUrl: null,
					});
				} catch {
					ok = false;
				}
				rows.push({
					brief: brief.id,
					skill: skillId,
					validated: ok,
					providerCalls: provider.calls,
					corrections: provider.calls - 1,
				});
			}
		}

		const passRate =
			rows.filter((row) => row.validated === true).length / rows.length;
		expect(passRate).toBe(1);
		// One deliberately invalid first response must trigger exactly one bounded
		// correction, independent of the selected skill.
		expect(rows.every((row) => row.corrections === 1)).toBe(true);
		console.info(
			JSON.stringify({
				measurement: "mocked-provider-pipeline",
				briefs: BRIEFS.length,
				skills: SKILLS.length,
				passRate,
				correctionFrequency: rows[0]?.corrections,
				note: "mocked provider: measures pipeline behaviour, not model aesthetics",
			}),
		);
	}, 30_000);

	it("keeps shared component structure consistent across screens and skills", () => {
		for (const brief of BRIEFS) {
			const screens = brief.blueprint.screenPlan.slice(0, 2);
			const structures = screens.map((screen) => {
				const enforced = enforceDesignSystemOnHtml(
					validRawHtml(),
					null,
					null,
					brief.blueprint,
				);
				const html = assembleCanonicalShell(
					enforced,
					brief.blueprint,
					screen.name,
					null,
				);
				expect(
					validateCanonicalShell(html, brief.blueprint, screen.name, null),
					`${brief.id}/${screen.name}`,
				).toEqual([]);
				const doc = document(html);
				const nav = doc.querySelector("nav[data-studio-navigation]");
				return {
					nav: nav?.innerHTML,
					destinations: Array.from(nav?.querySelectorAll("a") ?? []).map(
						(link) => link.getAttribute("data-destination"),
					),
				};
			});
			expect(structures[0]?.destinations).toEqual(
				brief.blueprint.navigationContract.destinations,
			);
			expect(structures[1]?.destinations).toEqual(
				brief.blueprint.navigationContract.destinations,
			);
		}
	});

	it("covers the brief requirements in every planning and frame prompt", () => {
		for (const brief of BRIEFS) {
			for (const skillId of SKILLS) {
				const planning =
					resolveStudioPlanningSystemPrompt(skillId, brief.prompt, brief.mode) +
					buildStudioPlanningPrompt(brief.prompt, brief.mode, null, 3);
				const frame =
					resolveStudioFrameSystemPrompt(skillId) +
					buildStudioFramePrompt({
						screenName: brief.screen,
						projectPrompt: brief.prompt,
						designMode: brief.mode,
						blueprint: brief.blueprint,
						activeScreen: brief.screen,
					});
				expect(planning).toContain("OUTPUT CONTRACT");
				expect(frame).toContain(brief.prompt);
				expect(frame).toContain(`SCREEN TO BUILD: "${brief.screen}"`);
				expect(frame).toContain("safety and platform validity");
				for (const term of brief.requiredTerms) {
					expect(`${planning}\n${frame}`.toLowerCase()).toContain(
						term.toLowerCase(),
					);
				}
			}
		}
	});
});
