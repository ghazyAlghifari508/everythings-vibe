import { chromium } from "playwright";
import { expect, it } from "vitest";
import {
	DESIGN_EVIDENCE_LIMITS,
	visualEvidenceSchema,
} from "./design-evidence-contract";
import {
	collectVisualEvidence,
	extractionFromVisualEvidence,
	renderEvidenceDesignMd,
} from "./design-visual-evidence";

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
