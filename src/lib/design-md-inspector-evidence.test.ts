import { describe, expect, it } from "vitest";
import { inspectorFromEvidence } from "./design-md-inspector";
import type { VisualEvidence } from "./design-visual-evidence";

function ctaEvidence(): VisualEvidence {
	const element = (selector: string) => ({
		selector,
		role: "cta",
		text: "Action",
		width: 120,
		height: 44,
		properties: {
			"background-color": "rgb(10, 20, 30)",
			"border-radius": "8px",
			padding: "0px",
			margin: "0px",
			"font-family": "Example, serif",
			"font-size": "16px",
			"font-weight": "500",
		},
	});
	return {
		version: 1,
		sourceUrl: "https://example.test/",
		capturedAt: new Date().toISOString(),
		viewport: { width: 1440, height: 900 },
		elements: [element("button:nth-child(1)"), element("button:nth-child(2)")],
		fonts: [],
		limitations: [],
	};
}

describe("inspectorFromEvidence curation", () => {
	it("deduplicates identical spacing measurements and keeps the count", () => {
		const model = inspectorFromEvidence(ctaEvidence());
		const paddingRows = model?.spacing.filter((token) =>
			token.label.startsWith("padding"),
		);
		expect(paddingRows).toHaveLength(1);
		expect(paddingRows?.[0]?.label).toContain("2 elemen");
		expect(paddingRows?.[0]?.value).toBe("0px");
	});

	it("deduplicates identical radius measurements", () => {
		const model = inspectorFromEvidence(ctaEvidence());
		expect(model?.radii).toHaveLength(1);
		expect(model?.radii[0]?.value).toBe("8px");
		expect(model?.radii[0]?.label).toContain("2 elemen");
	});

	it("surfaces evidence-based Do and Don't guidance", () => {
		const model = inspectorFromEvidence(ctaEvidence());
		expect(model?.dos.length).toBeGreaterThan(0);
		expect(model?.dos.some((rule) => rule.includes("border-radius 8px"))).toBe(
			true,
		);
	});

	it("leaves guidance empty when evidence has no repeated pattern", () => {
		const single = ctaEvidence();
		const model = inspectorFromEvidence({
			...single,
			elements: single.elements.slice(0, 1),
		});
		expect(model?.dos).toEqual([]);
		expect(model?.donts).toEqual([]);
	});
});
