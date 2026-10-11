import { describe, expect, it } from "vitest";
import { parseDesignMd } from "./design-md-inspector";
import { renderEvidenceDesignMd } from "./design-visual-evidence";

describe("canonical DESIGN.md round-trip", () => {
	function canonicalDocument(): string {
		const cta = (selector: string) => ({
			selector,
			role: "cta",
			text: "Action",
			width: 120,
			height: 44,
			properties: {
				"background-color": "rgb(10, 20, 30)",
				"border-radius": "8px",
				"font-family": "Example, serif",
				"font-size": "16px",
				"font-weight": "500",
				padding: "0px",
			},
		});
		return renderEvidenceDesignMd({
			version: 1,
			sourceUrl: "https://example.test/",
			capturedAt: new Date().toISOString(),
			viewport: { width: 1440, height: 900 },
			elements: [
				cta("button:nth-child(1)"),
				cta("button:nth-child(2)"),
				{
					...cta("button:nth-child(3)"),
					properties: {
						"background-color": "rgb(200, 10, 10)",
						"border-radius": "4px",
						"font-family": "Example, serif",
						"font-size": "16px",
						"font-weight": "500",
						padding: "0px",
					},
				},
			],
			fonts: [],
			limitations: [],
		});
	}

	it("routes border-radius rows into the radius bucket", () => {
		const model = parseDesignMd(canonicalDocument());
		expect(model.radii.length).toBeGreaterThan(0);
		expect(model.radii.some((token) => token.value === "8px")).toBe(true);
		expect(
			model.spacing.some((token) => token.label.includes("border-radius")),
		).toBe(false);
	});

	it("keeps spacing rows in the spacing bucket", () => {
		const model = parseDesignMd(canonicalDocument());
		expect(model.spacing.some((token) => token.value === "0px")).toBe(true);
	});

	it("classifies Don't bullets as donts before stripping the label", () => {
		const model = parseDesignMd(canonicalDocument());
		expect(model.donts.length).toBeGreaterThan(0);
		expect(model.dos.every((rule) => !/^Don't:/.test(rule))).toBe(true);
	});

	it("drops the redundant Do and Don't label from displayed rules", () => {
		const model = parseDesignMd(canonicalDocument());
		expect(model.dos.every((rule) => !rule.startsWith("Do:"))).toBe(true);
		expect(model.donts.every((rule) => !rule.startsWith("Don't:"))).toBe(true);
	});

	it("keeps legacy verbatim bullets unchanged", () => {
		const legacy = [
			"# Acme - Style Reference",
			"",
			"## Do's and Don'ts",
			"- Do use observed colors for surfaces.",
			"- Don't copy the source brand name or logo.",
			"",
		].join("\n");
		const model = parseDesignMd(legacy);
		expect(model.dos).toEqual(["Do use observed colors for surfaces."]);
		expect(model.donts).toEqual(["Don't copy the source brand name or logo."]);
	});
});
