import { describe, expect, it } from "vitest";
import {
	buildStudioSkillSystemPrompt,
	getStudioSkillCapability,
	resolveStudioDesignSkill,
	resolveStudioFrameSystemPrompt,
	resolveStudioPlanningSystemPrompt,
	studioSkillSystemGuidance,
} from "../services/studio-design-skill-registry.server";
import { STUDIO_DESIGN_SKILLS } from "../services/studio-design-skills";
import { buildStudioPlanningPrompt } from "../services/studio-planning-prompt";
import {
	STUDIO_PLAN_SYSTEM_PROMPT,
	STUDIO_SYSTEM_PROMPT,
} from "../services/studio-prompt-contracts";
import { buildStudioFramePrompt } from "../services/studio-screen-prompts";

const SKILL_IDS = [
	"none",
	"impeccable",
	"frontend-design",
	"ui-ux-pro-max",
	"anti-slop",
	"taste",
] as const;

describe("Studio skill fidelity (P3)", () => {
	it("No Skill contributes no extra user-selected skill guidance", () => {
		expect(studioSkillSystemGuidance("none")).toBe("");
		expect(resolveStudioDesignSkill("none").guidance).toBe("");
		expect(resolveStudioDesignSkill("none").sourceRevision).toBeNull();
	});

	it("each skill resolves to distinct, nonempty relevant instructions", () => {
		const guidances = new Map<string, string>();
		for (const skill of STUDIO_DESIGN_SKILLS.slice(1)) {
			const resolved = resolveStudioDesignSkill(skill.id);
			expect(resolved.guidance.length).toBeGreaterThan(100);
			expect(resolved.sourceRevision).toMatch(/^[a-f0-9]{40}$/);
			guidances.set(skill.id, resolved.guidance);
		}
		const values = [...guidances.values()];
		expect(new Set(values).size).toBe(values.length);
	});

	it("each guidance carries source-grounded markers", () => {
		expect(resolveStudioDesignSkill("impeccable").guidance).toContain(
			"persuade, operate, read, or experience",
		);
		expect(resolveStudioDesignSkill("impeccable").guidance).toContain(
			"The brief wins",
		);
		expect(resolveStudioDesignSkill("frontend-design").guidance).toContain(
			"one memorable focal element",
		);
		expect(resolveStudioDesignSkill("frontend-design").guidance).toContain(
			"SaaS-card",
		);
		expect(resolveStudioDesignSkill("ui-ux-pro-max").guidance).toContain(
			"4.5:1",
		);
		expect(resolveStudioDesignSkill("ui-ux-pro-max").guidance).toContain(
			"44px",
		);
		expect(resolveStudioDesignSkill("ui-ux-pro-max").guidance).toContain(
			"reduced-motion",
		);
		expect(resolveStudioDesignSkill("anti-slop").guidance).toContain(
			"purpose filter",
		);
		expect(resolveStudioDesignSkill("anti-slop").guidance).toContain(
			"filter, not a house style",
		);
		expect(resolveStudioDesignSkill("taste").guidance).toContain(
			"landing-page workflow",
		);
		expect(resolveStudioDesignSkill("taste").guidance).toContain(
			"one icon family",
		);
	});

	it("unsupported skill IDs are rejected", () => {
		expect(() => resolveStudioDesignSkill("unrecognized")).toThrow();
		expect(() =>
			resolveStudioDesignSkill("https://example.test/skill"),
		).toThrow();
		expect(() => studioSkillSystemGuidance("unrecognized")).toThrow();
	});

	it("correct versions are reported", () => {
		for (const id of SKILL_IDS.slice(1)) {
			const resolved = resolveStudioDesignSkill(id);
			expect(resolved.version).toBe(2);
			expect(typeof resolved.sourceRevision).toBe("string");
		}
	});

	it("capability mapping documents prompt-compatible vs agent-tool boundaries", () => {
		const uiUx = getStudioSkillCapability("ui-ux-pro-max");
		expect(uiUx.searchableDatasets).toBe(false);
		expect(uiUx.requiresAgentTools.join(" ")).toContain("search.py");
		const impeccable = getStudioSkillCapability("impeccable");
		expect(impeccable.requiresAgentTools.join(" ")).toContain("impeccable");
		const taste = getStudioSkillCapability("taste");
		expect(taste.limitations.join(" ")).toContain("dashboard");
		for (const id of SKILL_IDS) {
			const cap = getStudioSkillCapability(id);
			expect(Array.isArray(cap.promptCompatible)).toBe(true);
			expect(Array.isArray(cap.requiresAgentTools)).toBe(true);
		}
		expect(() => getStudioSkillCapability("unrecognized")).toThrow();
	});

	it("prompt assembly includes the selected guidance in planning and frame generation", () => {
		const planningSystem = resolveStudioPlanningSystemPrompt("impeccable");
		expect(planningSystem).toContain(STUDIO_PLAN_SYSTEM_PROMPT);
		expect(planningSystem).toContain("Selected design skill: impeccable");
		expect(planningSystem).toContain("persuade, operate, read, or experience");

		const frameSystem = resolveStudioFrameSystemPrompt("taste");
		expect(frameSystem).toContain(STUDIO_SYSTEM_PROMPT);
		expect(frameSystem).toContain("Selected design skill: taste");
		expect(frameSystem).toContain("landing-page workflow");

		expect(resolveStudioPlanningSystemPrompt("none")).toBe(
			STUDIO_PLAN_SYSTEM_PROMPT,
		);
		expect(resolveStudioFrameSystemPrompt("none")).toBe(STUDIO_SYSTEM_PROMPT);

		const generic = buildStudioSkillSystemPrompt(
			STUDIO_SYSTEM_PROMPT,
			"anti-slop",
		);
		expect(generic).toContain("purpose filter");
	});

	it("planning and frame user prompts keep design reference priority over skill preferences", () => {
		const planning = buildStudioPlanningPrompt(
			"Aplikasi kasir",
			"web",
			null,
			2,
		);
		expect(planning).toContain("explicit user requirements");
		expect(planning).toContain("selected design skill guidance");
		const precedence = planning.indexOf("explicit user requirements");
		const skillPos = planning.indexOf("selected design skill guidance");
		expect(precedence).toBeGreaterThanOrEqual(0);
		expect(skillPos).toBeGreaterThan(precedence);

		const frame = buildStudioFramePrompt({
			screenName: "Dashboard",
			projectPrompt: "Aplikasi kasir",
			designMode: "web",
		});
		expect(frame).toContain("explicit user requirements");
		expect(frame).toContain(
			"A design skill must never override explicit user colors",
		);
	});

	it("external guidance remains inside the intended trust boundary", () => {
		for (const skill of STUDIO_DESIGN_SKILLS.slice(1)) {
			const guidance = resolveStudioDesignSkill(skill.id).guidance;
			expect(guidance).not.toContain("<script");
			expect(guidance).not.toContain("javascript:");
			expect(guidance).not.toContain("http://");
			expect(guidance).not.toContain("https://");
			expect(guidance.toLowerCase()).not.toContain(
				"ignore previous instructions",
			);
			expect(guidance.toLowerCase()).not.toContain("execute");
		}
		const system = resolveStudioFrameSystemPrompt("frontend-design");
		expect(system).toContain("do not add commentary or executable behavior");
	});
});
