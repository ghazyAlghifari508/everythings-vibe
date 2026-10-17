import { describe, expect, it } from "vitest";
import {
	DESIGN_MD_SECTIONS,
	type DesignMdSection,
	escapeCell,
	isValidCssColor,
	isValidCssLength,
	renderDesignMd,
	tokenName,
	validateDesignMd,
} from "@/features/scrape/utils/design-md-render";
import { buildFixtureModel } from "@/lib/design-fixture";

describe("renderDesignMd", () => {
	const model = buildFixtureModel();
	const markdown = renderDesignMd(model);

	it("renders the required sections in the documented order", () => {
		const issues = validateDesignMd(markdown);
		expect(issues).toEqual([]);
		const headings = [...markdown.matchAll(/^##\s+(.*)$/gm)]
			.map((match) => (match[1] ?? "").trim())
			.filter((heading): heading is DesignMdSection =>
				(DESIGN_MD_SECTIONS as readonly string[]).includes(heading),
			);
		const ranks = headings.map((heading) =>
			DESIGN_MD_SECTIONS.indexOf(heading),
		);
		expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
		expect(headings).toContain("Tokens - Colors");
		expect(headings).toContain("Fonts & Type Scale");
		expect(headings).toContain("Do's and Don'ts");
		expect(headings).toContain("Measurement Provenance");
	});

	it("never places font loading evidence after the Agent Prompt Guide", () => {
		const guideIndex = markdown.indexOf("## Agent Prompt Guide");
		const fontLoadingIndex = markdown.indexOf("**Font loading evidence:**");
		expect(guideIndex).toBeGreaterThan(-1);
		expect(fontLoadingIndex).toBeGreaterThan(-1);
		expect(fontLoadingIndex).toBeLessThan(guideIndex);
	});

	it("emits no body, body, body repetition in the type scale", () => {
		const typographySection = markdown
			.split("## Tokens - Typography")[1]
			?.split("## Fonts & Type Scale")[0];
		expect(typographySection).toBeDefined();
		const bodyRows = [
			...(typographySection ?? "").matchAll(/^\|\s*Body\s*\|/gm),
		];
		expect(bodyRows.length).toBeLessThanOrEqual(1);
	});

	it("keeps every colour value a valid CSS colour", () => {
		for (const color of model.colors)
			expect(isValidCssColor(color.value)).toBe(true);
	});

	it("produces balanced code fences with valid hex values", () => {
		const fences = markdown.match(/^```/gm)?.length ?? 0;
		expect(fences % 2).toBe(0);
		for (const match of markdown.matchAll(/#[0-9a-f]+/gi))
			expect([4, 7, 9]).toContain(match[0].length);
	});

	it("marks a geometry-proven pill without rewriting its raw value", () => {
		const model = buildFixtureModel();
		const pillModel = {
			...model,
			radii: [
				{
					purpose: "Buttons",
					value: "9999px",
					valuePx: 9999,
					frequency: 2,
					roles: ["cta"],
					confidence: "observed",
					pill: true,
				},
			],
		} as typeof model;
		const markdown = renderDesignMd(pillModel);
		expect(markdown).toContain("9999px");
		expect(markdown).toMatch(/fully rounded \/ pill/);
	});

	it("emits container widths under a container namespace, never as spacing", () => {
		const model = buildFixtureModel();
		expect(
			model.spacing.some((token) => token.purpose === "Container max-width"),
		).toBe(true);
		const markdown = renderDesignMd(model);
		expect(markdown).not.toMatch(/--spacing-[a-z0-9-]*container/i);
		expect(markdown).not.toMatch(/--spacing-[a-z0-9-]*max-width/i);
		expect(markdown).toMatch(/--container-[a-z0-9-]+:\s*1200px/);
		const theme = markdown
			.split("## Tailwind v4")[1]
			?.split("## Limitations")[0];
		expect(theme).toBeDefined();
		expect(theme).not.toMatch(/--spacing-[a-z0-9-]*container/i);
	});

	it("emits valid unique custom property names", () => {
		const markdown = renderDesignMd(buildFixtureModel());
		const blocks = [...markdown.matchAll(/```css\n([\s\S]*?)```/g)].map(
			(match) => match[1] ?? "",
		);
		expect(blocks.length).toBeGreaterThan(0);
		// Names must be unique within each block: the validator flags a
		// duplicate alias in the same stylesheet, while the :root and @theme
		// blocks intentionally carry the same token set.
		for (const block of blocks) {
			const names = [...block.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map(
				(match) => match[1] ?? "",
			);
			expect(names.length).toBeGreaterThan(0);
			for (const name of names) expect(name).toMatch(/^--[a-z0-9-]+$/);
			expect(new Set(names).size).toBe(names.length);
		}
		expect(
			validateDesignMd(markdown).filter(
				(issue) => issue.code === "duplicate-token",
			),
		).toEqual([]);
	});

	it("labels generated CSS tokens as aliases rather than source variables", () => {
		expect(markdown).toContain(
			"not declarations copied from the website's own stylesheet",
		);
	});

	it("ties every Do and Don't rule to its measured evidence", () => {
		const section = markdown
			.split("## Do's and Don'ts")[1]
			?.split("## Surfaces")[0];
		expect(section).toBeDefined();
		const rules = [...(section ?? "").matchAll(/^- (?!\s*_Evidence)/gm)];
		const evidence = [...(section ?? "").matchAll(/^\s+- _Evidence:_/gm)];
		expect(rules.length).toBeGreaterThan(0);
		expect(evidence.length).toBe(rules.length);
	});

	it("omits a section rather than filling it with fabricated content", () => {
		// The fixture has no imagery evidence and the renderer was given none.
		expect(markdown).not.toContain("## Imagery & Iconography");
		// Observed component patterns are evidence-grounded, so they render
		// even without AI enrichment.
		expect(markdown).toContain("## Components");
		const section = markdown
			.split("## Components")[1]
			?.split("## Do's and Don'ts")[0];
		expect(section).toMatch(/Measured on \d+ .* elements/);
	});

	it("states limitations honestly", () => {
		expect(markdown).toContain("## Limitations & Confidence Notes");
		expect(markdown).toMatch(
			/responsive and interaction states were not measured/i,
		);
	});

	it("records the measurement provenance separately from the curation", () => {
		expect(markdown).toContain("## Measurement Provenance");
		expect(markdown).toMatch(/Visible elements sampled \| 10/);
	});

	it("escapes a value that would otherwise break the table", () => {
		expect(escapeCell("a | b")).toBe("a \\| b");
		expect(escapeCell("line\nbreak")).toBe("line break");
		expect(escapeCell("<script>")).toBe("&lt;script&gt;");
	});
});

describe("design md token naming", () => {
	it("slugs a role into a usable custom property name", () => {
		expect(tokenName("--color", "Primary action 1")).toBe(
			"--color-primary-action-1",
		);
		expect(tokenName("--spacing", "Card padding")).toBe(
			"--spacing-card-padding",
		);
	});

	it("refuses a name that cannot be slugged", () => {
		expect(tokenName("--color", "***")).toBeNull();
		expect(tokenName("--color", "")).toBeNull();
	});

	it("validates CSS values before they reach a stylesheet", () => {
		expect(isValidCssColor("#155eef")).toBe(true);
		expect(isValidCssColor("rgba(21, 94, 239, 0.5)")).toBe(true);
		expect(isValidCssColor("#15eef")).toBe(false);
		expect(isValidCssColor("oklch(0.7 0.1 250)")).toBe(false);
		expect(isValidCssLength("16px")).toBe(true);
		expect(isValidCssLength("1.5rem")).toBe(true);
		expect(isValidCssLength("normal")).toBe(false);
	});
});

function cssRulesOf(sheet: StyleSheet): CSSRule[] {
	const guard = (entry: StyleSheet): entry is CSSStyleSheet =>
		"cssRules" in entry;
	if (!guard(sheet)) return [];
	return [...sheet.cssRules];
}

describe("emitted stylesheet values", () => {
	it("survives a real CSS engine round-trip, not just the local regex", {
		timeout: 30000,
	}, async () => {
		const { JSDOM } = await import("jsdom");
		const model = buildFixtureModel();
		const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
		const target = dom.window.document.createElement("div");
		for (const color of model.colors) {
			target.style.color = "";
			target.style.color = color.value;
			expect(target.style.color).not.toBe("");
		}
		for (const token of model.spacing) {
			if (token.property === "padding" || token.property === "margin") {
				target.style.setProperty("padding", "");
				target.style.setProperty(token.property, token.value);
				expect(target.style.getPropertyValue(token.property)).not.toBe("");
			}
			if (token.property === "max-width") {
				target.style.maxWidth = "";
				target.style.maxWidth = token.value;
				expect(target.style.maxWidth).toBe(token.value);
			}
		}
		for (const token of model.radii) {
			target.style.borderRadius = "";
			target.style.borderRadius = token.value;
			expect(target.style.borderRadius).toBe(token.value);
		}
		for (const entry of model.typography) {
			target.style.fontSize = "";
			target.style.fontSize = entry.fontSize;
			expect(target.style.fontSize).not.toBe("");
		}
	});

	it("parses the root stylesheet block with a real CSS parser", {
		timeout: 30000,
	}, async () => {
		const { JSDOM } = await import("jsdom");
		const markdown = renderDesignMd(buildFixtureModel());
		const root = [...markdown.matchAll(/```css\n([\s\S]*?)```/g)]
			.map((match) => match[1] ?? "")
			.find((block) => block.includes(":root"));
		expect(root).toBeDefined();
		const dom = new JSDOM(
			"<!DOCTYPE html><html><head></head><body></body></html>",
		);
		const style = dom.window.document.createElement("style");
		style.textContent = root ?? "";
		dom.window.document.head.appendChild(style);
		const rules = [...dom.window.document.styleSheets].flatMap(cssRulesOf);
		expect(rules.length).toBeGreaterThan(0);
		const declared = (root?.match(/--[\w-]+\s*:/g) ?? []).length;
		let parsed = 0;
		for (const rule of rules)
			parsed += (rule.cssText.match(/--[\w-]+\s*:/g) ?? []).length;
		expect(parsed).toBe(declared);
	});
});

describe("validateDesignMd", () => {
	it("flags a section that is out of order", () => {
		const broken = [
			"# Doc",
			"",
			"## Elevation",
			"",
			"text",
			"",
			"## Tokens - Colors",
			"",
			"| A | B |",
			"| --- | --- |",
			"| 1 | 2 |",
		].join("\n");
		expect(
			validateDesignMd(broken).some((issue) => issue.code === "section-order"),
		).toBe(true);
	});

	it("flags an unbalanced code fence", () => {
		const broken = ["# Doc", "", "## CSS Custom Properties", "", "```css"].join(
			"\n",
		);
		expect(
			validateDesignMd(broken).some((issue) => issue.code === "code-fence"),
		).toBe(true);
	});

	it("flags a section outside the information architecture", () => {
		const broken = ["# Doc", "", "## Random Section", "", "text"].join("\n");
		expect(
			validateDesignMd(broken).some(
				(issue) => issue.code === "unknown-section",
			),
		).toBe(true);
	});

	it("accepts a document produced by the renderer", () => {
		expect(validateDesignMd(renderDesignMd(buildFixtureModel()))).toEqual([]);
	});
});

describe("renderDesignMd with partial enrichment", () => {
	it("keeps the measured tokens when the AI narrative is unavailable", () => {
		const model = buildFixtureModel();
		const markdown = renderDesignMd(model, { enrichmentUnavailable: true });
		expect(markdown).toContain("## Tokens - Colors");
		expect(markdown).toContain("## Tokens - Typography");
		expect(markdown).toMatch(/AI synthesis step did not produce a narrative/i);
	});

	it("includes enrichment prose only when it is supplied", () => {
		const model = buildFixtureModel();
		const withNarrative = renderDesignMd(model, {
			componentPatterns: [
				{
					name: "Primary action button",
					description: "Solid brand fill with a compact label.",
					evidence: "Measured twice on action elements at 8px radius.",
				},
			],
			layoutPrinciples: ["Content is constrained to a 1200px column."],
		});
		expect(withNarrative).toContain("## Components");
		expect(withNarrative).toContain("## Layout");
		expect(withNarrative).toContain("Primary action button");
	});
});
