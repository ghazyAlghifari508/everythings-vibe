import { describe, expect, it } from "vitest";
import { buildCodebasePromptBlock } from "./codebase-generation-context";
import {
	buildPlanningModeDirective,
	buildStageScopeDirective,
} from "./planning-mode";
import { depthDirective } from "./prompt-depth";
import { buildTaskRepairPrompt, TASK_GENERATION_PROMPT } from "./prompts-task";
import { buildTaskSystemPrompt } from "./services/task-generation";
import {
	buildTaskGenerationPrompt,
	taskDepthDirectiveForMode,
} from "./task-decomposition";

/**
 * Greenfield regression guard.
 *
 * The existing-codebase fix must not alter greenfield planning in any way:
 * every mode-aware composer must return the exact pre-fix output when the mode
 * is greenfield (or unset). These tests lock that boundary so a future change
 * cannot silently widen greenfield behavior.
 */

const AC = [
	"## 1. Checkout",
	"### AC-1.1 Cart state",
	"### AC-1.2 Quantity validation",
].join("\n");

describe("greenfield prompt composition is byte-identical", () => {
	it("Fitur/PRD/AC scope directives are empty for greenfield", () => {
		expect(buildPlanningModeDirective("greenfield")).toBe("");
		for (const stage of ["fitur", "prd", "ac", "task"] as const) {
			expect(buildStageScopeDirective(stage, "greenfield")).toBe("");
			expect(buildStageScopeDirective(stage, undefined)).toBe("");
		}
	});

	it("the codebase prompt block is an empty string for greenfield (null context)", () => {
		expect(buildCodebasePromptBlock(null)).toBe("");
	});

	it("the task generation prompt is the base prompt for greenfield", () => {
		expect(buildTaskGenerationPrompt("greenfield")).toBe(
			TASK_GENERATION_PROMPT,
		);
		expect(buildTaskGenerationPrompt(undefined)).toBe(TASK_GENERATION_PROMPT);
		expect(buildTaskGenerationPrompt(null)).toBe(TASK_GENERATION_PROMPT);
	});

	it("the task depth directive is unchanged for greenfield", () => {
		expect(
			taskDepthDirectiveForMode("greenfield", depthDirective("task")),
		).toBe(depthDirective("task"));
		expect(taskDepthDirectiveForMode(undefined, depthDirective("task"))).toBe(
			depthDirective("task"),
		);
	});

	it("the repair prompt is unchanged for greenfield", () => {
		const repair = buildTaskRepairPrompt(["AC-1.1"]);
		expect(repair).toContain("AC-1.1");
		expect(repair).not.toContain("MODE EXISTING CODEBASE");
	});

	it("the composed task system prompt matches the pre-fix greenfield shape", () => {
		const prompt = buildTaskSystemPrompt({
			acMarkdown: AC,
			prdContent: "## 6. Architecture & Tech Stack",
			grounded: "",
			codebaseBlock: "",
			language: "id",
		});
		// Greenfield must keep the mandatory 5-layer decomposition and the
		// depth directive's mandatory sentence.
		expect(prompt).toContain("5-LAYER DEKOMPOSISI TEKNIS");
		expect(prompt).toContain("WAJIB didekomposisi");
		expect(prompt).toContain(
			"Setiap fitur pada AC wajib dipecah ke dalam 5-layer teknis",
		);
		// And it must not leak any existing-codebase directive.
		expect(prompt).not.toContain("DEKOMPOSISI TEKNIS KONDISIONAL");
		expect(prompt).not.toContain("EXISTING CODEBASE");
		expect(prompt).not.toContain("SCOPE PERUBAHAN");

		// The mode-aware composer with explicit greenfield is identical.
		const explicit = buildTaskSystemPrompt({
			acMarkdown: AC,
			prdContent: "## 6. Architecture & Tech Stack",
			grounded: "",
			codebaseBlock: "",
			language: "id",
			mode: "greenfield",
		});
		expect(explicit).toBe(prompt);
	});

	it("keeps the greenfield prompt free of the conditional-layer override", () => {
		const prompt = buildTaskSystemPrompt({
			acMarkdown: AC,
			prdContent: "",
			grounded: "",
			codebaseBlock: "",
			language: "en",
		});
		expect(prompt).not.toContain("KONDISIONAL");
		expect(prompt).toContain("OUTPUT LANGUAGE DIRECTIVE");
	});
});
