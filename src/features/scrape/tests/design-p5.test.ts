import { describe, expect, it } from "vitest";
import {
	deriveObservedComponents,
	inferTheme,
} from "@/features/scrape/services/design-model";
import {
	buildSynthesisPayload,
	parseSynthesisResponse,
} from "@/features/scrape/services/design-synthesis";
import type { VisualElementEvidence } from "@/features/scrape/services/design-visual-evidence";
import { documentMatchesEvidence } from "@/features/scrape/utils/design-md-inspector";
import {
	isValidCssColor,
	isValidCssLength,
	renderDesignMd,
	validateDesignMd,
} from "@/features/scrape/utils/design-md-render";
import { classifyColors } from "@/features/scrape/utils/design-normalize-color";
import {
	isPillRadius,
	normalizeSpacing,
	normalizeSurfaces,
} from "@/features/scrape/utils/design-normalize-shape";
import {
	classifyTypeRole,
	normalizeFontWeight,
	parsePx,
} from "@/features/scrape/utils/design-normalize-typography";
import { buildFixtureModel, FIXTURE } from "@/lib/design-fixture";

function element(
	properties: Record<string, string>,
	overrides: Partial<VisualElementEvidence> = {},
): VisualElementEvidence {
	return {
		selector: "body:nth-child(1) > div:nth-child(1)",
		role: "element",
		text: "Sample",
		width: 100,
		height: 40,
		properties,
		...overrides,
	};
}

function extractJson(text: string): string {
	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");
	return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}

describe("phase 5 color grounding", () => {
	it("does not promote a single brand-named variable sighting to brand", () => {
		const [entry] = classifyColors([
			element(
				{ "background-color": "#123456" },
				{ variables: { "--color-brand": "#123456" } },
			),
		]);
		expect(entry?.roleClass).not.toBe("brand");
	});

	it("treats canvas user-agent black text as default rather than brand", () => {
		const [entry] = classifyColors([
			element({ color: "rgb(0, 0, 0)" }, { role: "canvas" }),
			element({ color: "#000000" }, { role: "canvas" }),
		]);
		expect(entry?.userAgentDefault).toBe(true);
		expect(entry?.roleClass).toBe("neutral");
	});

	it("does not call a repeated generic background a page surface", () => {
		const [entry] = classifyColors([
			element({ "background-color": "#abcdef" }),
			element({ "background-color": "#abcdef" }),
		]);
		expect(entry?.roleClass).toBe("unknown");
	});
});

describe("phase 5 spacing and radius", () => {
	it("demotes zero reset measurements from system tokens", () => {
		const elements = [
			...Array.from({ length: 49 }, () => element({ margin: "0px" })),
			...Array.from({ length: 47 }, () => element({ padding: "0px" })),
			...Array.from({ length: 6 }, () => element({ gap: "8px" })),
		];
		const { tokens } = normalizeSpacing(elements);
		expect(
			tokens.filter(
				(token) => token.valuePx === 0 && token.purpose === "Measured spacing",
			),
		).toEqual([]);
	});

	it("does not label main zero padding as card padding", () => {
		const { tokens } = normalizeSpacing([
			element({ padding: "0px" }, { role: "main" }),
		]);
		expect(
			tokens.some(
				(token) => token.purpose === "Card padding" && token.value === "0px",
			),
		).toBe(false);
	});

	it("parses scientific radius notation without misreading a substring", () => {
		expect(parsePx("3.35544e+07px")).toBeCloseTo(33554400, -2);
		expect(isPillRadius(parsePx("3.35544e+07px"))).toBe(true);
		expect(isPillRadius(parsePx("8px"))).toBe(false);
	});
});

describe("phase 5 surfaces and theme", () => {
	it("never reports a fully transparent background as a surface", () => {
		const surfaces = normalizeSurfaces([
			element({ "background-color": "rgba(0, 0, 0, 0)" }, { role: "canvas" }),
			element({ "background-color": "rgba(0, 0, 0, 0)" }, { role: "section" }),
		]);
		expect(surfaces).toEqual([]);
	});

	it("merges equivalent rgb and hex surfaces into one token", () => {
		const surfaces = normalizeSurfaces([
			element({ "background-color": "rgb(255, 255, 255)" }, { role: "canvas" }),
			element({ "background-color": "#ffffff" }, { role: "section" }),
			element({ "background-color": "#ffffff" }, { role: "section" }),
		]);
		expect(surfaces).toHaveLength(1);
		expect(surfaces[0]?.value).toBe("#ffffff");
	});

	it("infers light from a white canvas and dark from a black canvas", () => {
		const light = inferTheme({
			...FIXTURE,
			elements: [
				element(
					{ "background-color": "rgb(255, 255, 255)" },
					{ role: "canvas" },
				),
			],
		});
		const dark = inferTheme({
			...FIXTURE,
			elements: [
				element({ "background-color": "rgb(0, 0, 0)" }, { role: "canvas" }),
			],
		});
		const unknown = inferTheme({
			...FIXTURE,
			elements: [
				element({ "background-color": "rgba(0, 0, 0, 0)" }, { role: "canvas" }),
			],
		});
		expect(light).toBe("light");
		expect(dark).toBe("dark");
		expect(unknown).toBe("unknown");
	});
});

describe("phase 5 typography", () => {
	it("assigns interactive small text to the UI label role", () => {
		expect(classifyTypeRole(12, ["cta"], "Inter, sans-serif")).toBe("UI label");
		expect(classifyTypeRole(12, ["nav"], "Inter, sans-serif")).toBe("UI label");
		expect(classifyTypeRole(16, ["cta"], "Inter, sans-serif")).toBe("Body");
	});

	it("preserves relative weights instead of dropping them", () => {
		expect(normalizeFontWeight("bolder")).toBe("bolder");
		expect(normalizeFontWeight("lighter")).toBe("lighter");
		expect(normalizeFontWeight("700")).toBe("700");
	});
});

describe("phase 5 components", () => {
	it("derives observed components without AI synthesis", () => {
		const model = buildFixtureModel();
		expect(model.observedComponents.length).toBeGreaterThan(0);
		for (const component of model.observedComponents) {
			expect(component.frequency).toBeGreaterThanOrEqual(2);
			expect(component.evidence).toMatch(/Measured on/);
		}
		const markdown = renderDesignMd(model);
		expect(markdown).toContain("## Components");
	});

	it("keeps deterministic component derivation evidence-grounded", () => {
		const components = deriveObservedComponents(FIXTURE);
		expect(components.every((c) => c.frequency >= 2)).toBe(true);
		expect(components.length).toBeLessThanOrEqual(8);
	});
});

describe("phase 5 css validation", () => {
	it("accepts short hex and rejects malformed lengths", () => {
		expect(isValidCssColor("#fff")).toBe(true);
		expect(isValidCssColor("#ffffffff")).toBe(true);
		expect(isValidCssColor("rgb(21, 94, 239)")).toBe(true);
		expect(isValidCssColor("rgba(999, 0, 0, 2)")).toBe(false);
		expect(isValidCssLength("16px")).toBe(true);
		expect(isValidCssLength("0")).toBe(true);
		expect(isValidCssLength("1.2.3px")).toBe(false);
		expect(isValidCssLength("...px")).toBe(false);
	});

	it("uses measured aliases for unproven colors instead of brand claims", () => {
		const markdown = renderDesignMd(buildFixtureModel());
		expect(markdown).toContain("--color-measured-");
		expect(markdown).toContain("Generated from validated measurements");
	});

	it("flags missing version and duplicate tokens", () => {
		expect(
			validateDesignMd("# Doc\n\n## Elevation\n\ntext").some(
				(issue) => issue.code === "missing-version",
			),
		).toBe(true);
		const dup = [
			"# Doc",
			"",
			"```css",
			":root {",
			"  --color-a: #ffffff;",
			"  --color-a: #000000;",
			"}",
			"```",
			"",
			"Document model version 2. Captured now.",
		].join("\n");
		expect(
			validateDesignMd(dup).some((issue) => issue.code === "duplicate-token"),
		).toBe(true);
	});
});

describe("phase 5 synthesis reliability", () => {
	it("reports truncation explicitly instead of generic invalid json", () => {
		const outcome = parseSynthesisResponse(
			'{"essence": "cut',
			buildFixtureModel(),
			extractJson,
			{ finishReason: "length" },
		);
		expect(outcome.status).toBe("unavailable");
		expect(outcome.cause).toBe("truncated");
	});

	it("codes schema and reference failures distinctly", () => {
		const model = buildFixtureModel();
		const schemaMiss = parseSynthesisResponse(
			JSON.stringify({ essence: "too little" }),
			model,
			extractJson,
		);
		expect(schemaMiss.cause).toBe("schema");
		const badRef = parseSynthesisResponse(
			JSON.stringify({
				essence: "A measured interface.",
				overview: "Hierarchy comes from a measured type scale.",
				theme: "light",
				identityNarrative: "One action colour leads the page.",
				componentPatterns: [],
				layoutPrinciples: [],
				imageryNotes: [],
				implementationGuidance: [],
				dos: [
					{ rule: "Invented.", references: [{ kind: "color", index: 999 }] },
				],
				donts: [],
				limitations: [],
			}),
			model,
			extractJson,
		);
		expect(badRef.cause).toBe("unknown_reference");
	});

	it("bounds the synthesis payload with an explicit marker", () => {
		const payload = JSON.parse(buildSynthesisPayload(buildFixtureModel()));
		expect(payload).toHaveProperty("payloadTruncated");
	});
});

describe("phase 5 document consistency", () => {
	it("rejects a single-value match and accepts canonical coverage", () => {
		const model = buildFixtureModel();
		const full = renderDesignMd(model);
		expect(
			documentMatchesEvidence(full, {
				elements: FIXTURE.elements,
				sourceUrl: FIXTURE.sourceUrl,
				viewport: FIXTURE.viewport,
			}),
		).toBe(true);
		expect(
			documentMatchesEvidence("Totally unrelated text about nothing.", {
				elements: FIXTURE.elements,
				sourceUrl: FIXTURE.sourceUrl,
				viewport: FIXTURE.viewport,
			}),
		).toBe(false);
	});
});
