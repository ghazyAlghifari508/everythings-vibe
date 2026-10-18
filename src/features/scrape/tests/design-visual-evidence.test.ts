import { chromium } from "playwright";
import { describe, expect, it } from "vitest";
import {
	collectVisualEvidence,
	deriveEvidenceGuidelines,
	extractionFromVisualEvidence,
	groupMeasurements,
	renderEvidenceDesignMd,
	type VisualElementEvidence,
	type VisualEvidence,
} from "../services/design-visual-evidence";
import {
	DESIGN_EVIDENCE_LIMITS,
	visualEvidenceSchema,
} from "../types/design-evidence-contract";

it("measures rendered styles and excludes hidden and unused declarations", async () => {
	const browser = await chromium.launch({ headless: true });
	try {
		const page = await browser.newPage();
		await page.setContent(`<style>
		.unused {color:#123456} :root {--action:rgba(90,200,40,.8)}
		body {font-family:serif} button {background:var(--action);font-size:19px}
		.hidden {display:none;color:#654321}
		</style><h1>Example</h1><button>Action</button><div class="hidden">Hidden</div>`);
		const evidence = await page.evaluate(
			collectVisualEvidence,
			DESIGN_EVIDENCE_LIMITS,
		);
		expect(visualEvidenceSchema.safeParse(evidence).success).toBe(true);
		const button = evidence.elements.find((element) => element.role === "cta");
		expect(button?.properties["background-color"]).toBe(
			"rgba(90, 200, 40, 0.8)",
		);
		expect(button?.properties["font-size"]).toBe("19px");
		expect(
			evidence.elements.some((element) =>
				Object.values(element.properties).some((value) =>
					/18, 52, 86|101, 67, 33/.test(value),
				),
			),
		).toBe(false);
		expect(evidence.fonts).toEqual([]);
		const extraction = extractionFromVisualEvidence(evidence);
		expect(extraction.colors).toContainEqual({
			role: "cta-background",
			value: "rgba(90, 200, 40, 0.8)",
		});
		expect(
			extraction.typographyRoles?.find((role) => role.role === "cta")?.size,
		).toBe("19px");
		const document = renderEvidenceDesignMd(evidence);
		expect(document).toContain("rgba(90, 200, 40, 0.8)");
		expect(document).toContain("19px");
		expect(document).not.toContain("--color-primary");
		expect(
			evidence.elements.every(
				(element) =>
					element.selector.length > 0 &&
					element.width > 0 &&
					element.height > 0,
			),
		).toBe(true);
	} finally {
		await browser.close();
	}
}, 60000);

it("keeps sparse and missing measurements empty rather than filling a palette or type scale", () => {
	const evidence = {
		version: 1,
		sourceUrl: "https://example.test/",
		capturedAt: new Date().toISOString(),
		viewport: { width: 1440, height: 900 },
		elements: [],
		fonts: [],
		limitations: [],
	} as const;
	const input = { ...evidence, elements: [], fonts: [], limitations: [] };
	expect(extractionFromVisualEvidence(input).colors).toEqual([]);
	expect(extractionFromVisualEvidence(input).typographyRoles).toEqual([]);
	expect(
		visualEvidenceSchema.safeParse({
			...input,
			elements: [
				{
					selector: "body",
					role: "body",
					text: "",
					width: -1,
					height: 1,
					properties: {},
				},
			],
		}).success,
	).toBe(false);
});

it("only derives brand-primary from repeated CTAs and a matching semantic variable", () => {
	const base = {
		version: 1 as const,
		sourceUrl: "https://example.test/",
		capturedAt: new Date().toISOString(),
		viewport: { width: 1440, height: 900 },
		fonts: [],
		limitations: [],
	};
	const button = {
		selector: "body > button:nth-child(1)",
		role: "cta",
		text: "Action",
		width: 120,
		height: 44,
		properties: { "background-color": "rgb(70, 180, 40)" },
		variables: { "--brand-primary": "rgb(70, 180, 40)" },
	};
	expect(
		extractionFromVisualEvidence({ ...base, elements: [button] }).colors[0]
			.role,
	).toBe("cta-background");
	const repeated = extractionFromVisualEvidence({
		...base,
		elements: [button, { ...button, selector: "body > button:nth-child(2)" }],
	});
	expect(repeated.colors[0].role).toContain("derived");
	expect(
		extractionFromVisualEvidence({
			...base,
			elements: [
				{ ...button, variables: {} },
				{ ...button, selector: "body > button:nth-child(2)", variables: {} },
			],
		}).colors[0].role,
	).toBe("cta-background");
});

it("preserves computed gradients and variables independently of declaration order", async () => {
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		await page.setContent(
			`<style>:root{--paint:rgb(75, 155, 35)} .unused{background:blue} button{background:var(--paint)} section{background-image:linear-gradient(red,transparent)}</style><section><h1>Fixture</h1><button>Action</button></section>`,
		);
		const first = await page.evaluate(
			collectVisualEvidence,
			DESIGN_EVIDENCE_LIMITS,
		);
		await page.addStyleTag({ content: ".unused{background:purple}" });
		const second = await page.evaluate(
			collectVisualEvidence,
			DESIGN_EVIDENCE_LIMITS,
		);
		expect(extractionFromVisualEvidence(first).colors).toEqual(
			extractionFromVisualEvidence(second).colors,
		);
		expect(
			first.elements.find((entry) => entry.role === "cta")?.variables?.[
				"--paint"
			],
		).toBe("rgb(75, 155, 35)");
		expect(
			first.elements.find((entry) => entry.role === "section")?.properties[
				"background-image"
			],
		).toContain("linear-gradient");
	} finally {
		await browser.close();
	}
}, 60000);

function evidenceWith(
	elements: VisualElementEvidence[],
	fonts: VisualEvidence["fonts"] = [],
): VisualEvidence {
	return {
		version: 1,
		sourceUrl: "https://example.test/",
		capturedAt: new Date().toISOString(),
		viewport: { width: 1440, height: 900 },
		elements,
		fonts,
		limitations: [],
	};
}

function cta(selector: string, properties: Record<string, string>) {
	return {
		selector,
		role: "cta",
		text: "Action",
		width: 120,
		height: 44,
		properties,
	};
}

function measured(
	selector: string,
	properties: Record<string, string>,
	role = "element",
): VisualElementEvidence {
	return {
		selector,
		role,
		text: "",
		width: 120,
		height: 44,
		properties,
	};
}

describe("groupMeasurements", () => {
	it("collapses identical property/value pairs and keeps provenance", () => {
		const grouped = groupMeasurements(
			[
				measured("a", { padding: "0px" }),
				measured("b", { padding: "0px" }),
				measured("c", { padding: "16px" }),
			],
			["padding"],
		);
		expect(grouped).toHaveLength(2);
		expect(grouped[0]).toEqual({
			property: "padding",
			value: "0px",
			frequency: 2,
			selectors: ["a", "b"],
			roles: ["element"],
		});
		expect(grouped[1]?.frequency).toBe(1);
	});

	it("keeps a semantically meaningful zero measurement", () => {
		const grouped = groupMeasurements(
			[measured("a", { padding: "0px", margin: "0px" })],
			["padding", "margin"],
		);
		expect(grouped.map((group) => group.value)).toEqual(["0px", "0px"]);
	});

	it("skips absent and non-renderable values", () => {
		expect(
			groupMeasurements(
				[measured("a", { "box-shadow": "none", padding: "normal" })],
				["box-shadow", "padding"],
			),
		).toEqual([]);
	});

	it("orders by frequency so the dominant value is presented first", () => {
		const grouped = groupMeasurements(
			[
				measured("a", { gap: "8px" }),
				measured("b", { gap: "24px" }),
				measured("c", { gap: "24px" }),
			],
			["gap"],
		);
		expect(grouped[0]?.value).toBe("24px");
		expect(grouped[0]?.frequency).toBe(2);
	});
});

describe("renderEvidenceDesignMd curation", () => {
	const repeated = [
		cta("button:nth-child(1)", {
			"background-color": "rgb(10, 20, 30)",
			"border-radius": "8px",
			"font-family": "Example, serif",
			"font-size": "16px",
			"font-weight": "500",
			padding: "0px",
		}),
		cta("button:nth-child(2)", {
			"background-color": "rgb(10, 20, 30)",
			"border-radius": "8px",
			"font-family": "Example, serif",
			"font-size": "16px",
			"font-weight": "500",
			padding: "0px",
		}),
	];

	it("emits each identical measurement once with its frequency", () => {
		const document = renderEvidenceDesignMd(evidenceWith(repeated));
		const spacingRows = document
			.split("\n")
			.filter((line) => line.startsWith("| padding |"));
		expect(spacingRows).toHaveLength(1);
		expect(spacingRows[0]).toContain("2 elemen");
		expect(spacingRows[0]).toContain("0px");
	});

	it("never repeats an identical property/value/source row", () => {
		const document = renderEvidenceDesignMd(evidenceWith(repeated));
		const rows = document
			.split("\n")
			.filter((line) => line.startsWith("| ") && !line.includes("---"));
		const identities = rows.map((row) =>
			row
				.split("|")
				.slice(1, 4)
				.map((cell) => cell.trim())
				.join("|"),
		);
		expect(new Set(identities).size).toBe(identities.length);
	});

	it("does not invent a base spacing unit", () => {
		const document = renderEvidenceDesignMd(evidenceWith(repeated));
		expect(document).not.toMatch(/base\s*unit/i);
	});
});

describe("deriveEvidenceGuidelines", () => {
	const base = {
		"background-color": "rgb(10, 20, 30)",
		"border-radius": "8px",
		"font-family": "Example, serif",
		"font-size": "16px",
		"font-weight": "500",
	};

	it("derives Do rules only from repeated measured CTA patterns", () => {
		const guidelines = deriveEvidenceGuidelines(
			evidenceWith([
				cta("button:nth-child(1)", base),
				cta("button:nth-child(2)", base),
			]),
		);
		expect(
			guidelines.dos.some((rule) => rule.includes("border-radius 8px")),
		).toBe(true);
		expect(
			guidelines.dos.some((rule) => rule.includes("rgb(10, 20, 30)")),
		).toBe(true);
		expect(guidelines.dos.length).toBeGreaterThan(0);
	});

	it("withholds guidance when only a single observation exists", () => {
		const guidelines = deriveEvidenceGuidelines(
			evidenceWith([cta("button:nth-child(1)", base)]),
		);
		expect(guidelines.dos).toEqual([]);
		expect(guidelines.donts).toEqual([]);
		expect(guidelines.limitations.length).toBeGreaterThan(0);
	});

	it("never claims interaction, responsive or hover states", () => {
		const guidelines = deriveEvidenceGuidelines(
			evidenceWith([
				cta("button:nth-child(1)", base),
				cta("button:nth-child(2)", base),
			]),
		);
		for (const rule of [...guidelines.dos, ...guidelines.donts])
			expect(rule).not.toMatch(/hover|focus|mobile|responsive|disabled/i);
	});

	it("flags a single-use CTA color as unverified rather than a pattern", () => {
		const guidelines = deriveEvidenceGuidelines(
			evidenceWith([
				cta("button:nth-child(1)", base),
				cta("button:nth-child(2)", base),
				cta("button:nth-child(3)", {
					...base,
					"background-color": "rgb(200, 10, 10)",
				}),
			]),
		);
		expect(
			guidelines.donts.some((rule) => rule.includes("rgb(200, 10, 10)")),
		).toBe(true);
	});

	it("reports a zero-only spacing capture as a stated limitation", () => {
		const guidelines = deriveEvidenceGuidelines(
			evidenceWith([
				cta("button:nth-child(1)", { ...base, padding: "0px", gap: "0px" }),
				cta("button:nth-child(2)", { ...base, padding: "0px", gap: "0px" }),
			]),
		);
		expect(guidelines.limitations.some((note) => /spacing/i.test(note))).toBe(
			true,
		);
	});

	it("states unverified font-face loading instead of guessing the glyph font", () => {
		const guidelines = deriveEvidenceGuidelines(
			evidenceWith(
				[cta("button:nth-child(1)", base), cta("button:nth-child(2)", base)],
				[{ family: "Example", weight: "400", status: "unloaded" }],
			),
		);
		expect(guidelines.limitations.some((note) => /font/i.test(note))).toBe(
			true,
		);
	});
});

it("publishes Do and Don'ts into the rendered document", () => {
	const document = renderEvidenceDesignMd(
		evidenceWith([
			cta("button:nth-child(1)", {
				"background-color": "rgb(10, 20, 30)",
				"border-radius": "8px",
			}),
			cta("button:nth-child(2)", {
				"background-color": "rgb(10, 20, 30)",
				"border-radius": "8px",
			}),
		]),
	);
	expect(document).toContain("## Do's and Don'ts");
	expect(document).toContain("- Do: ");
});
