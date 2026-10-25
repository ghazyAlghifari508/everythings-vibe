import { describe, expect, it } from "vitest";
import { FIXTURE } from "@/lib/design-fixture";
import { buildDesignModel } from "../services/design-model";
import { buildSynthesisPayload } from "../services/design-synthesis";
import { designSettingsSchema } from "../types/scrape-contract";
import { inspectorFromEvidence } from "../utils/design-md-inspector";
import { renderDesignMd, validateDesignMd } from "../utils/design-md-render";

function captures() {
	const desktop = structuredClone(FIXTURE);
	desktop.colorScheme = "light";
	const mobile = structuredClone(desktop);
	mobile.viewport = { width: 390, height: 844 };
	for (const element of mobile.elements) {
		if (element.role === "cta") element.properties["border-radius"] = "16px";
		if (element.role === "h1") element.properties["font-size"] = "32px";
	}
	return { ...desktop, additionalViews: [mobile] };
}

describe("semantic multi-capture normalization", () => {
	for (const viewport of ["desktop", "mobile", "both"] as const)
		for (const theme of ["auto", "light", "dark", "both"] as const)
			for (const depth of ["standard", "detailed"] as const)
				for (const focus of [
					"complete",
					"visual-tokens",
					"components",
				] as const)
					for (const codeReference of ["css", "tailwind-v4", "both"] as const)
						it(`${viewport}/${theme}/${depth}/${focus}/${codeReference}`, () => {
							const evidence = structuredClone(FIXTURE);
							evidence.settings = designSettingsSchema.parse({
								viewport,
								theme,
								depth,
								focus,
								codeReference,
							});
							const widths =
								viewport === "both"
									? [1440, 390]
									: [viewport === "mobile" ? 390 : 1440];
							const schemes =
								theme === "both" ? (["light", "dark"] as const) : [theme];
							const views = widths.flatMap((width) =>
								schemes.map((colorScheme) => ({
									...structuredClone(FIXTURE),
									viewport: { width, height: 900 },
									colorScheme,
								})),
							);
							const first = views[0];
							if (!first) throw new Error("Missing fixture view");
							const input = {
								...first,
								settings: evidence.settings,
								additionalViews: views.slice(1),
							};
							const model = buildDesignModel(input);
							const document = renderDesignMd(model, {
								enrichmentUnavailable: true,
							});
							expect(validateDesignMd(document)).toEqual([]);
							expect(document).not.toMatch(/nth-child\(/);
							expect(model.capturedViews).toHaveLength(
								widths.length * schemes.length,
							);
							expect(document.includes(":root {")).toBe(
								codeReference !== "tailwind-v4",
							);
							expect(document.includes("@theme {")).toBe(
								codeReference !== "css",
							);
							expect(document.includes("## Components")).toBe(
								focus !== "visual-tokens",
							);
							expect(inspectorFromEvidence(input, document)?.verification).toBe(
								"observed",
							);
						});
	it("keeps independent normalized contexts and raw evidence unchanged", () => {
		const evidence = captures();
		const original = structuredClone(evidence);
		const model = buildDesignModel(evidence);
		expect(model.views).toHaveLength(2);
		expect(
			model.views?.[0]?.model.radii.some((token) => token.value === "16px"),
		).toBe(false);
		expect(
			model.views?.[1]?.model.radii.some((token) => token.value === "16px"),
		).toBe(true);
		expect(evidence).toEqual(original);
		expect(JSON.parse(buildSynthesisPayload(model)).viewContexts).toHaveLength(
			2,
		);
	});
	it("compares matched observations without exposing selectors in user output", () => {
		const model = buildDesignModel(captures());
		const changes =
			model.comparisons?.filter((entry) => entry.kind === "responsive") ?? [];
		expect(
			changes.some(
				(entry) =>
					entry.role === "cta" &&
					entry.property === "border-radius" &&
					entry.values.map((value) => value.value).join(",") === "8px,16px",
			),
		).toBe(true);
		const radiusChange = changes.find(
			(entry) => entry.role === "cta" && entry.property === "border-radius",
		);
		expect(radiusChange?.provenance).toHaveLength(4);
		for (const reference of radiusChange?.provenance ?? []) {
			const evidence = captures();
			const view = [evidence, ...evidence.additionalViews][
				reference.capture - 1
			];
			expect(view?.elements[reference.element]?.role).toBe("cta");
		}
		const document = renderDesignMd(model);
		const inspector = inspectorFromEvidence(captures(), document);
		expect(
			inspector?.typography.some(
				(entry) => entry.role.includes("390x844") && entry.size === "32px",
			),
		).toBe(true);
		expect(
			inspector?.components.some(
				(entry) =>
					entry.name.includes("390x844") && entry.description.includes("16px"),
			),
		).toBe(true);
		expect(document).not.toMatch(/nth-child\(|html\s*>|\[capture \d/);
		expect(document).toContain("Responsive Guidelines");
	});
	it("does not compare changed content or unrelated themes as responsive overrides", () => {
		const evidence = captures();
		const mobile = evidence.additionalViews[0];
		if (!mobile) throw new Error("Missing mobile fixture");
		for (const element of mobile.elements) element.text = "Different content";
		expect(buildDesignModel(evidence).comparisons).toEqual([]);
		mobile.colorScheme = "dark";
		expect(buildDesignModel(evidence).comparisons).toEqual([]);
	});
	it("compares empty canvas paints without requiring product copy", () => {
		const evidence = structuredClone(FIXTURE);
		evidence.colorScheme = "light";
		evidence.elements = evidence.elements.filter(
			(element) => element.role === "canvas",
		);
		for (const element of evidence.elements) element.text = "";
		const dark = structuredClone(evidence);
		dark.colorScheme = "dark";
		for (const element of dark.elements)
			element.properties["background-color"] = "rgb(0, 0, 0)";
		const model = buildDesignModel({ ...evidence, additionalViews: [dark] });
		expect(
			model.comparisons?.some(
				(entry) =>
					entry.role === "canvas" &&
					entry.property === "background-color" &&
					entry.kind === "theme",
			),
		).toBe(true);
		expect(validateDesignMd(renderDesignMd(model))).toEqual([]);
	});

	it("reports measured theme differences only within the same viewport", () => {
		const evidence = captures();
		const dark = structuredClone(FIXTURE);
		dark.colorScheme = "dark";
		for (const element of dark.elements) {
			element.properties["background-color"] = "rgb(0, 0, 0)";
			element.properties.color = "rgb(255, 255, 255)";
		}
		evidence.additionalViews = [dark];
		const model = buildDesignModel(evidence);
		expect(model.views?.map((view) => view.observedTheme)).toEqual([
			"light",
			"dark",
		]);
		expect(
			model.comparisons?.some(
				(entry) =>
					entry.kind === "theme" && entry.property === "background-color",
			),
		).toBe(true);
		expect(
			model.comparisons?.some((entry) => entry.kind === "responsive"),
		).toBe(false);
		expect(validateDesignMd(renderDesignMd(model))).toEqual([]);
	});

	it("does not invent a theme variation when browser preferences yield identical measurements", () => {
		const evidence = captures();
		const second = structuredClone(FIXTURE);
		second.colorScheme = "dark";
		evidence.additionalViews = [second];
		const model = buildDesignModel(evidence);
		expect(
			model.comparisons?.filter((entry) => entry.kind === "theme"),
		).toEqual([]);
		expect(model.views?.map((view) => view.observedTheme)).toEqual([
			"light",
			"light",
		]);
	});
});
