import { describe, expect, it } from "vitest";
import { buildDesignModel } from "@/features/scrape/services/design-model";
import { validateSynthesis } from "@/features/scrape/services/design-synthesis";
import { groupTypeSpecimens } from "@/features/scrape/utils/design-normalize-typography";
import { FIXTURE } from "@/lib/design-fixture";
import type { VisualElementEvidence } from "../services/design-visual-evidence";

function specimen(
	selector: string,
	family: string,
	size: string,
	role = "body",
): VisualElementEvidence {
	return {
		selector,
		role,
		text: "Sample",
		width: 200,
		height: 24,
		properties: {
			"font-family": `${family}, sans-serif`,
			"font-size": size,
			"font-weight": "400",
			"line-height": "24px",
			"letter-spacing": "normal",
		},
	};
}

describe("typeface inventory and font restrictions", () => {
	it("keeps an alternate measured family inside the allowed font set", () => {
		const elements = [
			...FIXTURE.elements,
			specimen("aside p", "Example Serif", "17px"),
		];
		const model = buildDesignModel({ ...FIXTURE, elements });
		expect(
			model.typefaces.some((typeface) => typeface.family === "Example Serif"),
		).toBe(true);
		const restriction = model.guidelines.donts.find((rule) =>
			rule.rule.includes("font family outside the measured set"),
		);
		expect(restriction?.rule).toContain("Example Serif");
	});

	it("accepts a measured size that only the typeface inventory knows", () => {
		const elements = [
			...FIXTURE.elements,
			specimen("aside p", "Example Serif", "17px"),
		];
		const model = buildDesignModel({ ...FIXTURE, elements });
		const issues = validateSynthesis(
			{
				essence: "A measured interface.",
				overview: "An alternate body family was measured.",
				theme: "light",
				identityNarrative: "One family leads.",
				componentPatterns: [],
				layoutPrinciples: [],
				imageryNotes: [],
				implementationGuidance: ["Example Serif is measured at 17px."],
				dos: [],
				donts: [],
				limitations: [],
			},
			model,
		);
		expect(issues).toEqual([]);
	});

	it("keeps the font restriction aligned with the full specimen inventory", () => {
		const elements = [
			...FIXTURE.elements,
			specimen("aside p", "Example Serif", "17px"),
		];
		const model = buildDesignModel({ ...FIXTURE, elements });
		const measuredFamilies = new Set(
			groupTypeSpecimens(elements, true).map((entry) =>
				entry.fontFamily.split(",")[0]?.trim(),
			),
		);
		const restriction = model.guidelines.donts.find((rule) =>
			rule.rule.includes("font family outside the measured set"),
		);
		expect(restriction).toBeDefined();
		for (const family of measuredFamilies) {
			if (!family) continue;
			expect(restriction?.rule).toContain(family);
		}
	});
});
