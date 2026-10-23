import { describe, expect, it } from "vitest";
import { buildDesignModel } from "@/features/scrape/services/design-model";
import { renderDesignMd } from "@/features/scrape/utils/design-md-render";
import type { VisualElementEvidence } from "../services/design-visual-evidence";

function bodyText(
	selector: string,
	color: string,
	variables: Record<string, string> = {},
): VisualElementEvidence {
	return {
		selector,
		role: "body",
		text: "Sample",
		width: 400,
		height: 24,
		properties: {
			color,
			"font-family": "Inter, sans-serif",
			"font-size": "16px",
			"font-weight": "400",
			"line-height": "24px",
			"letter-spacing": "normal",
		},
		variables,
	};
}

function quickReference(model: ReturnType<typeof buildDesignModel>): string {
	return (
		renderDesignMd(model)
			.split("**Quick reference**")[1]
			?.split("Use the observed")[0] ?? ""
	);
}

describe("quick reference action colour", () => {
	it("does not present a brand-named text colour as the primary action", () => {
		const elements = [
			bodyText("body:nth-child(1) > p:nth-child(2)", "rgb(34, 68, 136)", {
				"--brand": "rgb(34, 68, 136)",
			}),
			bodyText("body:nth-child(1) > p:nth-child(3)", "rgb(34, 68, 136)", {
				"--brand": "rgb(34, 68, 136)",
			}),
		];
		const model = buildDesignModel({
			version: 1,
			sourceUrl: "https://example.test",
			capturedAt: "2026-01-01T00:00:00Z",
			viewport: { width: 1200, height: 800 },
			elements,
			fonts: [],
			limitations: [],
		});
		expect(quickReference(model)).toContain("- primary action: not measured");
	});

	it("reports the measured action fill as the primary action", () => {
		const elements = [
			{
				selector: "body:nth-child(1) > button:nth-child(2)",
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
					"border-radius": "8px",
				},
				variables: { "--color-primary": "rgb(21, 94, 239)" },
			},
			{
				selector: "body:nth-child(1) > button:nth-child(3)",
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
					"border-radius": "8px",
				},
			},
		];
		const model = buildDesignModel({
			version: 1,
			sourceUrl: "https://example.test",
			capturedAt: "2026-01-01T00:00:00Z",
			viewport: { width: 1200, height: 800 },
			elements,
			fonts: [],
			limitations: [],
		});
		expect(quickReference(model)).toContain("- primary action: `#155eef`");
	});
});
