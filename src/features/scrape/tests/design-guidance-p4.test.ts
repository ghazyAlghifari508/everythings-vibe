import { describe, expect, it } from "vitest";
import { deriveModelGuidelines } from "../services/design-model-guidance";
import type {
	VisualElementEvidence,
	VisualEvidence,
} from "../services/design-visual-evidence";
import { normalizeRadii } from "../utils/design-normalize-radius";
import { groupTypeSpecimens } from "../utils/design-normalize-typography";

function entry(
	role: string,
	properties: Record<string, string>,
	selector = role,
): VisualElementEvidence {
	return { selector, role, text: "Sample", width: 120, height: 40, properties };
}

function evidence(elements: VisualElementEvidence[]): VisualEvidence {
	return {
		version: 1,
		sourceUrl: "https://example.test",
		capturedAt: "2026-01-01T00:00:00Z",
		viewport: { width: 1200, height: 800 },
		elements,
		fonts: [],
		limitations: [],
	};
}

describe("guidance evidence boundaries", () => {
	it("does not impose a single radius for component classes with variants", () => {
		const elements = [
			entry("cta", { "border-radius": "4px" }),
			entry("cta", { "border-radius": "8px" }),
			entry("cta", { "border-radius": "16px" }),
		];
		const result = deriveModelGuidelines(
			evidence(elements),
			[],
			[],
			[],
			normalizeRadii(elements),
		);
		expect(result.donts).toEqual([]);
	});

	it("does not infer a global hierarchy from classified specimens", () => {
		const elements = [
			entry("h1", { "font-family": "Example", "font-size": "48px" }),
			entry("p", { "font-family": "Example", "font-size": "16px" }),
		];
		const result = deriveModelGuidelines(
			evidence(elements),
			[],
			groupTypeSpecimens(elements),
			[],
			[],
		);
		expect(result.dos).toEqual([]);
	});

	it("aggregates equivalent CTA limitations while retaining each scope", () => {
		const elements = [1, 2].flatMap((capture) =>
			["4px", "8px"].map((value) =>
				entry(
					"cta",
					{ "border-radius": value },
					`[capture ${capture}: 1200x800, auto] cta`,
				),
			),
		);
		const result = deriveModelGuidelines(
			evidence(elements),
			[],
			[],
			[],
			normalizeRadii(elements),
		);
		expect(result.limitations).toHaveLength(1);
		expect(result.limitations[0]).toContain("capture 1");
		expect(result.limitations[0]).toContain("capture 2");
	});
});
