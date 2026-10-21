import { describe, expect, it } from "vitest";
import { buildDesignModel } from "@/features/scrape/services/design-model";
import { renderDesignMd } from "@/features/scrape/utils/design-md-render";
import type { VisualElementEvidence } from "../services/design-visual-evidence";

function container(selector: string, role: string): VisualElementEvidence {
	return {
		selector,
		role,
		text: "Sample",
		width: 1200,
		height: 400,
		properties: {
			"background-color": "rgb(248, 250, 252)",
			"font-family": "Inter, sans-serif",
			"font-size": "16px",
			"font-weight": "400",
			"line-height": "24px",
			"letter-spacing": "normal",
			padding: "48px",
			"border-radius": "24px",
		},
	};
}

describe("observed component identity", () => {
	it("gives distinct names to distinct container roles", () => {
		const model = buildDesignModel({
			version: 1,
			sourceUrl: "https://example.test",
			capturedAt: "2026-01-01T00:00:00Z",
			viewport: { width: 1200, height: 800 },
			elements: [
				container("body:nth-child(1) > section:nth-child(2)", "section"),
				container("body:nth-child(1) > section:nth-child(3)", "section"),
				container("body:nth-child(1) > main:nth-child(4)", "main"),
				container("body:nth-child(1) > main:nth-child(5)", "main"),
			],
			fonts: [],
			limitations: [],
		});
		const names = model.observedComponents.map((component) => component.name);
		expect(new Set(names).size).toBe(names.length);
	});

	it("does not repeat a component heading in the document", () => {
		const model = buildDesignModel({
			version: 1,
			sourceUrl: "https://example.test",
			capturedAt: "2026-01-01T00:00:00Z",
			viewport: { width: 1200, height: 800 },
			elements: [
				container("body:nth-child(1) > section:nth-child(2)", "section"),
				container("body:nth-child(1) > section:nth-child(3)", "section"),
				container("body:nth-child(1) > main:nth-child(4)", "main"),
				container("body:nth-child(1) > main:nth-child(5)", "main"),
			],
			fonts: [],
			limitations: [],
		});
		const headings = [...renderDesignMd(model).matchAll(/^### (.+)$/gm)].map(
			(match) => match[1]?.trim(),
		);
		expect(new Set(headings).size).toBe(headings.length);
	});
});
