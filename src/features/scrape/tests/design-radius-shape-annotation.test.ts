import { describe, expect, it } from "vitest";
import { buildDesignModel } from "@/features/scrape/services/design-model";
import { renderDesignMd } from "@/features/scrape/utils/design-md-render";
import type { VisualElementEvidence } from "../services/design-visual-evidence";

function wideButton(
	selector: string,
	radius: string,
	size = 600,
): VisualElementEvidence {
	return {
		selector,
		role: "cta",
		text: "Start",
		width: size,
		height: size,
		properties: {
			"background-color": "rgb(21, 94, 239)",
			color: "rgb(255, 255, 255)",
			"font-family": "Inter, sans-serif",
			"font-size": "15px",
			"font-weight": "600",
			"line-height": "20px",
			"letter-spacing": "normal",
			padding: "14px",
			"border-radius": radius,
		},
	};
}

function modelFor(elements: VisualElementEvidence[]) {
	return buildDesignModel({
		version: 1,
		sourceUrl: "https://example.test",
		capturedAt: "2026-01-01T00:00:00Z",
		viewport: { width: 1200, height: 800 },
		elements,
		fonts: [],
		limitations: [],
	});
}

describe("radius shape annotation", () => {
	it("does not label a large radius on a large element as a pill", () => {
		const model = modelFor([
			wideButton("body:nth-child(1) > button:nth-child(2)", "120px"),
			wideButton("body:nth-child(1) > button:nth-child(3)", "120px"),
		]);
		expect(model.radii[0]?.pill).toBe(false);
		const markdown = renderDesignMd(model);
		expect(markdown).not.toMatch(/fully rounded \/ pill/);
		expect(markdown).toContain("120px");
	});

	it("labels a geometry-proven pill as a pill", () => {
		const model = modelFor([
			wideButton("body:nth-child(1) > button:nth-child(2)", "9999px", 48),
			wideButton("body:nth-child(1) > button:nth-child(3)", "9999px", 48),
		]);
		expect(model.radii[0]?.pill).toBe(true);
		expect(renderDesignMd(model)).toMatch(/fully rounded \/ pill/);
	});
});
