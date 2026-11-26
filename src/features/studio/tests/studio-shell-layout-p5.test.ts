import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
	assembleCanonicalShell,
	validateCanonicalShell,
} from "../services/studio-canonical-shell";
import type { StudioDesignBlueprint } from "../services/studio-design-blueprint";
import { enforceDesignSystemOnHtml } from "../services/studio-design-system-html";
import { extractDesignSystemTokens } from "../services/studio-design-tokens";
import { finalizeStudioFrameHtml } from "../services/studio-frame-finalize";
import {
	financeBlueprint,
	webSaaSBlueprint,
} from "./fixtures/studio-evaluation-fixtures";

const webShell = webSaaSBlueprint.canonicalShell;
const mobileShell = financeBlueprint.canonicalShell;
if (!webShell || !mobileShell)
	throw new Error("Canonical fixture shell missing");

const source = (body: string, css = "") =>
	`<!DOCTYPE html><html><head><style>${css}</style></head><body><main data-studio-content>${body}</main></body></html>`;
const publicBlueprint: StudioDesignBlueprint = {
	...webSaaSBlueprint,
	productIdentity: {
		...webSaaSBlueprint.productIdentity,
		layoutIntent: "public-website",
	},
	canonicalShell: { ...webShell, navigation: "top" },
	navigationContract: {
		...webSaaSBlueprint.navigationContract,
		ctaDestination: "settings",
	},
	layout: {
		gutter: 24,
		contentMaxWidth: 1200,
		spacing: [8, 16, 24],
		typography: [14, 18, 32],
	},
};

function render(
	blueprint: StudioDesignBlueprint,
	screen = "Dashboard",
	body = "<h1>Product value</h1>",
) {
	return new JSDOM(
		assembleCanonicalShell(source(body), blueprint, screen, null),
	);
}

function declarations(document: Document, selector: string) {
	return [...document.styleSheets]
		.flatMap((sheet) => [...sheet.cssRules])
		.filter(
			(rule): rule is CSSStyleRule =>
				"selectorText" in rule && rule.selectorText === selector,
		)
		.map((rule) => rule.style);
}

describe("P5 canonical product shells", () => {
	it("aligns public brand and one navigation in a common header without an account placeholder", () => {
		const dom = render(publicBlueprint);
		const { document } = dom.window;
		expect(
			document.querySelector("[data-studio-brand]")?.closest("header"),
		).toBe(
			document.querySelector("[data-studio-navigation]")?.closest("header"),
		);
		expect(document.querySelector("[data-studio-user]")).toBeNull();
		expect(document.querySelectorAll("[data-destination]")).toHaveLength(3);
		expect(
			document
				.querySelector("[data-studio-cta]")
				?.getAttribute("data-destination"),
		).toBe("settings");
		const menu = document.querySelector("details[data-studio-menu]");
		expect(menu?.querySelector("summary")?.textContent).toBe("Menu");
		expect(menu?.querySelector("[data-studio-navigation]")).not.toBeNull();
		expect(
			validateCanonicalShell(
				dom.window.document.documentElement.outerHTML,
				publicBlueprint,
				"Dashboard",
				null,
			),
		).toEqual([]);
		dom.window.close();
	});

	it("keeps desktop links visible even when native disclosure is closed", () => {
		const dom = render(publicBlueprint);
		const css =
			dom.window.document.querySelector("#studio-canonical-style")
				?.textContent ?? "";
		expect(css).toMatch(
			/@media\s*\(min-width:768px\)[\s\S]*?\[data-studio-menu\]::details-content\{content-visibility:visible\}/,
		);
		dom.window.close();
	});

	it("does not give public links the equal distribution reserved for mobile tabs", () => {
		const dom = render(publicBlueprint);
		const rules = declarations(
			dom.window.document,
			"[data-studio-navigation] > [data-destination]",
		);
		expect(rules.map((rule) => rule.getPropertyValue("flex"))).toEqual([
			"0 0 auto",
		]);
		expect(
			rules.map((rule) => rule.getPropertyValue("flex-direction")),
		).toEqual(["row"]);
		dom.window.close();
	});

	it.each([
		"sidebar",
		"top",
	] as const)("keeps web application %s navigation and contextual content controls", (navigation) => {
		const blueprint: StudioDesignBlueprint = {
			...webSaaSBlueprint,
			canonicalShell: { ...webShell, navigation },
		};
		const dom = render(
			blueprint,
			"Dashboard",
			"<header data-studio-page-header><h1>Dashboard</h1><button>New project</button></header><section>Metrics</section>",
		);
		expect(
			dom.window.document
				.querySelector("[data-studio-shell]")
				?.getAttribute("data-studio-layout"),
		).toBe("web-application");
		expect(
			dom.window.document.querySelector("[data-studio-content] button")
				?.textContent,
		).toBe("New project");
		expect(dom.window.document.querySelector("[data-studio-menu]")).toBeNull();
		expect(
			validateCanonicalShell(
				dom.window.document.documentElement.outerHTML,
				blueprint,
				"Dashboard",
				null,
			),
		).toEqual([]);
		dom.window.close();
	});

	it("uses explicit contextual roles for mobile back navigation and removes only repeated title text", () => {
		const blueprint: StudioDesignBlueprint = {
			...financeBlueprint,
			canonicalShell: {
				...mobileShell,
				activeDestinations: {
					...mobileShell.activeDestinations,
					"Kustomisasi Pesanan": "home",
				},
			},
			screenPlan: [
				...financeBlueprint.screenPlan,
				{
					name: "Kustomisasi Pesanan",
					role: "Configure milk",
					navigationRole: "contextual",
					order: 4,
				},
			],
		};
		const dom = render(
			blueprint,
			"Kustomisasi Pesanan",
			"<header data-studio-page-header><h1>Kustomisasi Pesanan</h1><p>Pilih susu</p><button>Simpan</button></header><h2>Milk options</h2>",
		);
		const { document } = dom.window;
		expect(
			document.querySelector("[data-studio-back]")?.getAttribute("aria-label"),
		).toBe("Kembali ke Beranda");
		expect(
			[...document.querySelectorAll("h1")].map(
				(element) => element.textContent,
			),
		).toEqual(["Kustomisasi Pesanan"]);
		expect(
			document.querySelector("[data-studio-content] button")?.textContent,
		).toBe("Simpan");
		expect(document.querySelector("[data-studio-content] p")?.textContent).toBe(
			"Pilih susu",
		);
		expect(document.querySelectorAll("[data-studio-navigation]")).toHaveLength(
			1,
		);
		expect(
			document
				.querySelector('nav [aria-current="page"]')
				?.getAttribute("data-destination"),
		).toBe("home");
		dom.window.close();
	});

	it("refreshes generated CSS idempotently while preserving body style blocks, assets and page-local anchors", () => {
		const raw = source(
			'<style>.hero{aspect-ratio:16/10}</style><nav aria-label="Sections"><a href="#work">Work</a></nav><section id="work"><img src="/api/studio/asset?id=1&amp;cap=2" alt="Selected work"></section>',
		);
		const input = {
			blueprint: publicBlueprint,
			screen: "Dashboard",
			tokens: null,
			viewport: "web",
		};
		const once = finalizeStudioFrameHtml(raw, input).html;
		expect(
			finalizeStudioFrameHtml(once, { ...input, mode: "refresh" }).html,
		).toBe(once);
		const document = new JSDOM(once).window.document;
		expect(
			[...document.querySelectorAll("style")].some(
				(style) => style.textContent === ".hero{aspect-ratio:16/10}",
			),
		).toBe(true);
		expect(
			document.querySelectorAll('nav[aria-label="Sections"]'),
		).toHaveLength(1);
		expect(document.querySelector("img")?.getAttribute("src")).toBe(
			"/api/studio/asset?id=1&cap=2",
		);
	});

	it("replaces stale blueprint tokens and does not duplicate font dependencies", () => {
		const tokens = extractDesignSystemTokens(
			"# DESIGN\nPrimary: #2563eb\nCanvas: #ffffff\nSurface: #ffffff\nText: #171717\nFont Family: Inter\nGoogle Fonts: https://fonts.googleapis.com/css2?family=Inter",
		);
		const first = enforceDesignSystemOnHtml(
			source("<p>Page</p>"),
			tokens,
			null,
			webSaaSBlueprint,
		);
		const updated: StudioDesignBlueprint = {
			...webSaaSBlueprint,
			designTokens: { ...webSaaSBlueprint.designTokens, primary: "#7c3aed" },
		};
		const next = enforceDesignSystemOnHtml(first, tokens, null, updated);
		const document = new JSDOM(next).window.document;
		expect(
			document.querySelector("#studio-blueprint-tokens")?.textContent,
		).toContain("--bp-primary:#7c3aed");
		expect(document.querySelectorAll("#studio-design-tokens")).toHaveLength(1);
		expect(enforceDesignSystemOnHtml(next, tokens, null, updated)).toBe(next);
	});
});

it("keeps local gutter, quantity geometry and media fit above DESIGN.md defaults", () => {
	const tokens = extractDesignSystemTokens(
		"# DESIGN\nPrimary: #2563eb\nCanvas: #ffffff\nSurface: #ffffff\nText: #171717\nFont Family: Inter\n",
	);
	const raw = source(
		'<div class="quantity"><button>+</button></div><figure class="product-photo" data-media="product" data-media-fit="contain"><img src="product.png" alt="Product"></figure>',
		"main{padding:8px}.quantity button{width:32px;height:32px;min-height:32px;padding:0}.product-photo{aspect-ratio:16/10}",
	);
	const html = enforceDesignSystemOnHtml(
		assembleCanonicalShell(raw, publicBlueprint, "Dashboard", tokens),
		tokens,
		null,
		publicBlueprint,
	);
	const dom = new JSDOM(html);
	const { document } = dom.window;
	const button = document.querySelector(".quantity button");
	const content = document.querySelector("main");
	if (!button || !content) throw new Error("Missing authored controls");
	expect(dom.window.getComputedStyle(button).width).toBe("32px");
	expect(dom.window.getComputedStyle(button).height).toBe("32px");
	expect(dom.window.getComputedStyle(button).minHeight).toBe("32px");
	expect(dom.window.getComputedStyle(button).padding).toBe("0px");
	expect(dom.window.getComputedStyle(content).padding).toBe("8px");
	expect(
		declarations(
			document,
			':where([data-media-fit="contain"], [data-media-fit="contain"] > img, [data-media-fit="contain"] > picture > img)',
		).map((style) => style.getPropertyValue("object-fit")),
	).toEqual(["contain"]);
	expect(html).not.toContain("!important");
	dom.window.close();
});
