import { describe, expect, it } from "vitest";
import {
	auditStudioSkillContexts,
	STUDIO_AUDITED_SKILL_IDS,
	STUDIO_SKILL_STAGES,
} from "../services/studio-skill-context-audit.server";
import { STUDIO_SKILL_STAGE_BUDGET_CHARS } from "../types/studio-constants";

describe("Deterministic Studio skill context audit (Task 02)", () => {
	const rows = auditStudioSkillContexts();

	it("audits all five real skills plus the No Skill baseline", () => {
		expect(rows.map((row) => row.skillId)).toEqual(STUDIO_AUDITED_SKILL_IDS);
		expect(rows).toHaveLength(6);
		expect(
			rows.find((row) => row.skillId === "none")?.legacyGuidanceChars,
		).toBe(0);
	});

	it("is fully deterministic across runs", () => {
		expect(auditStudioSkillContexts()).toEqual(rows);
	});

	it("reports every measured stage with no repeated or non-verbatim section", () => {
		for (const row of rows) {
			expect(row.stages.map((stage) => stage.stage)).toEqual(
				STUDIO_SKILL_STAGES,
			);
			for (const stage of row.stages) {
				expect(stage.nonVerbatimSections).toEqual([]);
				expect(stage.duplicateSubstrings).toBe(0);
				if (row.skillId !== "none") {
					expect(stage.selectedSectionCount).toBeGreaterThan(0);
					expect(stage.contextChars).toBeLessThanOrEqual(
						STUDIO_SKILL_STAGE_BUDGET_CHARS[stage.stage],
					);
				}
			}
		}
	});

	it("proves stage-aware delivery shrinks large skills without rewriting them", () => {
		const antiSlop = rows.find((row) => row.skillId === "anti-slop");
		const taste = rows.find((row) => row.skillId === "taste");
		const uiUx = rows.find((row) => row.skillId === "ui-ux-pro-max");
		if (!antiSlop || !taste || !uiUx) throw new Error("audit rows missing");

		for (const row of [antiSlop, taste, uiUx]) {
			const planning = row.stages.find((stage) => stage.stage === "planning");
			const frame = row.stages.find((stage) => stage.stage === "frame");
			const correction = row.stages.find(
				(stage) => stage.stage === "correction",
			);
			if (!planning || !frame || !correction)
				throw new Error("stage rows missing");
			expect(frame.contextChars).toBeLessThan(row.legacyGuidanceChars);
			expect(planning.contextChars).toBeLessThan(row.legacyGuidanceChars);
			expect(correction.contextChars).toBeLessThan(frame.contextChars);
		}
		// The legacy Anti-Slop adapter measured in production logs (~97k chars).
		expect(antiSlop.legacyGuidanceChars).toBeGreaterThan(90_000);
	});

	it("keeps No Skill as the empty baseline and small skills fully delivered", () => {
		const none = rows.find((row) => row.skillId === "none");
		if (!none) throw new Error("none row missing");
		expect(none.originalSourceChars).toBe(0);
		for (const stage of none.stages) expect(stage.contextChars).toBe(0);

		const frontendDesign = rows.find(
			(row) => row.skillId === "frontend-design",
		);
		if (!frontendDesign) throw new Error("frontend-design row missing");
		// The full skill fits planning/frame/revision; only the smaller correction
		// budget can omit a section.
		for (const stage of frontendDesign.stages) {
			if (stage.stage === "correction") continue;
			expect(stage.omittedSectionCount, stage.stage).toBe(0);
		}
	});

	it("prints the machine-readable audit report", () => {
		console.info(
			JSON.stringify(
				{
					measurement: "deterministic-stage-aware-skill-context-audit",
					charsPerTokenEstimate: 4,
					providerUsage: "available via studio timing outcome.inputTokens",
					rows: rows.map((row) => ({
						skill: row.skillId,
						originalSourceChars: row.originalSourceChars,
						legacyChars: row.legacyGuidanceChars,
						legacyTokens: row.legacyTokens,
						stages: Object.fromEntries(
							row.stages.map((stage) => [
								stage.stage,
								{ chars: stage.contextChars, tokens: stage.estimatedTokens },
							]),
						),
					})),
				},
				null,
				0,
			),
		);
	});
});
