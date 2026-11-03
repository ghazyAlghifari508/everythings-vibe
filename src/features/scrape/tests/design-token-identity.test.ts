import { describe, expect, it } from "vitest";
import { FIXTURE } from "@/lib/design-fixture";
import { buildDesignModel } from "../services/design-model";
import { inferTheme } from "../services/design-model-observation";
import { partitionDesignViews } from "../services/design-shared-context";
import type {
	VisualElementEvidence,
	VisualEvidence,
} from "../services/design-visual-evidence";
import { normalizeColor } from "../utils/design-color-parse";
import { tokenEntries } from "../utils/design-md-css";
import { scopedDeclarations } from "../utils/design-md-css-scopes";
import { renderDesignMd } from "../utils/design-md-render";
import { classifyColors } from "../utils/design-normalize-color";

describe("design token identity & cross-capture consistency (p1 specification)", () => {
	// Scenario 1: Satu capture desktop light
	it("Scenario 1: single desktop light capture produces valid root declarations without scoped queries", () => {
		const desktop = structuredClone(FIXTURE);
		const model = buildDesignModel(desktop);

		expect(model.views).toBeUndefined();
		expect(model.theme).toBe("light");
		expect(model.capturedViews).toHaveLength(1);

		const markdown = renderDesignMd(model);
		expect(markdown).toContain(":root {");
		expect(markdown).toContain("@theme {");
		expect(markdown).not.toContain("@media");
		expect(markdown).not.toContain("prefers-color-scheme: dark");
	});

	// Scenario 2: Desktop + mobile dengan nilai semantik sama
	it("Scenario 2: desktop + mobile with identical semantic values produce shared tokens without duplicate overrides", () => {
		const desktop = structuredClone(FIXTURE);
		const mobile: VisualEvidence = {
			...structuredClone(FIXTURE),
			viewport: { width: 390, height: 844 },
		};

		const model = buildDesignModel({ ...desktop, additionalViews: [mobile] });
		const views = model.views;
		if (!views || views.length < 2) throw new Error("Expected two views");

		const { shared, specific } = partitionDesignViews(views);
		// Identical colors should be partitioned into shared tokens
		expect(shared.colors.length).toBeGreaterThan(0);
		expect(specific.every((view) => view.model.colors.length === 0)).toBe(true);

		// Scoped declarations for the mobile view should not have color overrides
		const mobileScope = scopedDeclarations(
			views[0]?.model ?? model,
			views[1]?.model ?? model,
			views[1]?.label ?? "Mobile",
		);
		const colorOverrides = mobileScope.entries.filter(
			(e) => e.group === "color",
		);
		expect(colorOverrides).toEqual([]);
	});

	// Scenario 3: Desktop + mobile dengan nilai semantik berbeda
	it("Scenario 3: desktop + mobile with distinct semantic values generate verified responsive override with matching token identity", () => {
		const desktop = structuredClone(FIXTURE);
		const mobile: VisualEvidence = {
			...structuredClone(FIXTURE),
			viewport: { width: 390, height: 844 },
			elements: structuredClone(FIXTURE.elements).map((el) => {
				if (el.role === "cta") {
					return {
						...el,
						properties: {
							...el.properties,
							"background-color": "rgb(0, 68, 204)", // changed button color on mobile
						},
						variables: { "--color-primary": "rgb(0, 68, 204)" },
					};
				}
				return el;
			}),
		};

		const model = buildDesignModel({ ...desktop, additionalViews: [mobile] });
		const views = model.views;
		if (!views || views.length < 2) throw new Error("Expected two views");

		const baseModel = views[0]?.model ?? model;
		const mobileModel = views[1]?.model ?? model;

		const mobileScope = scopedDeclarations(
			baseModel,
			mobileModel,
			views[1]?.label ?? "Mobile",
		);

		expect(mobileScope.query).toContain("(max-width: 390px)");
		const primaryOverride = mobileScope.entries.find(
			(e) => e.name === "--color-primary-action",
		);
		expect(primaryOverride).toBeDefined();
		expect(primaryOverride?.value).toBe("#0044cc");

		const markdown = renderDesignMd(model);
		expect(markdown).toContain("@media (max-width: 390px)");
		expect(markdown).toContain("--color-primary-action: #0044cc");
	});

	// Scenario 4: Light + dark yang benar-benar berbeda dan terverifikasi
	it("Scenario 4: verified light + dark captures produce prefers-color-scheme dark overrides", () => {
		const desktopLight = structuredClone(FIXTURE);
		const desktopDark: VisualEvidence = {
			...structuredClone(FIXTURE),
			colorScheme: "dark",
			elements: structuredClone(FIXTURE.elements).map((el) => {
				if (el.role === "canvas") {
					return {
						...el,
						properties: {
							...el.properties,
							"background-color": "rgb(18, 18, 18)", // verified dark canvas
							color: "rgb(248, 250, 252)",
						},
					};
				}
				if (el.role === "h1") {
					return {
						...el,
						properties: {
							...el.properties,
							color: "rgb(248, 250, 252)",
						},
					};
				}
				return el;
			}),
		};

		expect(inferTheme(desktopLight)).toBe("light");
		expect(inferTheme(desktopDark)).toBe("dark");

		const model = buildDesignModel({
			...desktopLight,
			additionalViews: [desktopDark],
		});
		const views = model.views;
		if (!views || views.length < 2) throw new Error("Expected two views");

		expect(views[0]?.observedTheme).toBe("light");
		expect(views[1]?.observedTheme).toBe("dark");

		const darkScope = scopedDeclarations(
			views[0]?.model ?? model,
			views[1]?.model ?? model,
			views[1]?.label ?? "Dark Capture",
		);
		expect(darkScope.query).toContain("(prefers-color-scheme: dark)");

		const markdown = renderDesignMd(model);
		expect(markdown).toContain("@media (prefers-color-scheme: dark)");
	});

	// Scenario 5: Dark requested tetapi observed light
	it("Scenario 5: dark requested preference with observed light canvas claims no dark tokens and produces no dark query", () => {
		const desktopLight = structuredClone(FIXTURE);
		const darkRequestedLightObserved: VisualEvidence = {
			...structuredClone(FIXTURE),
			colorScheme: "dark", // dark preference requested in browser
			// Canvas remains light (white)
		};

		expect(inferTheme(darkRequestedLightObserved)).toBe("light");

		const model = buildDesignModel({
			...desktopLight,
			additionalViews: [darkRequestedLightObserved],
		});
		const views = model.views;
		if (!views || views.length < 2) throw new Error("Expected two views");

		expect(views[1]?.observedTheme).toBe("light");

		const scope = scopedDeclarations(
			views[0]?.model ?? model,
			views[1]?.model ?? model,
			views[1]?.label ?? "Capture 2",
		);
		expect(scope.query ?? "").not.toContain("dark");

		const markdown = renderDesignMd(model);
		expect(markdown).not.toContain("prefers-color-scheme: dark");
		expect(markdown).toContain("A dark browser preference was requested");
	});

	// Scenario 6: Empat capture kombinasi 1440×900/390×844 dan light/dark preference
	it("Scenario 6: four-capture combination (Notion pattern) prevents token collision and dark leakage", () => {
		const c1: VisualEvidence = {
			...structuredClone(FIXTURE),
			viewport: { width: 1440, height: 900 },
			colorScheme: "light",
		};
		const c2: VisualEvidence = {
			...structuredClone(FIXTURE),
			viewport: { width: 1440, height: 900 },
			colorScheme: "dark",
		};
		const c3: VisualEvidence = {
			...structuredClone(FIXTURE),
			viewport: { width: 390, height: 844 },
			colorScheme: "light",
			elements: [
				...structuredClone(FIXTURE.elements),
				{
					selector: "body > div.mobile-accent",
					role: "element",
					text: "Accent note",
					width: 300,
					height: 40,
					properties: {
						"background-color": "rgb(208, 244, 216)", // #d0f4d8
						color: "rgb(0, 0, 0)",
					},
				},
			],
		};
		const c4: VisualEvidence = {
			...structuredClone(c3),
			viewport: { width: 390, height: 844 },
			colorScheme: "dark",
		};

		const model = buildDesignModel({
			...c1,
			additionalViews: [c2, c3, c4],
		});

		const markdown = renderDesignMd(model);
		// No dark media query because appearance remained light
		expect(markdown).not.toContain("prefers-color-scheme: dark");
		// Token identity for green #d0f4d8 must never overwrite black text under --color-measured-1
		expect(markdown).not.toContain("--color-measured-1: #d0f4d8");
		expect(markdown).not.toContain("--color-measured-1:");
	});

	// Scenario 7: Dua warna biru berbeda dengan role berbeda
	it("Scenario 7: distinct blue shades with different roles maintain separate semantic tokens", () => {
		const elements: VisualElementEvidence[] = [
			{
				selector: "button.brand-btn",
				role: "cta",
				text: "Brand",
				width: 100,
				height: 40,
				properties: { "background-color": "#097fe8" },
				variables: { "--color-brand": "#097fe8" },
			},
			{
				selector: "button.primary-btn",
				role: "cta",
				text: "Action",
				width: 100,
				height: 40,
				properties: { "background-color": "#0075de" },
				variables: { "--color-primary": "#0075de" },
			},
			{
				selector: "p.blue-text",
				role: "body",
				text: "Text",
				width: 100,
				height: 20,
				properties: { color: "#005bab" },
			},
			{
				selector: "div.blue-surface",
				role: "section",
				text: "Surface",
				width: 100,
				height: 100,
				properties: { "background-color": "#1313ba" },
			},
		];

		const classified = classifyColors(elements);
		const hexes = classified.map((c) => c.token.color.hex);
		expect(hexes).toContain("#097fe8");
		expect(hexes).toContain("#0075de");
		expect(hexes).toContain("#005bab");
		expect(hexes).toContain("#1313ba");
		expect(new Set(hexes).size).toBe(4); // None merged

		const model = buildDesignModel({
			...structuredClone(FIXTURE),
			elements,
		});
		const entries = tokenEntries(model);
		const names = entries.map((e) => e.name);
		expect(new Set(names).size).toBe(entries.length); // All unique names
	});

	// Scenario 8: Warna identik dalam beberapa komponen dengan penggunaan yang berbeda
	it("Scenario 8: identical color in multiple components tracks usage contexts without conflation", () => {
		const elements: VisualElementEvidence[] = [
			{
				selector: "html > body",
				role: "canvas",
				text: "",
				width: 1440,
				height: 900,
				properties: { "background-color": "#ffffff", color: "#101828" },
			},
			{
				selector: "button.cta",
				role: "cta",
				text: "Submit",
				width: 120,
				height: 40,
				properties: {
					"background-color": "#155eef",
					color: "#ffffff", // white text on action
				},
			},
			{
				selector: "nav.main-nav",
				role: "nav",
				text: "Menu",
				width: 1200,
				height: 60,
				properties: { "background-color": "#ffffff" }, // white nav surface
			},
		];

		const classified = classifyColors(elements);
		const whiteToken = classified.find((c) => c.token.color.hex === "#ffffff");
		expect(whiteToken).toBeDefined();
		expect(whiteToken?.token.usage.contexts).toContain(
			"canvas:background-color",
		);
		expect(whiteToken?.token.usage.contexts).toContain("cta:color");
		expect(whiteToken?.token.usage.contexts).toContain("nav:background-color");
		expect(whiteToken?.roleLabel).toBe("Text and surface");
	});

	// Scenario 9: Urutan capture dibalik: hasil canonical identity tetap stabil
	it("Scenario 9: reversing capture order preserves stable canonical token identities", () => {
		const captureA: VisualEvidence = {
			...structuredClone(FIXTURE),
			viewport: { width: 1440, height: 900 },
			elements: [
				...structuredClone(FIXTURE.elements),
				{
					selector: "div.box-1",
					role: "element",
					text: "One",
					width: 100,
					height: 100,
					properties: { color: "#112233" },
				},
			],
		};
		const captureB: VisualEvidence = {
			...structuredClone(FIXTURE),
			viewport: { width: 390, height: 844 },
			elements: [
				...structuredClone(FIXTURE.elements),
				{
					selector: "div.box-1",
					role: "element",
					text: "One",
					width: 100,
					height: 100,
					properties: { color: "#112233" },
				},
			],
		};

		const forwardModel = buildDesignModel({
			...captureA,
			additionalViews: [captureB],
		});
		const reverseModel = buildDesignModel({
			...captureB,
			additionalViews: [captureA],
		});

		const forwardEntries = tokenEntries(forwardModel);
		const reverseEntries = tokenEntries(reverseModel);

		// Find token for #112233 in both
		const forwardToken = forwardEntries.find((e) => e.value === "#112233");
		const reverseToken = reverseEntries.find((e) => e.value === "#112233");

		expect(forwardToken?.name).toBeDefined();
		expect(forwardToken?.name).toBe(reverseToken?.name);
	});

	// Scenario 10: CSS/Tailwind tidak mengeluarkan nama token yang sama untuk semantik berbeda
	it("Scenario 10: CSS does not emit identical token names for distinct semantics", () => {
		const desktop = buildDesignModel({
			...structuredClone(FIXTURE),
			elements: [
				{
					selector: "p.black-text",
					role: "body",
					text: "Black",
					width: 200,
					height: 20,
					properties: { color: "rgba(0, 0, 0, 0.898)" },
				},
			],
		});

		const mobile = buildDesignModel({
			...structuredClone(FIXTURE),
			viewport: { width: 390, height: 844 },
			elements: [
				{
					selector: "div.green-accent",
					role: "card",
					text: "Green",
					width: 200,
					height: 50,
					properties: { "background-color": "#d0f4d8" },
				},
			],
		});

		const desktopEntries = tokenEntries(desktop);
		const mobileEntries = tokenEntries(mobile);

		const desktopColorToken = desktopEntries.find(
			(e) => e.value === "rgba(0, 0, 0, 0.898)",
		);
		const mobileColorToken = mobileEntries.find((e) => e.value === "#d0f4d8");

		expect(desktopColorToken?.name).not.toBe(mobileColorToken?.name);
	});

	// Scenario 11: Unclassified colors tetap terjaga tanpa alias palsu
	it("Scenario 11: unclassified colors retain stable measured alias without fake brand roles", () => {
		const model = buildDesignModel({
			...structuredClone(FIXTURE),
			elements: [
				{
					selector: "span.isolated",
					role: "element",
					text: "Unclassified",
					width: 50,
					height: 20,
					properties: { color: "#8a2be2" },
				},
			],
		});

		const color = model.colors.find((c) => c.value === "#8a2be2");
		expect(color).toBeDefined();
		expect(color?.roleClass).toBe("unknown");
		expect(color?.confidence).toBe("unknown");

		const entries = tokenEntries(model);
		const entry = entries.find((e) => e.value === "#8a2be2");
		expect(entry?.name).toBe("--color-measured-8a2be2");
	});

	// Scenario 12: Tidak ada CSS dark override saat tidak ada observed dark theme
	it("Scenario 12: no CSS dark override emitted when dark theme is not observed", () => {
		const light = structuredClone(FIXTURE);
		const darkPreferenceOnly = {
			...structuredClone(FIXTURE),
			colorScheme: "dark" as const,
		};

		const model = buildDesignModel({
			...light,
			additionalViews: [darkPreferenceOnly],
		});
		const markdown = renderDesignMd(model);

		expect(markdown).not.toMatch(/@media[^{]*prefers-color-scheme:\s*dark/);
	});

	// Scenario 13: Alpha dan format warna tidak hilang selama normalisasi
	it("Scenario 13: alpha precision and color format are preserved during normalization", () => {
		const c1 = normalizeColor("rgba(0, 0, 0, 0.898)");
		expect(c1).not.toBeNull();
		expect(c1?.a).toBe(0.898);
		expect(c1?.hasAlpha).toBe(true);
		expect(c1?.css).toBe("rgba(0, 0, 0, 0.898)");

		const c2 = normalizeColor("rgba(21, 94, 239, 0.5)");
		expect(c2).not.toBeNull();
		expect(c2?.a).toBe(0.5);
		expect(c2?.hasAlpha).toBe(true);
		expect(c2?.css).toBe("rgba(21, 94, 239, 0.5)");

		const c3 = normalizeColor("#ffffff80");
		expect(c3).not.toBeNull();
		expect(c3?.hasAlpha).toBe(true);
		expect(c3?.hex).toBe("#ffffff");
	});
});
