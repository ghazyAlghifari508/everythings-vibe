import { describe, expect, it } from "vitest";
import { buildSynthesisPayload } from "@/features/scrape/services/design-synthesis";
import { generateDesignMd } from "@/features/scrape/services/prompts-design-md";
import { visualEvidenceSchema } from "@/features/scrape/types/design-evidence-contract";
import { inspectorFromEvidence } from "@/features/scrape/utils/design-md-inspector";
import { validateDesignMd } from "@/features/scrape/utils/design-md-render";
import { FIXTURE } from "@/lib/design-fixture";

describe("design output scope", () => {
	it("reports a requested scheme that disagrees with measured canvas appearance", async () => {
		const result = await generateDesignMd({ ...FIXTURE, colorScheme: "dark" });
		expect(result.model.theme).toBe("light");
		expect(result.model.limitations.join(" ")).toMatch(
			/dark.*light canvas|dark.*light, so no dark/,
		);
	});
	it("uses additional views without losing their viewport and theme evidence", async () => {
		const result = await generateDesignMd({
			...FIXTURE,
			colorScheme: "light",
			additionalViews: [
				{
					...FIXTURE,
					viewport: { width: 390, height: 844 },
					colorScheme: "dark",
					elements: FIXTURE.elements.map((element) => ({
						...element,
						properties: {
							...element.properties,
							"background-color": "rgb(0, 0, 0)",
						},
					})),
				},
			],
		});
		expect(result.model.capturedViews).toEqual([
			{
				width: 1440,
				height: 900,
				colorScheme: "light",
				sourceUrl: FIXTURE.sourceUrl,
			},
			{
				width: 390,
				height: 844,
				colorScheme: "dark",
				sourceUrl: FIXTURE.sourceUrl,
			},
		]);
		expect(result.model.theme).toBe("unknown");
		expect(result.model.measurementProvenance.elements).toBe(20);
		expect(
			result.model.colors.some((color) =>
				color.selectors.some((selector) => selector.includes("390x844")),
			),
		).toBe(true);
		expect(validateDesignMd(result.document)).toEqual([]);
	});

	it("rejects evidence beyond four views and unknown capture settings", () => {
		expect(
			visualEvidenceSchema.safeParse({
				...FIXTURE,
				additionalViews: Array.from({ length: 4 }, () => FIXTURE),
			}).success,
		).toBe(false);
		expect(
			visualEvidenceSchema.safeParse({
				...FIXTURE,
				settings: { theme: "sepia" },
			}).success,
		).toBe(false);
	});
	it("omits component analysis for visual-token focus even without AI", async () => {
		const result = await generateDesignMd({
			...FIXTURE,
			settings: {
				viewport: "desktop",
				theme: "auto",
				depth: "standard",
				focus: "visual-tokens",
				codeReference: "css",
			},
		});
		expect(result.model.observedComponents).toEqual([]);
		expect(result.document).not.toMatch(/^## Components$/m);
		expect(result.document).toMatch(/^## CSS Custom Properties$/m);
		expect(result.document).not.toContain("@theme {");
		expect(validateDesignMd(result.document)).toEqual([]);
		expect(
			inspectorFromEvidence(
				{ ...FIXTURE, settings: result.model.settings },
				result.document,
			)?.components,
		).toEqual([]);
		expect(JSON.parse(buildSynthesisPayload(result.model))).toMatchObject({
			settings: { focus: "visual-tokens", codeReference: "css" },
		});
	});
	it("limits component focus to observed component context and emits only Tailwind when selected", async () => {
		const result = await generateDesignMd({
			...FIXTURE,
			settings: {
				viewport: "desktop",
				theme: "auto",
				depth: "detailed",
				focus: "components",
				codeReference: "tailwind-v4",
			},
		});
		expect(result.model.observedComponents.length).toBeGreaterThan(0);
		expect(result.document).toMatch(/^## Components$/m);
		expect(result.document).not.toMatch(/^## Tokens - Colors$/m);
		expect(result.document).not.toContain(":root {");
		expect(result.document).toContain("@theme {");
		expect(validateDesignMd(result.document)).toEqual([]);
		expect(
			inspectorFromEvidence(
				{ ...FIXTURE, settings: result.model.settings },
				result.document,
			)?.verification,
		).toBe("observed");
	});
});
