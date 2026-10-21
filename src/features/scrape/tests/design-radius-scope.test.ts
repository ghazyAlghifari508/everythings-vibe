import { describe, expect, it } from "vitest";
import { buildDesignModel } from "@/features/scrape/services/design-model";
import { buildTokenDeclarations } from "@/features/scrape/utils/design-md-css";
import { renderDesignMd } from "@/features/scrape/utils/design-md-render";
import type {
	VisualElementEvidence,
	VisualEvidence,
} from "../services/design-visual-evidence";

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

function view(
	elements: VisualElementEvidence[],
	width: number,
): VisualEvidence {
	return {
		version: 1,
		sourceUrl: "https://example.test",
		capturedAt: "2026-01-01T00:00:00Z",
		viewport: { width, height: 800 },
		elements,
		fonts: [],
		limitations: [],
	};
}

describe("radius capture scope", () => {
	it("keeps the capture scope on each radius entry", () => {
		const desktop = view(
			[
				button("body:nth-child(1) > button:nth-child(2)", "8px"),
				button("body:nth-child(1) > button:nth-child(3)", "8px"),
			],
			1440,
		);
		const mobile = view(
			[
				button("body:nth-child(1) > button:nth-child(2)", "16px"),
				button("body:nth-child(1) > button:nth-child(3)", "16px"),
			],
			390,
		);
		const model = buildDesignModel({
			...desktop,
			additionalViews: [mobile],
		});
		const scopes = model.radii.map((token) => token.scope);
		expect(scopes.some((scope) => scope.includes("1440"))).toBe(true);
		expect(scopes.some((scope) => scope.includes("390"))).toBe(true);
	});

	it("does not merge two captures into one indistinguishable radius token", () => {
		const desktop = view(
			[
				button("body:nth-child(1) > button:nth-child(2)", "8px"),
				button("body:nth-child(1) > button:nth-child(3)", "8px"),
			],
			1440,
		);
		const mobile = view(
			[
				button("body:nth-child(1) > button:nth-child(2)", "16px"),
				button("body:nth-child(1) > button:nth-child(3)", "16px"),
			],
			390,
		);
		const model = buildDesignModel({
			...desktop,
			additionalViews: [mobile],
		});
		const desktopToken = model.radii.find((token) => token.value === "8px");
		const mobileToken = model.radii.find((token) => token.value === "16px");
		expect(desktopToken?.scope).not.toBe(mobileToken?.scope);
	});

	it("exposes the scope in the document and in the generated aliases", () => {
		const desktop = view(
			[
				button("body:nth-child(1) > button:nth-child(2)", "8px"),
				button("body:nth-child(1) > button:nth-child(3)", "8px"),
			],
			1440,
		);
		const mobile = view(
			[
				button("body:nth-child(1) > button:nth-child(2)", "16px"),
				button("body:nth-child(1) > button:nth-child(3)", "16px"),
			],
			390,
		);
		const model = buildDesignModel({
			...desktop,
			additionalViews: [mobile],
		});
		const markdown = renderDesignMd(model);
		expect(markdown).toMatch(/1440/);
		expect(markdown).toMatch(/390/);
		const declarations = buildTokenDeclarations(model);
		expect(declarations.radius.length).toBeGreaterThan(0);
	});
});
