import { describe, expect, it } from "vitest";
import { buildFixtureModel } from "./design-fixture";
import {
	DESIGN_MD_SECTIONS,
	type DesignMdSection,
	escapeCell,
	isValidCssColor,
	isValidCssLength,
	renderDesignMd,
	tokenName,
	validateDesignMd,
} from "./design-md-render";

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
