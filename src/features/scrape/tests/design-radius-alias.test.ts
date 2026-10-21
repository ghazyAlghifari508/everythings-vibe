import { describe, expect, it } from "vitest";
import { buildDesignModel } from "@/features/scrape/services/design-model";
import { buildTokenDeclarations } from "@/features/scrape/utils/design-md-css";
import { renderDesignMd } from "@/features/scrape/utils/design-md-render";
import type { VisualElementEvidence } from "../services/design-visual-evidence";

function button(selector: string, radius: string): VisualElementEvidence {
	return {
		selector,
		role: "cta",
		text: "Start",
		width: 160,
		height: 48,
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

function modelFor(radius: string) {
	return buildDesignModel({
		version: 1,
		sourceUrl: "https://example.test",
		capturedAt: "2026-01-01T00:00:00Z",
		viewport: { width: 1200, height: 800 },
		elements: [
			button("body:nth-child(1) > button:nth-child(2)", radius),
			button("body:nth-child(1) > button:nth-child(3)", radius),
		],
		fonts: [],
		limitations: [],
	});
}

describe("radius CSS aliases", () => {
	it("emits an alias for a measured radius shorthand", () => {
		const model = modelFor("4px 12px");
		const declarations = buildTokenDeclarations(model);
		expect(declarations.radius.some((line) => line.includes("4px 12px"))).toBe(
			true,
		);
		expect(renderDesignMd(model)).toMatch(/--radius-[a-z0-9-]+:\s*4px 12px/);
	});

	it("emits an alias for a measured radius with a slash syntax", () => {
		const model = modelFor("10px / 20px");
		const declarations = buildTokenDeclarations(model);
		expect(
			declarations.radius.some((line) => line.includes("10px / 20px")),
		).toBe(true);
	});

	it("does not turn a shorthand into a scalar radius claim", () => {
		const model = modelFor("4px 12px");
		expect(model.radii[0]?.valuePx).toBeNaN();
		expect(model.radii[0]?.pill).toBe(false);
	});
});
