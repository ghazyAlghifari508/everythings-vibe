import { describe, expect, it } from "vitest";
import {
	designSynthesisSchema,
	validateSynthesis,
} from "@/features/scrape/services/design-synthesis";
import { buildFixtureModel } from "@/lib/design-fixture";

const model = buildFixtureModel();

function synthesis(overrides: Record<string, unknown> = {}) {
	return {
		essence: "A measured interface.",
		overview: "Hierarchy comes from a measured type scale.",
		theme: "light" as const,
		identityNarrative: "One action colour leads the page.",
		componentPatterns: [],
		layoutPrinciples: [],
		imageryNotes: [],
		implementationGuidance: [],
		dos: [],
		donts: [],
		limitations: [],
		...overrides,
	};
}

function issuesFor(overrides: Record<string, unknown>) {
	return validateSynthesis(
		designSynthesisSchema.parse(synthesis(overrides)),
		model,
	);
}

describe("synthesis claim validation", () => {
	it("rejects a rule that generalises the capture to every viewport", () => {
		const issues = issuesFor({
			dos: [
				{
					rule: "All buttons use 8px radius at every viewport, including hover.",
					references: [{ kind: "radius", index: 0 }],
				},
			],
		});
		expect(issues.some((issue) => issue.code === "unsupported-claim")).toBe(
			true,
		);
	});

	it("rejects a rule that binds a component class to an unmeasured value", () => {
		const issues = issuesFor({
			dos: [
				{
					rule: "Every button uses a 12px radius.",
					references: [{ kind: "radius", index: 0 }],
				},
			],
		});
		expect(issues.some((issue) => issue.code === "unsupported-claim")).toBe(
			true,
		);
	});

	it("accepts a rule that stays inside the measured scope", () => {
		const issues = issuesFor({
			dos: [
				{
					rule: "Use 8px radius for the measured action buttons in the captured viewport.",
					references: [{ kind: "radius", index: 0 }],
				},
			],
		});
		expect(issues).toEqual([]);
	});
});
