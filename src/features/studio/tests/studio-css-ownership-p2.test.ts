import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
	assembleCanonicalShell,
	validateCanonicalShell,
} from "../services/studio-canonical-shell";
import {
	STUDIO_COMPONENT_PATTERNS,
	STUDIO_COMPONENT_STYLE,
} from "../services/studio-component-patterns";
import type { StudioDesignBlueprint } from "../services/studio-design-blueprint";
import {
	listExternalDependencies,
	rewriteBundledAssets,
} from "../services/studio-export";
import { finalizeStudioFrameHtml } from "../services/studio-frame-finalize";
import {
	financeBlueprint,
	travelBlueprint,
	webSaaSBlueprint,
} from "./fixtures/studio-evaluation-fixtures";

const doc = (html: string) => new JSDOM(html).window.document;

const mobileDoc = (content: string, css = "") =>
	`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><main data-studio-content>${content}</main></body></html>`;

const webDoc = (content: string, css = "") =>
	`<!DOCTYPE html><html><head><style>${css}</style></head><body><main data-studio-content>${content}</main></body></html>`;

function assemble(
	blueprint: StudioDesignBlueprint,
	screen: string,
	html: string,
) {
	return assembleCanonicalShell(html, blueprint, screen, null);
}

function canonicalCss(html: string) {
	return doc(html).querySelector("#studio-canonical-style")?.textContent ?? "";
}

function patternStyle(): CSSStyleSheet {
	const document = doc(
		`<html><head>${STUDIO_COMPONENT_STYLE}</head><body></body></html>`,
	);
	const sheet = document.querySelector<HTMLStyleElement>(
		"#studio-component-patterns",
	)?.sheet;
	if (!sheet) throw new Error("Component pattern stylesheet missing.");
	return sheet as CSSStyleSheet;
}

function ruleWhere(
	sheet: CSSStyleSheet,
	needle: string,
	property: string,
): CSSStyleDeclaration | null {
	for (const entry of Array.from(sheet.cssRules)) {
		if (!("selectorText" in entry) || !("style" in entry)) continue;
		const style = entry.style as CSSStyleDeclaration;
		if (
			String(entry.selectorText).includes(needle) &&
			style.getPropertyValue(property)
		)
			return style;
	}
	return null;
}

describe("FIX 02 — canonical CSS ownership", () => {
	it("1. never imposes a shared size or padding on ordinary controls", () => {
		const html = assemble(
			financeBlueprint,
			"Beranda",
			mobileDoc(
				'<div class="stepper"><button type="button" aria-label="Kurangi">−</button><output>1</output><button type="button" aria-label="Tambah">+</button></div>',
				".stepper button{width:32px;height:32px;padding:0;border:0}",
			),
		);
		const css = canonicalCss(html);
		// Only a rule that is explicitly scoped to the primary action may size a
		// control; everything else must be a zero-specificity `:where` default.
		const sizing = css
			.split("\n")
			.filter(
				(line) =>
					/\{/.test(line) &&
					/(?:min-height|height|width|padding)\s*:/.test(line) &&
					/(?:button|input|select|textarea)/.test(line),
			)
			.filter((line) => !line.trimStart().startsWith(":where("));
		expect(
			sizing.every((line) => /data-primary|button\[type="submit"\]/.test(line)),
		).toBe(true);
		// The stepper keeps its own proportional box.
		expect(css).not.toMatch(/min-height:44px[^}]*padding:10px 14px/);
		const stepper = ruleWhere(patternStyle(), "stepper", "width");
		expect(stepper?.getPropertyValue("width")).toBe("36px");
		expect(stepper?.getPropertyValue("padding")).toMatch(/^0(px)?$/);
		expect(stepper?.getPropertyValue("border-radius")).toMatch(/^0(px)?$/);
		// Typography: the shell carries the family token, never the design's size,
		// and heading sizes exist only as zero-specificity fallbacks.
		expect(css).not.toMatch(/\[data-studio-shell\]\{[^}]*font-size/);
		expect(css).toContain("font-family:var(--app-font)");
		const headingDefaults = css
			.split("\n")
			.filter((line) => line.trimStart().startsWith(":where([data-studio-shell] h"));
		expect(headingDefaults).toHaveLength(3);
	});

	it("2. derives the outer gutter from density without a second conflict", () => {
		const compact = canonicalCss(
			assemble(webSaaSBlueprint, "Dashboard", webDoc("<p>Konten</p>")),
		);
		expect(compact).toContain("--app-gutter:16px");
		const comfortable = canonicalCss(
			assemble(financeBlueprint, "Beranda", mobileDoc("<p>Konten</p>")),
		);
		expect(comfortable).toContain("--app-gutter:24px");
		// The content padding is the project gutter at zero specificity, so a
		// screen that declares its own container padding wins instead of stacking
		// a shell gutter on top of the design's.
		for (const css of [compact, comfortable]) {
			const contentPadding = css
				.split("\n")
				.filter(
					(line) =>
						line.includes("[data-studio-content]") &&
						line.includes("padding:var(--app-gutter)"),
				);
			expect(contentPadding.length).toBe(1);
			for (const line of contentPadding)
				expect(line.trimStart().startsWith(":where(")).toBe(true);
			expect(css).toContain(
				":where([data-studio-content]){min-width:0;padding:var(--app-gutter)}",
			);
		}
	});

	it("3. keeps the ratio a product media component declares", () => {
		const html = assemble(
			travelBlueprint,
			"Eksplorasi",
			mobileDoc(
				'<figure class="product-media" data-media="product"><img src="https://images.unsplash.com/photo-1?w=640" alt="Produk"></figure>',
				".product-media{aspect-ratio:16/10;border-radius:12px}",
			),
		);
		const css = canonicalCss(html);
		// No provider-wide or figure-wide 16/9 may overwrite the component ratio.
		expect(css).not.toMatch(/figure img/);
		expect(css).not.toMatch(/img\[src/);
		expect(css).not.toContain("[data-media]{");
		expect(css).not.toContain("[data-media],");
		expect(css).toContain('[data-media="product"]){aspect-ratio:4/3');
		// The screen's own declaration is untouched by the assembly.
		expect(html).toContain("aspect-ratio:16/10");
	});

	it("4. never forces a logo or avatar into the banner ratio", () => {
		const css = canonicalCss(
			assemble(
				travelBlueprint,
				"Eksplorasi",
				mobileDoc(
					'<img data-media="avatar" src="https://images.unsplash.com/photo-2?w=200" alt="Pelanggan"><img data-media="logo" src="https://images.unsplash.com/photo-3?w=64" alt="Logo">',
				),
			),
		);
		expect(css).toContain('[data-media="avatar"]){aspect-ratio:1/1');
		expect(css).toContain('[data-media="logo"]){object-fit:contain');
		// The single 16/9 bucket is the banner, not every image.
		const bannerRules = css
			.split("\n")
			.filter((line) => line.includes("aspect-ratio:16/9"));
		expect(bannerRules.length).toBeGreaterThan(0);
		expect(bannerRules.every((line) => line.includes('"banner"'))).toBe(true);
	});

	it("5. centres a mobile app shell on a desktop viewport", () => {
		const css = canonicalCss(
			assemble(financeBlueprint, "Beranda", mobileDoc("<p>Konten</p>")),
		);
		expect(css).toContain("@media (min-width:480px)");
		expect(css).toContain(
			"[data-studio-shell]{width:390px;margin-inline:auto}",
		);
	});

	it("6. never caps a web screen to the mobile artboard width", () => {
		const css = canonicalCss(
			assemble(webSaaSBlueprint, "Dashboard", webDoc("<p>Konten</p>")),
		);
		expect(css).not.toContain("390px");
		expect(css).not.toContain("@media (min-width:");
		expect(css).toContain("--app-gutter:16px");
	});

	it("7. does not clip a horizontal carousel with global card rules", () => {
		const css = canonicalCss(
			assemble(
				travelBlueprint,
				"Eksplorasi",
				mobileDoc(
					'<div data-ui="carousel"><article data-card><h3>Promo</h3></article></div>',
				),
			),
		);
		const cardRules = css
			.split("\n")
			.filter(
				(line) =>
					line.includes("[data-card]") &&
					/\{/.test(line) &&
					!/data-studio-shell\] \[data-card\]\)\s*$/.test(line),
			);
		for (const line of cardRules) expect(line).not.toContain("max-width");
		const carousel = ruleWhere(patternStyle(), "carousel", "overflow-x");
		expect(carousel?.getPropertyValue("overflow-x")).toBe("auto");
		const child = ruleWhere(patternStyle(), "carousel", "flex");
		expect(child?.getPropertyValue("flex")).toBe("0 0 auto");
	});

	it("8. is idempotent and never duplicates chrome", () => {
		const source = mobileDoc(
			"<section><h2>Beranda</h2><p>Saldo Rp 1.250.000</p><button data-primary>Catat</button></section>",
		);
		const once = assemble(financeBlueprint, "Beranda", source);
		const twice = finalizeStudioFrameHtml(once, {
			blueprint: financeBlueprint,
			screen: "Beranda",
			tokens: null,
			viewport: "mobile",
			mode: "refresh",
		});
		expect(twice.html).toBe(once);
		const document = doc(once);
		expect(document.querySelectorAll("[data-studio-shell]")).toHaveLength(1);
		expect(document.querySelectorAll("[data-studio-header]")).toHaveLength(1);
		expect(document.querySelectorAll("nav")).toHaveLength(1);
		expect(document.querySelectorAll("#studio-canonical-style")).toHaveLength(
			1,
		);
		expect(document.body.textContent).toContain("Saldo Rp 1.250.000");
		expect(
			validateCanonicalShell(once, financeBlueprint, "Beranda", null),
		).toEqual([]);
	});

	it("9. exports the same final shell the canvas renders", () => {
		const persisted = assemble(
			travelBlueprint,
			"Eksplorasi",
			mobileDoc(
				"<article data-card><h3>Nusa Penida</h3><p>Rp 1.250.000</p></article>",
			),
		);
		const final = finalizeStudioFrameHtml(persisted, {
			blueprint: travelBlueprint,
			screen: "Eksplorasi",
			tokens: null,
			viewport: "mobile",
			mode: "refresh",
		});
		const document = doc(final.html);
		expect(document.querySelectorAll("#studio-canonical-style")).toHaveLength(
			1,
		);
		expect(document.querySelector("[data-studio-header] h1")?.textContent).toBe(
			"Eksplorasi",
		);
		expect(document.body.textContent).toContain("Nusa Penida");
		// `refresh` never retrofits chrome onto a screen Studio never assembled.
		const raw =
			"<!DOCTYPE html><html><head></head><body><main><p>Dokumen lama tanpa shell</p></main></body></html>";
		expect(
			finalizeStudioFrameHtml(raw, {
				blueprint: travelBlueprint,
				screen: "Eksplorasi",
				tokens: null,
				viewport: "mobile",
				mode: "refresh",
			}).html,
		).toBe(raw);
		// `generate` is the one path allowed to build the shell from scratch.
		expect(
			finalizeStudioFrameHtml(raw, {
				blueprint: travelBlueprint,
				screen: "Eksplorasi",
				tokens: null,
				viewport: "mobile",
				mode: "generate",
			}).html,
		).toContain("data-studio-shell");
	});

	it("10. never leaves a login-only asset URL in the exported document", () => {
		const assetUrl = "/api/studio/asset?id=asset-1&cap=token";
		const html = `<!DOCTYPE html><html><head></head><body><img src="${assetUrl}" alt="Logo"></body></html>`;
		const rewritten = rewriteBundledAssets(
			html,
			new Map([[assetUrl, "./assets/asset-1.png"]]),
		);
		expect(rewritten).toContain("./assets/asset-1.png");
		expect(rewritten).not.toContain("/api/studio/asset");
		expect(() => rewriteBundledAssets(html, new Map())).toThrow(
			"Aset project tidak dapat dibundel ke dalam ZIP.",
		);
		// External media is documented, not silently claimed as offline-ready.
		const external = `<!DOCTYPE html><html><head><link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet"></head><body><svg xmlns="http://www.w3.org/2000/svg"><img src="https://images.unsplash.com/photo-1?w=640" alt="Foto"></svg></body></html>`;
		expect(listExternalDependencies(external)).toEqual([
			"fonts.googleapis.com",
			"images.unsplash.com",
		]);
	});

	it("11. produces byte-identical output for the same input", () => {
		const source = mobileDoc(
			"<section><h2>Eksplorasi</h2><p>Paket 3 hari</p></section>",
			".card{padding:16px}",
		);
		const input = {
			blueprint: travelBlueprint,
			screen: "Eksplorasi",
			tokens: null,
			viewport: "mobile",
			mode: "generate" as const,
		};
		expect(finalizeStudioFrameHtml(source, input).html).toBe(
			finalizeStudioFrameHtml(source, input).html,
		);
	});

	it("12. keeps multi-screen generation consistent", () => {
		const screens = webSaaSBlueprint.screenPlan.map((screen) => ({
			name: screen.name,
			html: assemble(
				webSaaSBlueprint,
				screen.name,
				webDoc(`<h1>${screen.name}</h1><p>Konten ${screen.name}</p>`),
			),
		}));
		const identities = screens.map(({ name, html }) => {
			const document = doc(html);
			expect(
				validateCanonicalShell(html, webSaaSBlueprint, name, null),
			).toEqual([]);
			expect(document.querySelectorAll("[data-studio-shell]")).toHaveLength(1);
			expect(document.querySelectorAll("nav")).toHaveLength(1);
			expect(document.querySelectorAll("header")).toHaveLength(1);
			return document
				.querySelector("nav")
				?.outerHTML.replace(/ aria-current="page"/g, "");
		});
		expect(new Set(identities).size).toBe(1);
	});

	it("ships no decorative pattern beyond the audited component catalog", () => {
		expect(STUDIO_COMPONENT_PATTERNS.map((entry) => entry.name)).toContain(
			"QuantityStepper",
		);
		expect(STUDIO_COMPONENT_STYLE).not.toContain("animation");
		expect(STUDIO_COMPONENT_STYLE).not.toContain("!important");
	});
});
