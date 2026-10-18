import { describe, expect, it } from "vitest";
import type { VisualElementEvidence } from "@/features/scrape/services/design-visual-evidence";
import {
	classifyRadiusToken,
	inferSpacingBaseUnit,
	normalizeElevation,
	normalizeRadii,
	normalizeSpacing,
	normalizeSurfaces,
} from "@/features/scrape/utils/design-normalize-shape";

function element(
	properties: Record<string, string>,
	overrides: Partial<VisualElementEvidence> = {},
): VisualElementEvidence {
	return {
		selector: "body:nth-child(1) > div:nth-child(1)",
		role: "element",
		text: "",
		width: 100,
		height: 40,
		properties,
		...overrides,
	};
}

describe("spacing scale inference", () => {
	it("finds the step that explains the measured rhythm", () => {
		const elements = [
			...Array.from({ length: 6 }, () =>
				element({ padding: "16px", gap: "8px" }),
			),
			element({ gap: "24px" }),
			element({ gap: "24px" }),
		];
		expect(inferSpacingBaseUnit(elements)).toBe(8);
	});

	it("never reports 2px, which would trivially fit any even measurement", () => {
		const elements = Array.from({ length: 8 }, () =>
			element({ padding: "14px", gap: "10px" }),
		);
		expect(inferSpacingBaseUnit(elements)).not.toBe(2);
	});

	it("reports no unit when the measurements share no grid", () => {
		const elements = [
			element({ padding: "7px" }),
			element({ padding: "11px" }),
			element({ padding: "13px" }),
			element({ padding: "17px" }),
		];
		expect(inferSpacingBaseUnit(elements)).toBeNaN();
	});

	it("reports no unit when nothing repeated", () => {
		expect(inferSpacingBaseUnit([element({ padding: "0px" })])).toBeNaN();
	});
});

describe("spacing classification", () => {
	it("names navigation spacing from the element it was measured on", () => {
		const { tokens } = normalizeSpacing([
			element({ padding: "20px" }, { role: "nav" }),
			element({ padding: "20px" }, { role: "nav" }),
		]);
		expect(tokens[0]?.purpose).toBe("Navigation spacing");
	});

	it("names a repeated gap as an element gap", () => {
		const { tokens } = normalizeSpacing([
			element({ gap: "24px" }),
			element({ gap: "24px" }),
			element({ gap: "24px" }),
		]);
		expect(tokens[0]?.purpose).toBe("Element gap");
	});

	it("names a container max-width explicitly", () => {
		const { tokens } = normalizeSpacing([
			element({ "max-width": "1200px" }, { role: "main" }),
			element({ "max-width": "1200px" }, { role: "main" }),
		]);
		expect(tokens[0]?.purpose).toBe("Container max-width");
	});

	it("names card padding on a section surface", () => {
		const { tokens } = normalizeSpacing([
			element({ padding: "32px" }, { role: "section" }),
			element({ padding: "32px" }, { role: "section" }),
		]);
		expect(tokens[0]?.purpose).toBe("Card padding");
	});

	it("flags values that sit on the repeated scale", () => {
		const elements = [
			...Array.from({ length: 6 }, () =>
				element({ padding: "16px", gap: "16px" }),
			),
			element({ gap: "24px" }),
			element({ gap: "24px" }),
		];
		const { tokens, baseUnit } = normalizeSpacing(elements);
		const twentyFour = tokens.find((token) => token.value === "24px");
		expect(twentyFour?.onScale).toBe(Number.isFinite(baseUnit));
	});

	it("drops a single generic measurement that proves nothing", () => {
		const { tokens } = normalizeSpacing([element({ padding: "7px" })]);
		expect(tokens).toEqual([]);
	});

	it("collapses a uniform shorthand into its single canonical value", () => {
		const { tokens } = normalizeSpacing([
			element({ padding: "16px" }, { role: "section" }),
			element({ padding: "16px 16px 16px 16px" }, { role: "section" }),
		]);
		const canonical = tokens.filter((token) => token.value === "16px");
		expect(canonical).toHaveLength(1);
		expect(canonical[0]?.frequency).toBe(2);
	});

	it("keeps the raw value of a mixed shorthand instead of inventing one", () => {
		const { tokens } = normalizeSpacing([
			element({ padding: "14px 20px" }, { role: "section" }),
			element({ padding: "14px 20px" }, { role: "section" }),
		]);
		expect(tokens.some((token) => token.value === "14px 20px")).toBe(true);
	});

	it("drops a zero reset without component meaning", () => {
		const { tokens } = normalizeSpacing([
			element({ padding: "0px" }, { role: "nav" }),
			element({ padding: "0px" }, { role: "nav" }),
		]);
		expect(tokens).toEqual([]);
	});

	it("keeps a zero only when an action component was measured square", () => {
		const { tokens } = normalizeSpacing([
			element({ padding: "0px" }, { role: "cta" }),
			element({ padding: "0px" }, { role: "cta" }),
		]);
		expect(tokens).toHaveLength(1);
		expect(tokens[0]?.purpose).toBe("Action padding");
	});

	it("keeps every token tied to a real measured frequency", () => {
		const { tokens } = normalizeSpacing([
			element({ padding: "16px" }, { role: "section" }),
			element({ padding: "16px" }, { role: "section" }),
			element({ gap: "12px" }, { role: "nav" }),
			element({ gap: "12px" }, { role: "nav" }),
		]);
		for (const token of tokens)
			expect(token.frequency).toBeGreaterThanOrEqual(2);
	});
});

describe("radius classification", () => {
	it("names a button radius from the action elements that used it", () => {
		const elements = [
			element({ "border-radius": "8px" }, { role: "cta" }),
			element({ "border-radius": "8px" }, { role: "cta" }),
		];
		const tokens = normalizeRadii(elements);
		expect(tokens[0]?.purpose).toBe("Buttons");
	});

	it("does not promote a zero radius from plain containers into a token", () => {
		const elements = Array.from({ length: 243 }, () =>
			element({ "border-radius": "0px" }),
		);
		const tokens = normalizeRadii(elements);
		// A generic element with no rounding is not a radius decision.
		expect(
			tokens.filter((token) => token.purpose === "Measured radius"),
		).toEqual([]);
	});

	it("keeps a large section radius distinguishable from a card radius", () => {
		const elements = [
			element({ "border-radius": "24px" }, { role: "section" }),
			element({ "border-radius": "24px" }, { role: "section" }),
		];
		const tokens = normalizeRadii(elements);
		expect(tokens[0]?.purpose).toBe("Large cards");
	});

	it("names an input radius from a measured input element", () => {
		const tokens = normalizeRadii([
			element({ "border-radius": "6px" }, { role: "input" }),
			element({ "border-radius": "6px" }, { role: "input" }),
		]);
		expect(tokens[0]?.purpose).toBe("Measured radius");
	});

	it("reports the measurement frequency behind each radius", () => {
		const tokens = normalizeRadii([
			element({ "border-radius": "9999px" }, { role: "cta" }),
			element({ "border-radius": "9999px" }, { role: "cta" }),
			element({ "border-radius": "9999px" }, { role: "cta" }),
		]);
		expect(tokens[0]?.frequency).toBe(3);
	});

	it("marks a radius that rounds the full height as a pill from element geometry", () => {
		const tokens = normalizeRadii([
			element(
				{ "border-radius": "9999px" },
				{ role: "cta", width: 160, height: 48 },
			),
			element(
				{ "border-radius": "9999px" },
				{ role: "cta", width: 160, height: 48 },
			),
		]);
		expect(tokens[0]?.purpose).toBe("Buttons");
		expect(tokens[0]?.pill).toBe(true);
		expect(tokens[0]?.value).toBe("9999px");
	});

	it("keeps a large non-pill section radius distinct from a pill", () => {
		const tokens = normalizeRadii([
			element(
				{ "border-radius": "24px" },
				{ role: "section", width: 1200, height: 400 },
			),
			element(
				{ "border-radius": "24px" },
				{ role: "section", width: 1200, height: 400 },
			),
		]);
		expect(tokens[0]?.purpose).toBe("Large cards");
		expect(tokens[0]?.pill).toBe(false);
	});

	it("classifies by measured context, not by value magnitude alone", () => {
		const token = classifyRadiusToken(
			{
				property: "border-radius",
				value: "12px",
				frequency: 2,
				selectors: ["a"],
				roles: ["cta"],
			},
			[element({ "border-radius": "12px" }, { role: "cta" })],
		);
		expect(token.purpose).toBe("Buttons");
		expect(token.contextual).toBe(true);
	});
});

describe("elevation normalization", () => {
	it("keeps the measured shadow string and its real frequency", () => {
		const shadow = "rgba(0, 0, 0, 0.08) 0px 1px 2px 0px";
		const tokens = normalizeElevation([
			element({ "box-shadow": shadow }, { role: "cta" }),
			element({ "box-shadow": shadow }, { role: "cta" }),
		]);
		expect(tokens[0]?.value).toBe(shadow);
		expect(tokens[0]?.frequency).toBe(2);
		expect(tokens[0]?.usageNote).toMatch(/repeated/i);
	});

	it("marks a single shadow as not yet a system elevation", () => {
		const tokens = normalizeElevation([
			element({ "box-shadow": "0 8px 24px rgba(0,0,0,0.2)" }),
		]);
		expect(tokens[0]?.usageNote).toMatch(/measured once/i);
	});

	it("drops the none value instead of inventing a preset", () => {
		expect(normalizeElevation([element({ "box-shadow": "none" })])).toEqual([]);
	});
});

describe("surface stack", () => {
	it("orders repeated page-level backgrounds as a stack", () => {
		const surfaces = normalizeSurfaces([
			element({ "background-color": "rgb(255, 255, 255)" }, { role: "canvas" }),
			element({ "background-color": "rgb(255, 255, 255)" }, { role: "body" }),
			element(
				{ "background-color": "rgb(248, 248, 248)" },
				{ role: "section" },
			),
			element(
				{ "background-color": "rgb(248, 248, 248)" },
				{ role: "section" },
			),
		]);
		expect(surfaces).toHaveLength(2);
		expect(surfaces[0]?.frequency).toBeGreaterThanOrEqual(2);
	});

	it("ignores a background measured only on a small inline element", () => {
		expect(
			normalizeSurfaces([
				element({ "background-color": "#ff0000" }, { role: "element" }),
			]),
		).toEqual([]);
	});
});
