import { describe, expect, it } from "vitest";
import { inspectorFromEvidence } from "./design-md-inspector";
import type { VisualEvidence } from "./design-visual-evidence";

function ctaEvidence(): VisualEvidence {
	const element = (selector: string) => ({
		selector,
		role: "cta",
		text: "Start free",
		width: 120,
		height: 44,
		properties: {
			"background-color": "rgb(10, 20, 30)",
			"border-radius": "8px",
			padding: "12px",
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
	it("curates a repeated radius into one token named by its context", () => {
		const model = inspectorFromEvidence(ctaEvidence());
		expect(model?.radii).toHaveLength(1);
		expect(model?.radii[0]?.value).toBe("8px");
		// The token is named by what it was measured on, not by the raw property.
		expect(model?.radii[0]?.label).toBe("Buttons");
		expect(model?.radii[0]?.frequency).toBe(2);
	});

	it("curates repeated padding into a purpose-named spacing token", () => {
		const model = inspectorFromEvidence(ctaEvidence());
		const padding = model?.spacing.filter((token) => token.value === "12px");
		expect(padding).toHaveLength(1);
		expect(padding?.[0]?.label).toBe("Action padding");
		expect(padding?.[0]?.frequency).toBe(2);
	});

	it("never exposes a raw property dump as a spacing row", () => {
		const model = inspectorFromEvidence(ctaEvidence());
		for (const token of model?.spacing ?? [])
			expect(token.label).not.toMatch(/^padding · \d+ elemen$/);
	});

	it("curates a repeated action fill into a primary action colour", () => {
		const model = inspectorFromEvidence(ctaEvidence());
		const brand = model?.colors.find((color) => color.roleClass === "brand");
		// The value is the canonical equivalent of the measured rgb() triple.
		expect(brand?.value).toBe("#0a141e");
		expect(brand?.rationale).toMatch(/action/i);
	});

	it("surfaces evidence-based Do guidance tied to a measured value", () => {
		const model = inspectorFromEvidence(ctaEvidence());
		expect(model?.dos.length).toBeGreaterThan(0);
		expect(model?.dos.some((rule) => rule.rule.includes("8px"))).toBe(true);
		expect(model?.dos.every((rule) => rule.evidence.length > 0)).toBe(true);
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

	it("marks the model as observed so the UI can state its source honestly", () => {
		expect(inspectorFromEvidence(ctaEvidence())?.verification).toBe("observed");
	});

	it("refuses evidence that does not match the document it is paired with", () => {
		const model = inspectorFromEvidence(
			ctaEvidence(),
			"# Something else - Style Reference\n\nUnrelated text with no measured value.",
		);
		expect(model).toBeNull();
	});
});
