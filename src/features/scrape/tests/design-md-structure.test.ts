import { describe, expect, it } from "vitest";
import { FIXTURE } from "@/lib/design-fixture";
import { buildDesignModel } from "../services/design-model";
import type { VisualEvidence } from "../services/design-visual-evidence";
import { designSettingsSchema } from "../types/scrape-contract";
import { renderDesignMd, validateDesignMd } from "../utils/design-md-render";

// Structural invariants for the canonical DESIGN.md: one section per topic, a
// colour stated once, valid variants preserved, and no contradictory
// declarations. Prose quality is a human review concern, not asserted here.

function viewsOf(
	widths: number[],
	schemes: ("light" | "dark")[],
	adjust?: (view: VisualEvidence) => void,
): VisualEvidence[] {
	return widths.flatMap((width) =>
		schemes.map((colorScheme) => {
			const view: VisualEvidence = {
				...structuredClone(FIXTURE),
				viewport: { width, height: 900 },
				colorScheme,
			};
			adjust?.(view);
			return view;
		}),
	);
}

function documentFor(views: VisualEvidence[]): string {
	const [first, ...rest] = views;
	if (!first) throw new Error("A document needs at least one capture.");
	return renderDesignMd(buildDesignModel({ ...first, additionalViews: rest }));
}

function h2Headings(document: string): string[] {
	return [...document.matchAll(/^##\s+(.*)$/gm)].map((match) =>
		(match[1] ?? "").trim(),
	);
}

// The shared part of a section is everything before its first capture scope.
function sharedPart(document: string, heading: string): string {
	const start = document.indexOf(`## ${heading}`);
	if (start === -1) return "";
	const remainder = document.slice(start + heading.length + 3);
	const scoped = remainder.search(/^### Capture /m);
	return scoped === -1 ? remainder : remainder.slice(0, scoped);
}

function colorRows(text: string): string[] {
	return [
		...text.matchAll(/^\|\s*([^|]+?)\s*\|\s*(#[0-9a-f]{3,8})\s*\|/gim),
	].map((match) => `${(match[1] ?? "").trim()}|${(match[2] ?? "").trim()}`);
}

describe("DESIGN.md structure", () => {
	it("emits each canonical section at most once for four captures", () => {
		const document = documentFor(viewsOf([1440, 390], ["light", "dark"]));
		const headings = h2Headings(document);
		expect(new Set(headings).size).toBe(headings.length);
		expect(validateDesignMd(document)).toEqual([]);
	});

	it("states a shared colour once instead of once per capture", () => {
		const document = documentFor(viewsOf([1440, 390], ["light", "dark"]));
		const rows = colorRows(sharedPart(document, "Foundations / Shared Tokens"));
		expect(rows.length).toBeGreaterThan(0);
		expect(new Set(rows).size).toBe(rows.length);
	});

	it("keeps different colours with different roles", () => {
		const base = buildDesignModel(FIXTURE);
		const [sample] = base.colors;
		if (!sample) throw new Error("Fixture needs a colour");
		const model = {
			...base,
			colors: [
				{
					...sample,
					name: "Brand accent",
					role: "Brand accent",
					value: "#097fe8",
				},
				{
					...sample,
					name: "Primary action",
					role: "Primary action",
					value: "#0075de",
				},
				{
					...sample,
					name: "Text accent",
					role: "Text accent",
					value: "#005bab",
				},
			],
		};
		const rows = colorRows(renderDesignMd(model));
		expect(rows).toEqual([
			"Brand accent|#097fe8",
			"Primary action|#0075de",
			"Text accent|#005bab",
		]);
	});

	it("keeps one base colour as several semantic aliases", () => {
		const base = buildDesignModel(FIXTURE);
		const [sample] = base.colors;
		if (!sample) throw new Error("Fixture needs a colour");
		const model = {
			...base,
			colors: [
				{
					...sample,
					name: "Brand accent",
					role: "Brand accent",
					value: "#097fe8",
				},
				{
					...sample,
					name: "Primary action",
					role: "Primary action",
					value: "#097fe8",
				},
			],
		};
		expect(colorRows(renderDesignMd(model))).toEqual([
			"Brand accent|#097fe8",
			"Primary action|#097fe8",
		]);
	});

	it("summarizes a shared component once, without losing its variants", () => {
		const single = documentFor(viewsOf([1440], ["light"]));
		const four = documentFor(viewsOf([1440, 390], ["light", "dark"]));
		const componentHeadings = (document: string) =>
			(document.split("## Component Specifications")[1] ?? "").split(
				"## Do's & Don'ts",
			)[0] ?? "";
		const singleNames = [...componentHeadings(single).matchAll(/^### (.+)$/gm)];
		const fourNames = [...componentHeadings(four).matchAll(/^### (.+)$/gm)];
		// Four captures must not multiply the component list; only real variant
		// differences may add a treatment.
		expect(fourNames.length).toBe(singleNames.length);
	});

	it("records desktop and mobile typography as measured differences", () => {
		const document = documentFor(
			viewsOf([1440, 390], ["light"], (view) => {
				if (view.viewport.width !== 390) return;
				for (const element of view.elements)
					if (element.role === "h1") element.properties["font-size"] = "32px";
			}),
		);
		expect(document).toContain("## Responsive Differences");
		const responsive = document.split("## Responsive Differences")[1] ?? "";
		expect(responsive).toMatch(/\|\s*h1\s*\|\s*font-size\s*\|/);
		expect(responsive).toContain("32px");
	});

	it("does not invent a dark theme that was never verified", () => {
		const document = documentFor(viewsOf([1440], ["light"]));
		expect(document).not.toContain("## Theme Differences");
	});

	it("reports a verified dark difference", () => {
		const document = documentFor(
			viewsOf([1440], ["light", "dark"], (view) => {
				if (view.colorScheme !== "dark") return;
				for (const element of view.elements)
					element.properties["background-color"] = "rgb(0, 0, 0)";
			}),
		);
		expect(document).toContain("## Theme Differences");
	});

	it("never repeats a guideline rule", () => {
		const document = documentFor(viewsOf([1440, 390], ["light", "dark"]));
		const section = document.split("## Do's & Don'ts")[1] ?? "";
		const rules = [...section.matchAll(/^-\s+(?!_evidence)(.*)$/gm)].map(
			(match) => (match[1] ?? "").trim(),
		);
		expect(rules.length).toBeGreaterThan(0);
		expect(new Set(rules).size).toBe(rules.length);
	});

	it("renders the same document twice for identical evidence", () => {
		const views = viewsOf([1440, 390], ["light", "dark"]);
		expect(documentFor(views)).toBe(documentFor(views));
	});

	it("honours the requested code reference without inventing the other", () => {
		const [first] = viewsOf([1440], ["light"]);
		if (!first) throw new Error("Fixture missing");
		const settings = designSettingsSchema.parse({
			viewport: "desktop",
			theme: "auto",
			depth: "standard",
			focus: "complete",
			codeReference: "css",
		});
		const css = renderDesignMd(buildDesignModel({ ...first, settings }));
		expect(css).toContain("### CSS Custom Properties");
		expect(css).not.toContain("### Tailwind v4");
		const tailwind = renderDesignMd(
			buildDesignModel({
				...first,
				settings: { ...settings, codeReference: "tailwind-v4" },
			}),
		);
		expect(tailwind).toContain("### Tailwind v4");
		expect(tailwind).not.toContain("### CSS Custom Properties");
	});

	it("never leaves imagery or layout headings outside the component section", () => {
		const model = buildDesignModel(FIXTURE);
		const document = renderDesignMd(model, {
			layoutPrinciples: ["Content is constrained to a single column."],
			imageryNotes: ["Illustration-led hero."],
		});
		const layoutIndex = document.indexOf("### Layout");
		expect(layoutIndex).toBeGreaterThan(-1);
		expect(
			document.lastIndexOf("## Component Specifications", layoutIndex),
		).toBeGreaterThan(-1);

		const tokensOnly = buildDesignModel({
			...FIXTURE,
			settings: designSettingsSchema.parse({
				viewport: "desktop",
				theme: "auto",
				depth: "standard",
				focus: "visual-tokens",
				codeReference: "both",
			}),
		});
		const tokenDocument = renderDesignMd(tokensOnly, {
			layoutPrinciples: ["Content is constrained to a single column."],
			imageryNotes: ["Illustration-led hero."],
		});
		expect(tokenDocument).not.toContain("### Layout");
		expect(tokenDocument).not.toContain("### Imagery & Iconography");
	});

	it("keeps every measured value in the document", () => {
		const model = buildDesignModel(FIXTURE);
		const document = renderDesignMd(model);
		const values = [
			...model.colors.map((token) => token.value),
			...model.radii.map((token) => token.value),
			...model.surfaces.map((surface) => surface.value),
		];
		for (const value of values) expect(document).toContain(value);
	});

	it("never conflicts inside one declared scope", () => {
		const document = documentFor(viewsOf([1440, 390], ["light"]));
		for (const block of document.matchAll(/```css\n([\s\S]*?)```/g)) {
			for (const scope of (block[1] ?? "").matchAll(/([^{}]+)\{([^}]*)\}/g)) {
				const names = [
					...(scope[2] ?? "").matchAll(/^\s*(--[\w-]+)\s*:/gm),
				].map((match) => match[1] ?? "");
				expect(new Set(names).size).toBe(names.length);
			}
		}
	});
});
