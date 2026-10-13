import { describe, expect, it } from "vitest";
import {
	classifyTypeRole,
	groupTypeSpecimens,
	isPlaceholderFamily,
	normalizeFontWeight,
	normalizeTypefaces,
	parsePx,
	primaryFontFamily,
} from "./design-normalize-typography";
import type { VisualElementEvidence } from "./design-visual-evidence";

function textElement(
	properties: Record<string, string>,
	overrides: Partial<VisualElementEvidence> = {},
): VisualElementEvidence {
	return {
		selector: "body:nth-child(1) > p:nth-child(1)",
		role: "body",
		text: "Sample paragraph copy",
		width: 400,
		height: 24,
		properties,
		...overrides,
	};
}

const BODY_STYLE = {
	"font-family": "Inter, sans-serif",
	"font-size": "16px",
	"font-weight": "400",
	"line-height": "24px",
	"letter-spacing": "normal",
};

describe("font normalization", () => {
	it("reads the declared family, not the whole fallback stack", () => {
		expect(primaryFontFamily('Inter, "Helvetica Neue", sans-serif')).toBe(
			"Inter",
		);
		expect(primaryFontFamily("'JetBrains Mono', monospace")).toBe(
			"JetBrains Mono",
		);
	});

	it("recognizes generic families as placeholders rather than typefaces", () => {
		for (const family of [
			"sans-serif",
			"serif",
			"monospace",
			"system-ui",
			"ui-monospace",
		])
			expect(isPlaceholderFamily(family)).toBe(true);
		expect(isPlaceholderFamily("Inter")).toBe(false);
	});

	it("normalizes keyword weights to their numeric equivalents", () => {
		expect(normalizeFontWeight("bold")).toBe("700");
		expect(normalizeFontWeight("normal")).toBe("400");
		expect(normalizeFontWeight("600")).toBe("600");
		expect(normalizeFontWeight("unset")).toBe("");
	});

	it("parses px values and refuses anything else", () => {
		expect(parsePx("16px")).toBe(16);
		expect(parsePx("1.5px")).toBe(1.5);
		expect(parsePx("1rem")).toBeNaN();
		expect(parsePx("normal")).toBeNaN();
	});
});

describe("type scale grouping", () => {
	it("collapses paragraph variation into one body specimen", () => {
		const specimens = groupTypeSpecimens([
			textElement(BODY_STYLE, { text: "First paragraph of the page" }),
			textElement(BODY_STYLE, { text: "Second paragraph of the page" }),
			textElement(BODY_STYLE, { text: "Third paragraph of the page" }),
		]);
		expect(specimens).toHaveLength(1);
		expect(specimens[0]?.role).toBe("Body");
		expect(specimens[0]?.frequency).toBe(3);
	});

	it("keeps a heading at the same size but different weight distinct", () => {
		const specimens = groupTypeSpecimens([
			textElement(BODY_STYLE),
			textElement(
				{ ...BODY_STYLE, "font-weight": "600" },
				{ role: "h2", text: "Section heading" },
			),
		]);
		expect(specimens).toHaveLength(2);
	});

	it("produces a scale with one representative per role, not one per variation", () => {
		const specimens = groupTypeSpecimens([
			textElement(
				{ ...BODY_STYLE, "font-size": "48px", "font-weight": "700" },
				{ role: "h1", text: "Display headline" },
			),
			textElement(
				{ ...BODY_STYLE, "font-size": "32px", "font-weight": "600" },
				{ role: "h2", text: "Section heading" },
			),
			textElement(BODY_STYLE, { text: "Body copy one" }),
			textElement(
				{ ...BODY_STYLE, "font-size": "14px" },
				{ text: "Small copy" },
			),
		]);
		const roles = specimens.map((specimen) => specimen.role);
		expect(roles).toEqual(["Display", "Large heading", "Body", "Body small"]);
	});

	it("never emits a body, body, body, body list", () => {
		const specimens = groupTypeSpecimens(
			Array.from({ length: 12 }, (_, index) =>
				textElement(
					{ ...BODY_STYLE, "font-size": `${14 + (index % 3)}px` },
					{ text: `Paragraph ${index}` },
				),
			),
		);
		const bodyLike = specimens.filter(
			(specimen) => specimen.role === "Body" || specimen.role === "Body small",
		);
		// At most one representative per body-ish role, never one row per element.
		expect(bodyLike.length).toBeLessThanOrEqual(2);
		expect(specimens.length).toBeLessThan(12);
	});

	it("classifies a monospace stack as its own role", () => {
		const specimens = groupTypeSpecimens([
			textElement(
				{ ...BODY_STYLE, "font-family": "JetBrains Mono, monospace" },
				{ text: "const value = 1;" },
			),
		]);
		expect(specimens[0]?.role).toBe("Monospace");
	});

	it("keeps a real page sample instead of a fabricated sentence", () => {
		const specimens = groupTypeSpecimens([
			textElement(BODY_STYLE, { text: "Harga mulai dari Rp49.000 per bulan" }),
		]);
		expect(specimens[0]?.sample).toBe("Harga mulai dari Rp49.000 per bulan");
	});

	it("ignores the document canvas and elements with no rendered text", () => {
		const specimens = groupTypeSpecimens([
			textElement(BODY_STYLE, { role: "canvas" }),
			textElement(BODY_STYLE, { text: "   " }),
			textElement(BODY_STYLE, { text: "" }),
		]);
		expect(specimens).toEqual([]);
	});

	it("assigns roles from measured size and element semantics", () => {
		expect(classifyTypeRole(72, ["h1"], "Inter, sans-serif")).toBe("Display");
		expect(classifyTypeRole(32, ["h2"], "Inter, sans-serif")).toBe(
			"Large heading",
		);
		expect(classifyTypeRole(24, ["h3"], "Inter, sans-serif")).toBe("Heading");
		expect(classifyTypeRole(18, ["h4"], "Inter, sans-serif")).toBe(
			"Subheading",
		);
		expect(classifyTypeRole(16, ["body"], "Inter, sans-serif")).toBe("Body");
		expect(classifyTypeRole(11, ["element"], "Inter, sans-serif")).toBe(
			"Caption",
		);
	});
});

describe("typeface normalization", () => {
	it("keeps declared, loaded and observed facts separate", () => {
		const specimens = groupTypeSpecimens([
			textElement(BODY_STYLE),
			textElement(
				{ ...BODY_STYLE, "font-size": "32px", "font-weight": "600" },
				{ role: "h2", text: "Heading copy" },
			),
		]);
		const typefaces = normalizeTypefaces(specimens, [
			{ family: "Inter", weight: "400", status: "loaded" },
			{ family: "Inter", weight: "600", status: "loading" },
		]);
		expect(typefaces).toHaveLength(1);
		expect(typefaces[0]?.family).toBe("Inter");
		expect(typefaces[0]?.measuredWeights).toEqual(["400", "600"]);
		expect(typefaces[0]?.measuredSizes).toEqual(["32px", "16px"]);
		expect(typefaces[0]?.loadedEvidence).toBe(true);
		expect(typefaces[0]?.declaredFaces).toHaveLength(2);
	});

	it("reports uncertainty when no declared face finished loading", () => {
		const specimens = groupTypeSpecimens([textElement(BODY_STYLE)]);
		const typefaces = normalizeTypefaces(specimens, [
			{ family: "Inter", weight: "400", status: "unloaded" },
		]);
		expect(typefaces[0]?.loadedEvidence).toBe(false);
	});

	it("does not treat a generic fallback as a typeface of its own", () => {
		const specimens = groupTypeSpecimens([
			textElement({ ...BODY_STYLE, "font-family": "sans-serif" }),
		]);
		expect(normalizeTypefaces(specimens, [])).toEqual([]);
	});

	it("records the scale roles a family was measured on", () => {
		const specimens = groupTypeSpecimens([
			textElement(BODY_STYLE),
			textElement(
				{ ...BODY_STYLE, "font-size": "48px", "font-weight": "700" },
				{ role: "h1", text: "Headline" },
			),
		]);
		const typefaces = normalizeTypefaces(specimens, []);
		expect(typefaces[0]?.roles).toContain("Display");
		expect(typefaces[0]?.roles).toContain("Body");
	});
});
