import { describe, expect, it } from "vitest";
import { FIXTURE } from "@/lib/design-fixture";
import { buildDesignModel } from "../services/design-model";
import type {
	VisualElementEvidence,
	VisualEvidence,
} from "../services/design-visual-evidence";
import { inspectorFromEvidence } from "../utils/design-md-inspector";
import { renderDesignMd } from "../utils/design-md-render";
import {
	designCaptureScopes,
	designThemeOptions,
	designViewportOptions,
	scopedDesignMd,
	selectedViewIds,
	viewportKeyForWidth,
} from "../utils/design-view-contexts";

// The viewer resolves one measured context from the verified capture model:
// which viewports were really captured, which appearances the canvas really
// rendered, and which capture scopes belong to the selected context.

function mobileCapture(): VisualEvidence {
	const mobile = structuredClone(FIXTURE);
	mobile.viewport = { width: 390, height: 844 };
	mobile.colorScheme = "light";
	for (const element of mobile.elements) {
		if (element.role === "cta") element.properties["border-radius"] = "16px";
		if (element.role === "h1") element.properties["font-size"] = "32px";
	}
	return mobile;
}

function multiCapture(): VisualEvidence {
	return {
		...FIXTURE,
		colorScheme: "light",
		additionalViews: [mobileCapture()],
	};
}

function darkCapture(elements: VisualElementEvidence[]): VisualEvidence {
	return {
		version: 1,
		sourceUrl: "https://acme.example/pricing",
		capturedAt: FIXTURE.capturedAt,
		viewport: { width: 1440, height: 900 },
		colorScheme: "dark",
		elements: elements.map((element) => ({
			...element,
			properties: {
				...element.properties,
				"background-color": "rgb(0, 0, 0)",
				color: "rgb(255, 255, 255)",
			},
		})),
		fonts: [],
		limitations: [],
	};
}

// Requests the dark preference but the canvas still renders the light
// appearance, which is what the reported Notion captures did.
function requestedDarkCapture(): VisualEvidence {
	const requested = structuredClone(FIXTURE);
	requested.colorScheme = "dark";
	return requested;
}

function viewport(width: number, height: number): VisualEvidence {
	const capture = structuredClone(FIXTURE);
	capture.viewport = { width, height };
	return capture;
}

describe("measured viewport contexts", () => {
	it("offers no switcher for a single captured viewport", () => {
		expect(designViewportOptions(buildDesignModel(FIXTURE))).toEqual([]);
	});

	it("offers only the viewports that were really captured", () => {
		const model = buildDesignModel(multiCapture());
		const options = designViewportOptions(model);
		expect(options.map((option) => option.label)).toEqual([
			"Desktop",
			"Mobile",
		]);
		expect(options.map((option) => option.detail)).toEqual([
			"1440x900",
			"390x844",
		]);
		expect(options[0]?.viewIds).toEqual([1]);
		expect(options[1]?.viewIds).toEqual([2]);
	});

	it("names a 390px capture Mobile and never invents a tablet", () => {
		expect(viewportKeyForWidth(390)).toBe("mobile");
		expect(viewportKeyForWidth(834)).toBe("tablet");
		expect(viewportKeyForWidth(1440)).toBe("desktop");
		const evidence = {
			...viewport(1440, 900),
			additionalViews: [viewport(390, 844)],
		};
		expect(
			designViewportOptions(buildDesignModel(evidence)).map(
				(option) => option.label,
			),
		).toEqual(["Desktop", "Mobile"]);
		const withTablet = {
			...viewport(1440, 900),
			additionalViews: [viewport(834, 1112), viewport(390, 844)],
		};
		expect(
			designViewportOptions(buildDesignModel(withTablet)).map(
				(option) => option.label,
			),
		).toEqual(["Desktop", "Tablet", "Mobile"]);
	});

	it("selects only the chosen capture scope", () => {
		const model = buildDesignModel(multiCapture());
		expect(selectedViewIds(model, { viewport: null, theme: null })).toEqual([
			1, 2,
		]);
		expect(selectedViewIds(model, { viewport: "mobile", theme: null })).toEqual(
			[2],
		);
		expect(selectedViewIds(model, { viewport: "tablet", theme: null })).toEqual(
			[],
		);
	});
});

describe("verified observed themes", () => {
	it("offers both themes only when the canvas really rendered both", () => {
		const model = buildDesignModel(multiCapture());
		expect(designThemeOptions(model, "desktop")).toEqual([]);
	});

	it("never fabricates a dark option from a requested dark preference", () => {
		const requestedDark = {
			...FIXTURE,
			additionalViews: [requestedDarkCapture()],
		};
		// The second capture requested dark but the canvas still rendered light.
		expect(
			buildDesignModel(requestedDark).views?.map((view) => view.observedTheme),
		).toEqual(["light", "light"]);
		const model = buildDesignModel(requestedDark);
		expect(designThemeOptions(model, "desktop")).toEqual([]);
		expect(
			scopedDesignMd(renderDesignMd(model), designCaptureScopes(model), {
				viewport: null,
				theme: "dark",
			}),
		).toBeUndefined();
	});

	it("offers the theme switcher when both appearances were measured", () => {
		const dark = darkCapture(FIXTURE.elements);
		const evidence: VisualEvidence = {
			...FIXTURE,
			colorScheme: "light",
			additionalViews: [dark],
		};
		const model = buildDesignModel(evidence);
		expect(designThemeOptions(model, "desktop")).toEqual(["light", "dark"]);
		expect(
			selectedViewIds(model, { viewport: "desktop", theme: "dark" }),
		).toEqual([2]);
	});
});

describe("capture scope filtering", () => {
	it("drops out-of-context scopes and keeps tables and code fences intact", () => {
		const model = buildDesignModel(multiCapture());
		const document = renderDesignMd(model);
		const scopes = designCaptureScopes(model);
		const desktopScope = scopes[0]?.label ?? "";
		const mobileScope = scopes[1]?.label ?? "";
		expect(desktopScope).toMatch(/^Capture 1: 1440x900/);
		expect(mobileScope).toMatch(/^Capture 2: 390x844/);
		const mobile = scopedDesignMd(document, scopes, {
			viewport: "mobile",
			theme: null,
		});
		expect(mobile).toBeDefined();
		expect(mobile).toContain(`### ${mobileScope}`);
		expect(mobile).not.toContain(`### ${desktopScope}`);
		// Shared foundations and every other section survive the filter.
		for (const heading of [
			"## Foundations / Shared Tokens",
			"### Colors & Semantic Roles",
			"## Component Specifications",
			"## Coverage & Important Limitations",
		])
			expect(mobile).toContain(heading);
		const fences = (value: string) => value.match(/```/g)?.length ?? 0;
		expect(fences(mobile ?? "") % 2).toBe(0);
		expect(fences(mobile ?? "")).toBeGreaterThan(0);
		// The canonical document is never modified by viewing.
		expect(document).toContain(`### ${desktopScope}`);
		expect(document).toContain(`### ${mobileScope}`);
	});

	it("keeps a heading inside a code fence from starting a capture scope", () => {
		const document = [
			"# Acme - Style Reference",
			"",
			"## Foundations / Shared Tokens",
			"",
			"### Colors & Semantic Roles",
			"",
			"| Role | Value |",
			"| --- | --- |",
			"| Surface | #ffffff |",
			"",
			"```css",
			"/* ### Capture 9: 1024x768, browser preference light */",
			"```",
			"",
			"### Capture 1: 1440x900, browser preference light",
			"",
			"Desktop tokens.",
			"",
			"### Capture 2: 390x844, browser preference light",
			"",
			"Mobile tokens.",
		].join("\n");
		const filtered = scopedDesignMd(
			document,
			[
				{
					label: "Capture 1: 1440x900, browser preference light",
					theme: "light",
					viewport: "desktop",
				},
				{
					label: "Capture 2: 390x844, browser preference light",
					theme: "light",
					viewport: "mobile",
				},
			],
			{ viewport: "mobile", theme: null },
		);
		expect(filtered).toBeDefined();
		expect(filtered).toContain("Mobile tokens.");
		expect(filtered).not.toContain("Desktop tokens.");
		expect(filtered).toContain("| Surface | #ffffff |");
		expect(filtered).toContain(
			"/* ### Capture 9: 1024x768, browser preference light */",
		);
	});

	it("scopes nothing when no capture was measured or the context covers all", () => {
		const model = buildDesignModel(multiCapture());
		const document = renderDesignMd(model);
		const scopes = designCaptureScopes(model);
		expect(
			scopedDesignMd(document, [], { viewport: null, theme: null }),
		).toBeUndefined();
		expect(
			scopedDesignMd(document, scopes, { viewport: null, theme: null }),
		).toBeUndefined();
	});
});

describe("inspector context model", () => {
	it("declares a colour measured in every capture once", () => {
		const evidence = multiCapture();
		const document = renderDesignMd(buildDesignModel(evidence));
		const model = inspectorFromEvidence(evidence, document);
		const values = model?.colors.map((color) => color.value) ?? [];
		expect(values).toEqual([
			"#ffffff",
			"#101828",
			"#155eef",
			"#667085",
			"#f8fafc",
		]);
		expect(
			model?.colors.find((color) => color.value === "#155eef")?.captures,
		).toBe(2);
		expect(new Set(values).size).toBe(values.length);
	});

	it("never merges one colour into a different semantic role", () => {
		// The same blue is body text in one capture and an action fill in the
		// other: same value, different measured role, so both stay.
		const desktop = structuredClone(FIXTURE);
		const textCapture: VisualEvidence = {
			...desktop,
			elements: desktop.elements
				.filter((element) => ["canvas", "body"].includes(element.role))
				.map((element) =>
					element.role === "body"
						? {
								...element,
								properties: {
									...element.properties,
									color: "rgb(21, 94, 239)",
								},
							}
						: element,
				),
		};
		const actionCapture: VisualEvidence = {
			...desktop,
			viewport: { width: 390, height: 844 },
			elements: desktop.elements.filter((element) =>
				["canvas", "cta"].includes(element.role),
			),
		};
		const evidence = { ...textCapture, additionalViews: [actionCapture] };
		const document = renderDesignMd(buildDesignModel(evidence));
		const model = inspectorFromEvidence(evidence, document);
		const cobalt = (model?.colors ?? []).filter(
			(color) => color.value === "#155eef",
		);
		expect(cobalt).toHaveLength(2);
		expect(new Set(cobalt.map((color) => color.role)).size).toBe(2);
	});

	it("declares a component measured in every capture once", () => {
		const evidence = multiCapture();
		const document = renderDesignMd(buildDesignModel(evidence));
		const model = inspectorFromEvidence(evidence, document);
		expect(
			model?.components.filter(
				(component) => component.name === "Buttons and CTAs",
			),
		).toHaveLength(1);
		expect(
			model?.components.find(
				(component) => component.name === "Buttons and CTAs",
			)?.captures,
		).toBe(2);
	});

	it("shows only the selected capture differences for the chosen context", () => {
		const evidence = multiCapture();
		const document = renderDesignMd(buildDesignModel(evidence));
		const mobile = inspectorFromEvidence(evidence, document, { viewIds: [2] });
		expect(mobile?.typography.map((entry) => entry.size)).toEqual([
			"16px",
			"32px",
		]);
		const desktop = inspectorFromEvidence(evidence, document, { viewIds: [1] });
		expect(desktop?.typography.map((entry) => entry.size)).toEqual([
			"16px",
			"64px",
		]);
	});

	it("handles missing evidence without inventing a context", () => {
		for (const value of [undefined, null, {}, "not evidence", []]) {
			const model = inspectorFromEvidence(
				value,
				"# Legacy - Style Reference\n",
			);
			expect(model).toBeNull();
		}
	});
});
