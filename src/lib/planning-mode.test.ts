import { describe, expect, it } from "vitest";
import {
	buildPlanningModeDirective,
	buildStageScopeDirective,
	isExistingCodebaseMode,
	normalizePlanningMode,
} from "./planning-mode";

describe("normalizePlanningMode", () => {
	it("maps the existing-codebase mode to itself", () => {
		expect(normalizePlanningMode("existing_codebase")).toBe(
			"existing_codebase",
		);
	});

	it("defaults missing or unknown modes to greenfield", () => {
		expect(normalizePlanningMode(undefined)).toBe("greenfield");
		expect(normalizePlanningMode(null)).toBe("greenfield");
		expect(normalizePlanningMode("greenfield")).toBe("greenfield");
		expect(normalizePlanningMode("something_else")).toBe("greenfield");
	});

	it("exposes a boolean mode check", () => {
		expect(isExistingCodebaseMode("existing_codebase")).toBe(true);
		expect(isExistingCodebaseMode("greenfield")).toBe(false);
	});
});

describe("buildPlanningModeDirective", () => {
	it("returns an empty string for greenfield so prompts stay byte-identical", () => {
		expect(buildPlanningModeDirective("greenfield")).toBe("");
		expect(buildPlanningModeDirective(undefined)).toBe("");
		expect(buildPlanningModeDirective(null)).toBe("");
	});

	it("frames the work as a change to an existing app, not a rebuild", () => {
		const directive = buildPlanningModeDirective("existing_codebase");
		expect(directive).toContain("EXISTING CODEBASE");
		expect(directive).toMatch(/PERUBAHAN/);
		expect(directive).toMatch(
			/JANGAN menganggap aplikasi perlu dibangun ulang/,
		);
	});

	it("orders the sources of truth from user intent to necessary inference", () => {
		const directive = buildPlanningModeDirective("existing_codebase");
		const intent = directive.indexOf("Permintaan asli user");
		const evidence = directive.indexOf("Bukti repositori");
		const persisted = directive.indexOf("Artefak yang sudah ada");
		const inference = directive.indexOf("Inferensi teknis");
		expect(intent).toBeGreaterThanOrEqual(0);
		expect(evidence).toBeGreaterThan(intent);
		expect(persisted).toBeGreaterThan(evidence);
		expect(inference).toBeGreaterThan(persisted);
	});

	it("requires a traceable justification per technical part", () => {
		const directive = buildPlanningModeDirective("existing_codebase");
		expect(directive).toMatch(/WAJIB punya alasan yang bisa ditelusuri/);
	});

	it("forbids inventing a database when the analysis shows none", () => {
		const directive = buildPlanningModeDirective("existing_codebase");
		expect(directive).toMatch(/JANGAN merencanakan skema database/);
	});

	it("puts reuse before reinvention and separates existing from proposed files", () => {
		const directive = buildPlanningModeDirective("existing_codebase");
		expect(directive).toMatch(/REUSE SEBELUM MEMBUAT BARU/);
		expect(directive).toMatch(/proposed new file/);
		expect(directive).toMatch(/JANGAN mencampuradukkan keduanya/);
	});
});

describe("buildStageScopeDirective", () => {
	it("returns an empty string for every stage in greenfield", () => {
		for (const stage of ["fitur", "prd", "ac", "task"] as const) {
			expect(buildStageScopeDirective(stage, "greenfield")).toBe("");
		}
	});

	it("includes both the shared scope directive and the stage rules", () => {
		const directive = buildStageScopeDirective("task", "existing_codebase");
		expect(directive).toContain("EXISTING CODEBASE");
		expect(directive).toContain("PERUBAHAN");
		expect(directive).toContain("ATURAN KHUSUS EXISTING CODEBASE (TASK)");
	});

	it("keeps the Fitur stage proportional instead of forcing 8-16 features", () => {
		const directive = buildStageScopeDirective("fitur", "existing_codebase");
		expect(directive).toMatch(/PROPORSIONAL/);
		expect(directive).toMatch(/JANGAN memaksa 8-16 fitur/);
		// The unrequested domains must be explicitly named as forbidden additions.
		expect(directive).toMatch(/manajemen akun/);
		expect(directive).toMatch(/RBAC/);
		expect(directive).toMatch(/dashboard/);
	});

	it("keeps the PRD scoped to affected flows and marks out-of-scope", () => {
		const directive = buildStageScopeDirective("prd", "existing_codebase");
		expect(directive).toMatch(/flow yang TERDAMPAK/);
		expect(directive).toMatch(/EXISTING \/ MODIFIED \/ NEW/);
		expect(directive).toMatch(/non-goals/i);
	});

	it("keeps AC limited to changed behavior and existing contracts", () => {
		const directive = buildStageScopeDirective("ac", "existing_codebase");
		expect(directive).toMatch(
			/HANYA untuk perilaku yang berubah atau ditambahkan/,
		);
		expect(directive).toMatch(/kontrak yang benar-benar dipakai/);
	});

	it("forbids rebuilding existing behavior in tasks", () => {
		const directive = buildStageScopeDirective("task", "existing_codebase");
		expect(directive).toMatch(
			/membangun ulang komponen yang cukup dimodifikasi/,
		);
		expect(directive).toMatch(/proposed new file/);
		expect(directive).toMatch(/JANGAN membuat empty\/fake supporting task/);
	});
});
