import { expect, it } from "vitest";
import { extractionFromVisualEvidence } from "./design-visual-evidence";

it("does not infer font or typography values from absent computed properties", () => {
	const result = extractionFromVisualEvidence({
		version: 1,
		sourceUrl: "https://example.test/",
		capturedAt: new Date().toISOString(),
		viewport: { width: 1440, height: 900 },
		elements: [
			{
				selector: "body > h1",
				role: "h1",
				text: "Sample",
				width: 120,
				height: 60,
				properties: {},
			},
		],
		fonts: [],
		limitations: [],
	});
	expect(result.colors).toEqual([]);
	expect(result.typography).toEqual([]);
	expect(result.typographyRoles).toEqual([]);
	expect(result.ctaButtons).toEqual([]);
});
