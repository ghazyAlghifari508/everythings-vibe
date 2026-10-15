import { describe, expect, it } from "vitest";
import { TASK_GENERATION_PROMPT } from "./prompts-task";
import {
	buildTaskGenerationPrompt,
	CONDITIONAL_DECOMPOSITION_DIRECTIVE,
	CONDITIONAL_DECOMPOSITION_RULES,
	taskDepthDirectiveForMode,
} from "./task-decomposition";

const GREENFIELD_DEPTH = "## MODE KEDALAMAN: ADAPTIF & DETAIL LENGKAP";

describe("buildTaskGenerationPrompt", () => {
	it("returns the greenfield base prompt unchanged", () => {
		expect(buildTaskGenerationPrompt("greenfield")).toBe(
			TASK_GENERATION_PROMPT,
		);
		expect(buildTaskGenerationPrompt(undefined)).toBe(TASK_GENERATION_PROMPT);
		expect(buildTaskGenerationPrompt(null)).toBe(TASK_GENERATION_PROMPT);
	});

	it("makes the 5-layer rules conditional on an existing codebase", () => {
		const prompt = buildTaskGenerationPrompt("existing_codebase");
		expect(prompt).toContain("DEKOMPOSISI TEKNIS KONDISIONAL");
		expect(prompt).toContain("KONDISIONAL");
		// The mandate must be explicitly demoted to a guide, not a checklist.
		expect(prompt).toMatch(/BUKAN daftar layer yang wajib ada/);
	});

	it("reframes the task as a change to an existing app instead of a rebuild", () => {
		const prompt = buildTaskGenerationPrompt("existing_codebase");
		expect(prompt).toMatch(/PERUBAHAN pada aplikasi yang SUDAH ADA/);
		// The greenfield framing line must be gone, not merely followed.
		expect(prompt).not.toContain(
			"menjadi IMPLEMENTATION PLAN yang cukup detail untuk dikerjakan coding agent tanpa menebak-nebak",
		);
	});

	it("forbids each conditional layer unless justified by requirement or evidence", () => {
		const prompt = buildTaskGenerationPrompt("existing_codebase");
		expect(prompt).toMatch(/DILARANG membuat task migrasi\/skema database/);
		expect(prompt).toMatch(/DILARANG membuat endpoint backend baru/);
		expect(prompt).toMatch(/authorization\/RBAC baru/);
		expect(prompt).toMatch(/state management library baru/);
		expect(prompt).toMatch(/infrastructure baru/);
	});

	it("does not forbid a technical layer absolutely, only without justification", () => {
		const prompt = buildTaskGenerationPrompt("existing_codebase");
		expect(prompt).toMatch(
			/JANGAN melarang layer teknis tertentu secara mutlak/,
		);
		expect(prompt).toMatch(/WAJIBKAN justifikasi yang dapat ditelusuri/);
		// The allowance for justified layers must be present too.
		expect(prompt).toMatch(/task authorization boleh dibuat/);
		expect(prompt).toMatch(/boleh mencakup perubahan service\/API/);
	});

	it("keeps priority based on impact rather than layer", () => {
		const prompt = buildTaskGenerationPrompt("existing_codebase");
		expect(prompt).toMatch(
			/priority berdasarkan DAMPAK produk\/requirement, bukan berdasarkan layer/,
		);
	});

	it("keeps the greenfield layer names documented so the base contract survives", () => {
		// Regression guard: the conditional directive must not erase the base
		// 5-layer reference; it only makes it conditional.
		const prompt = buildTaskGenerationPrompt("existing_codebase");
		expect(prompt).toContain("Layer Data & Storage");
		expect(prompt).toContain("Layer UI States & Interaction");
	});
});

describe("CONDITIONAL_DECOMPOSITION_DIRECTIVE", () => {
	it("names the infrastructure layers that must not be auto-required", () => {
		for (const term of [
			"database migration",
			"backend endpoint",
			"authentication",
			"dashboard",
		]) {
			expect(CONDITIONAL_DECOMPOSITION_DIRECTIVE).toContain(term);
		}
	});

	it("contains no hardcoded product-specific final task example", () => {
		// The directive may reason about article search as an illustration, but
		// it must not present a named product feature as the required output.
		expect(CONDITIONAL_DECOMPOSITION_DIRECTIVE).toMatch(
			/bukan daftar fitur baku/,
		);
	});

	it("forbids fake or template-only tasks", () => {
		expect(CONDITIONAL_DECOMPOSITION_RULES).toMatch(
			/JANGAN membuat layer fiktif, empty\/fake supporting task/,
		);
		expect(CONDITIONAL_DECOMPOSITION_RULES).toMatch(
			/Gunakan file path aktual HANYA jika didukung bukti repositori/,
		);
	});
});

describe("taskDepthDirectiveForMode", () => {
	it("keeps the greenfield depth directive untouched", () => {
		expect(taskDepthDirectiveForMode("greenfield", GREENFIELD_DEPTH)).toBe(
			GREENFIELD_DEPTH,
		);
		expect(taskDepthDirectiveForMode(undefined, GREENFIELD_DEPTH)).toBe(
			GREENFIELD_DEPTH,
		);
	});

	it("replaces the mandatory 5-layer sentence for an existing codebase", () => {
		const directive = taskDepthDirectiveForMode(
			"existing_codebase",
			GREENFIELD_DEPTH,
		);
		// The greenfield sentence forced every AC feature into all 5 layers.
		expect(directive).not.toContain(
			"Setiap fitur pada AC wajib dipecah ke dalam 5-layer teknis",
		);
		expect(directive).toMatch(/bersifat KONDISIONAL/);
		expect(directive).toMatch(/PROPORSIONAL TERHADAP PERUBAHAN/);
	});

	it("keeps the subtask details contract in both modes", () => {
		const directive = taskDepthDirectiveForMode(
			"existing_codebase",
			GREENFIELD_DEPTH,
		);
		expect(directive).toMatch(/Setiap subtask WAJIB punya field "details"/);
	});
});
