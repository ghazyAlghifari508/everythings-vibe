import { describe, expect, it } from "vitest";
import { deriveModelGuidelines } from "../services/design-model-guidance";
import type {
	VisualElementEvidence,
	VisualEvidence,
} from "../services/design-visual-evidence";
import { normalizeColors } from "../utils/design-color-tokens";
import type { ColorClassification } from "../utils/design-normalize-color";
import { normalizeRadii } from "../utils/design-normalize-radius";

function element(
	role: string,
	radius?: string,
	height = 40,
): VisualElementEvidence {
	return {
		selector: role,
		role,
		text: "",
		width: 160,
		height,
		properties: radius === undefined ? {} : { "border-radius": radius },
	};
}

function evidence(elements: VisualElementEvidence[]): VisualEvidence {
	return {
		version: 1,
		sourceUrl: "https://example.test",
		capturedAt: "2026-01-01T00:00:00Z",
		viewport: { width: 1200, height: 800 },
		elements,
		fonts: [],
		limitations: [],
	};
}

function guidelines(elements: VisualElementEvidence[]) {
	return deriveModelGuidelines(
		evidence(elements),
		[],
		[],
		[],
		normalizeRadii(elements),
	);
}

describe("component-scoped radius evidence", () => {
	it("keeps shared values separate by role, frequency and geometry", () => {
		const tokens = normalizeRadii([
			element("cta", "12px", 40),
			element("input", "12px", 20),
			element("input", "12px", 20),
			element("section", "12px", 200),
		]);
		expect(
			tokens.map(({ purpose, frequency, pill, roles }) => ({
				purpose,
				frequency,
				pill,
				roles,
			})),
		).toEqual([
			{ purpose: "Inputs", frequency: 2, pill: true, roles: ["input"] },
			{ purpose: "Buttons", frequency: 1, pill: false, roles: ["cta"] },
			{
				purpose: "Measured radius",
				frequency: 1,
				pill: false,
				roles: ["section"],
			},
		]);
	});

	it("requires every element in a role group to prove pill geometry", () => {
		expect(
			normalizeRadii([
				element("cta", "12px", 20),
				element("cta", "12px", 40),
			])[0]?.pill,
		).toBe(false);
	});

	it.each([
		0,
		Number.NaN,
		Number.POSITIVE_INFINITY,
	])("does not prove a pill with invalid geometry %s", (height) => {
		expect(
			normalizeRadii([
				element("cta", "12px", 20),
				element("cta", "12px", height),
			])[0]?.pill,
		).toBe(false);
	});

	it.each([
		"0px 24px",
		"24px / 0px",
		"50%",
	])("preserves %s without interpreting its largest number as a uniform radius", (value) => {
		const token = normalizeRadii([element("cta", value)])[0];
		expect(token?.value).toBe(value);
		expect(token?.valuePx).toBeNaN();
		expect(token?.pill).toBe(false);
	});

	it.each([
		"main",
		"section",
		"header",
		"footer",
	])("does not infer cards from %s", (role) => {
		const token = normalizeRadii([element(role, "24px")])[0];
		expect(token?.purpose).toBe("Measured radius");
		expect(token?.roles).toEqual([role]);
	});

	it("preserves explicit card classification for compatible evidence", () => {
		expect(normalizeRadii([element("card", "24px")])[0]?.purpose).toBe(
			"Large cards",
		);
	});

	it("does not merge the same role and radius across capture scopes", () => {
		const elements = [
			element("cta", "12px", 20),
			element("cta", "12px", 40),
		].map((entry, index) => ({
			...entry,
			selector: `[capture ${index + 1}: 1200x800, auto] ${entry.selector}`,
		}));
		expect(
			normalizeRadii(elements).map(({ frequency, pill }) => ({
				frequency,
				pill,
			})),
		).toEqual([
			{ frequency: 1, pill: true },
			{ frequency: 1, pill: false },
		]);
	});
});

describe("radius guidance boundaries", () => {
	it("derives a supported rule from repeated agreeing CTA measurements", () => {
		const result = guidelines([element("cta", "8px"), element("cta", "8px")]);
		expect(result.dos).toHaveLength(1);
		expect(result.limitations).toEqual([]);
	});

	it("preserves conflicts without selecting the most frequent value", () => {
		const elements = [
			element("cta", "8px"),
			element("cta", "8px"),
			element("cta", "16px"),
		];
		expect(normalizeRadii(elements).map((token) => token.value)).toEqual([
			"8px",
			"16px",
		]);
		const result = guidelines(elements);
		expect(result.dos).toEqual([]);
		expect(
			result.limitations.some(
				(note) => note.includes("8px") && note.includes("16px"),
			),
		).toBe(true);
	});

	it.each([
		undefined,
		"",
		"normal",
		"none",
	])("withholds rules when a CTA radius is missing or invalid: %s", (value) => {
		const result = guidelines([element("cta", "8px"), element("cta", value)]);
		expect(result.dos).toEqual([]);
		expect(result.limitations.length).toBeGreaterThan(0);
	});

	it("does not borrow repetition from containers", () => {
		const result = guidelines([
			element("cta", "8px"),
			element("section", "8px"),
			element("section", "8px"),
		]);
		expect(result.dos).toEqual([]);
		expect(result.limitations.length).toBeGreaterThan(0);
	});

	it("does not treat one CTA repeated across captures as repeated support within a scope", () => {
		const elements = [element("cta", "8px"), element("cta", "8px")].map(
			(entry, index) => ({
				...entry,
				selector: `[capture ${index + 1}: 1200x800, auto] ${entry.selector}`,
			}),
		);
		expect(guidelines(elements).dos).toEqual([]);
	});

	it("limits rules to their capture even when another capture has conflicting measurements", () => {
		const primary = evidence([element("cta", "8px"), element("cta", "8px")]);
		const secondary = evidence([
			element("cta", "16px"),
			element("cta", "24px"),
		]);
		const combined = [...primary.elements, ...secondary.elements];
		const result = deriveModelGuidelines(
			{ ...primary, additionalViews: [secondary] },
			[],
			[],
			[],
			normalizeRadii(combined),
		);
		expect(result.dos).toHaveLength(1);
		expect(result.dos[0]?.evidence).toContain("capture 1");
		expect(
			result.limitations.some(
				(note) => note.includes("16px") && note.includes("24px"),
			),
		).toBe(true);
	});

	it("does not count additional views twice after the model flattens captures", () => {
		const primary = evidence([element("cta", "8px"), element("cta", "8px")]);
		const secondary = evidence([
			element("cta", "16px"),
			element("cta", "16px"),
		]);
		const elements = [primary, secondary].flatMap((view, index) =>
			view.elements.map((entry) => ({
				...entry,
				selector: `[capture ${index + 1}: 1200x800, auto] ${entry.selector}`,
			})),
		);
		const result = deriveModelGuidelines(
			{ ...primary, elements, additionalViews: [secondary] },
			[],
			[],
			[],
			normalizeRadii(elements),
		);
		expect(result.dos).toHaveLength(2);
		expect(result.limitations).toEqual([]);
	});

	it("keeps agreeing shorthand measurements operational without inventing a scalar", () => {
		const result = guidelines([
			element("cta", "4px 12px"),
			element("cta", "4px 12px"),
		]);
		expect(result.dos).toHaveLength(1);
		expect(result.dos[0]?.rule).toContain("4px 12px");
	});

	it("accepts measured square buttons without inventing rounding", () => {
		expect(
			guidelines([element("cta", "0px"), element("cta", "0px")]).dos,
		).toHaveLength(1);
	});

	it("withholds a rule when matching button tokens are unavailable", () => {
		const source = evidence([element("cta", "8px"), element("cta", "8px")]);
		expect(deriveModelGuidelines(source, [], [], [], []).dos).toEqual([]);
	});

	it("does not assign brand colors to primary actions without hierarchy evidence", () => {
		const elements = [element("cta", "8px"), element("cta", "8px")].map(
			(entry) => ({
				...entry,
				properties: { "background-color": "rgb(20, 80, 160)" },
			}),
		);
		const colors: ColorClassification[] = normalizeColors(elements).map(
			(token) => ({
				token,
				roleClass: "brand",
				roleLabel: "Brand accent",
				rationale:
					"A measured brand association does not establish action hierarchy.",
				userAgentDefault: false,
			}),
		);
		expect(colors).toHaveLength(1);
		expect(
			deriveModelGuidelines(evidence(elements), colors, [], [], []).dos,
		).toEqual([]);
	});
});
