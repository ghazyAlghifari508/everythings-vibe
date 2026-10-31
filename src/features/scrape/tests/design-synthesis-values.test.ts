import { describe, expect, it } from "vitest";
import {
	designSynthesisSchema,
	parseSynthesisResponse,
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

	it.each([
		"The font size follows the measured scale.",
		"Use font family: Inter for headings.",
		"Use the font Inter for body text.",
	])("accepts measured font references and ordinary typography prose: %s", (overview) => {
		expect(issuesFor({ overview })).toEqual([]);
	});

	it("rejects an unmeasured explicit font family followed by prose", () => {
		const issues = issuesFor({
			overview: "Use font family: Garamond for headings.",
		});
		expect(issues.some((issue) => issue.code === "unknown-value")).toBe(true);
	});

	it("does not ignore an unmeasured family after a measured family", () => {
		const issues = issuesFor({ overview: "Use font Inter and Garamond." });
		expect(issues.some((issue) => issue.code === "unknown-value")).toBe(true);
	});

	it("reports an unmeasured value as its own cause and rejects synthesis", () => {
		const outcome = parseSynthesisResponse(
			JSON.stringify(synthesis({ overview: "Use font family: Garamond." })),
			model,
			(text) => text,
		);
		expect(outcome.status).toBe("unavailable");
		expect(outcome.synthesis).toBeNull();
		expect(outcome.cause).toBe("unknown_value");
	});

	it("rejects a percentage that was never measured", () => {
		const issues = issuesFor({
			implementationGuidance: ["Set the radius to 93%."],
		});
		expect(issues.some((issue) => issue.code === "unknown-value")).toBe(true);
	});
});
