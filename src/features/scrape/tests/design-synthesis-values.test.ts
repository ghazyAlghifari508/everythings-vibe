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

describe("synthesis value validation", () => {
	it("rejects an unmeasured functional colour", () => {
		const issues = issuesFor({
			overview: "The measured surface uses rgba(17, 23, 41, 1).",
		});
		expect(issues.some((issue) => issue.code === "unknown-value")).toBe(true);
	});

	it("accepts a measured functional colour", () => {
		const issues = issuesFor({
			overview: "The measured surface uses rgb(255, 255, 255).",
		});
		expect(issues).toEqual([]);
	});

	it("rejects an unmeasured font family named in prose", () => {
		const issues = issuesFor({
			implementationGuidance: ["Set headings in Playfair Display."],
		});
		expect(issues.some((issue) => issue.code === "unknown-value")).toBe(true);
	});

	it("accepts a measured font family named in prose", () => {
		const issues = issuesFor({
			implementationGuidance: ["Set headings in Inter."],
		});
		expect(issues).toEqual([]);
	});

	it("rejects a percentage that was never measured", () => {
		const issues = issuesFor({
			implementationGuidance: ["Set the radius to 93%."],
		});
		expect(issues.some((issue) => issue.code === "unknown-value")).toBe(true);
	});
});
