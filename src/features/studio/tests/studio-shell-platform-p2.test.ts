import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
	classifyStudioScreenRole,
	extendStudioBlueprintWithScreen,
} from "../services/studio-blueprint-navigation";
import {
	assembleCanonicalShell,
	validateCanonicalShell,
} from "../services/studio-canonical-shell";
import type { StudioDesignBlueprint } from "../services/studio-design-blueprint";
import { enforceDesignSystemOnHtml } from "../services/studio-design-system-html";
import { inspectStudioHtml } from "../services/studio-html-diagnostics";
import { extractCleanHtml } from "../utils/clean-html";
import {
	financeBlueprint,
	travelBlueprint,
	webSaaSBlueprint,
} from "./fixtures/studio-evaluation-fixtures";

const doc = (html: string) => new JSDOM(html).window.document;

const mobileBody = (name: string) =>
	`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main data-studio-content><section data-card><h2>${name}</h2><p>Konten layar ${name}</p></section></main></body></html>`;

const webBody = (title: string) =>
	`<!DOCTYPE html><html><head></head><body><main data-studio-content><header data-studio-page-header><h1>${title}</h1><button data-primary>Tambah</button></header><section data-card><p>Konten ${title}</p></section></main></body></html>`;

function build(
	blueprint: StudioDesignBlueprint,
	screen: string,
	html: string,
): { html: string; document: Document } {
	const assembled = assembleCanonicalShell(
		enforceDesignSystemOnHtml(html, null, null, blueprint),
		blueprint,
		screen,
		null,
	);
	return { html: assembled, document: doc(assembled) };
}

/**
 * Contract for the screen-name text: the brand and the screen title must never
 * share the injected app bar. Web puts branding in the topbar and leaves the
 * title to the screen's own content header; mobile puts the title in the app
 * bar. A detail screen keeps app identity but gains a back affordance.
 */
describe("Task 02 — platform-shaped canonical app bar", () => {
	it("web topbar carries product branding only, never the screen title", () => {
		for (const screen of webSaaSBlueprint.screenPlan) {
			const { html, document } = build(
				webSaaSBlueprint,
				screen.name,
				webBody(screen.name),
			);
			const bar = document.querySelector("[data-studio-header]");
			expect(bar?.getAttribute("data-studio-appbar")).toBe("web");
			expect(bar?.querySelector("strong")?.textContent).toBe("PulseMetrics");
			expect(bar?.querySelector("h1")).toBeNull();
			expect(bar?.textContent).not.toContain(screen.name);
			// Screen title stays in the screen-owned content header.
			expect(
				document.querySelector(
					"[data-studio-content] [data-studio-page-header] h1",
				)?.textContent,
			).toBe(screen.name);
			expect(
				validateCanonicalShell(html, webSaaSBlueprint, screen.name, null),
			).toEqual([]);
		}
	});

	it("mobile app bar shows the screen title without a brand block", () => {
		for (const screen of financeBlueprint.screenPlan) {
			const { html, document } = build(
				financeBlueprint,
				screen.name,
				mobileBody(screen.name),
			);
			const bar = document.querySelector("[data-studio-header]");
			expect(bar?.getAttribute("data-studio-appbar")).toBe("mobile");
			expect(bar?.querySelector("h1")?.textContent).toBe(screen.name);
			expect(bar?.querySelector("strong")).toBeNull();
			expect(bar?.querySelector("[data-studio-back]")).toBeNull();
			expect(
				validateCanonicalShell(html, financeBlueprint, screen.name, null),
			).toEqual([]);
		}
	});

	it("places an uploaded logo beside the title on tab screens, never beside back", () => {
		const logo = "/api/studio/asset?id=1&cap=2";
		const withLogo = assembleCanonicalShell(
			mobileBody("Eksplorasi"),
			travelBlueprint,
			"Eksplorasi",
			null,
			logo,
		);
		const tabBar = doc(withLogo).querySelector("[data-studio-header]");
		expect(
			tabBar?.querySelector("[data-studio-brand] img")?.getAttribute("src"),
		).toBe(logo);
		expect(
			validateCanonicalShell(
				withLogo,
				travelBlueprint,
				"Eksplorasi",
				null,
				logo,
			),
		).toEqual([]);

		const detailRole = classifyStudioScreenRole({
			screenName: "Detail Jadwal",
			screenDescription: null,
			prompt: null,
			blueprint: travelBlueprint,
			designMode: "mobile",
		});
		const extended = extendStudioBlueprintWithScreen({
			blueprint: travelBlueprint,
			screenName: "Detail Jadwal",
			screenRole: detailRole,
			screenDescription: null,
		});
		const detailHtml = assembleCanonicalShell(
			mobileBody("Detail Jadwal"),
			extended,
			"Detail Jadwal",
			null,
			logo,
		);
		const detailBar = doc(detailHtml).querySelector("[data-studio-header]");
		expect(detailBar?.querySelector("[data-studio-back]")).not.toBeNull();
		expect(detailBar?.querySelector("[data-studio-brand]")).toBeNull();
		expect(
			validateCanonicalShell(detailHtml, extended, "Detail Jadwal", null, logo),
		).toEqual([]);
	});

	it("mobile package detail keeps app identity, active parent tab and a back affordance", () => {
		const classification = classifyStudioScreenRole({
			screenName: "Detail Paket",
			screenDescription: "Rincian paket wisata Labuan Bajo",
			prompt: null,
			blueprint: travelBlueprint,
			designMode: "mobile",
		});
		expect(classification.role).toBe("contextual");
		const extended = extendStudioBlueprintWithScreen({
			blueprint: travelBlueprint,
			screenName: "Detail Paket",
			screenRole: classification,
			screenDescription: "Rincian paket wisata Labuan Bajo",
		});
		const { html, document } = build(
			extended,
			"Detail Paket",
			mobileBody("Detail Paket"),
		);
		const back = document.querySelector("[data-studio-back]");
		expect(back?.getAttribute("aria-label")).toBe("Kembali");
		expect(document.querySelector('nav a[aria-current="page"]')).toBeNull();
		expect(document.querySelector("[data-studio-header] h1")?.textContent).toBe(
			"Detail Paket",
		);
		expect(
			validateCanonicalShell(html, extended, "Detail Paket", null),
		).toEqual([]);
		const namedParent = classifyStudioScreenRole({
			screenName: "Detail Jadwal",
			screenDescription: null,
			prompt: null,
			blueprint: travelBlueprint,
			designMode: "mobile",
		});
		const withNamedParent = extendStudioBlueprintWithScreen({
			blueprint: travelBlueprint,
			screenName: "Detail Jadwal",
			screenRole: namedParent,
			screenDescription: null,
		});
		const detail = build(
			withNamedParent,
			"Detail Jadwal",
			mobileBody("Detail Jadwal"),
		);
		expect(
			detail.document
				.querySelector("[data-studio-back]")
				?.getAttribute("aria-label"),
		).toBe("Kembali ke Jadwal Perjalanan");
		expect(
			detail.document
				.querySelector('nav a[aria-current="page"]')
				?.getAttribute("data-destination"),
		).toBe("calendar");
	});

	it("mobile checkout gets a back affordance while profile as a tab does not", () => {
		let blueprint = travelBlueprint;
		for (const name of ["Checkout", "Profil"]) {
			const role = classifyStudioScreenRole({
				screenName: name,
				screenDescription: null,
				prompt: null,
				blueprint,
				designMode: "mobile",
			});
			blueprint = extendStudioBlueprintWithScreen({
				blueprint,
				screenName: name,
				screenRole: role,
				screenDescription: null,
			});
		}
		const checkout = build(blueprint, "Checkout", mobileBody("Checkout"));
		expect(
			checkout.document
				.querySelector("[data-studio-back]")
				?.getAttribute("aria-label"),
		).toBe("Kembali");
		const profile = build(blueprint, "Profil", mobileBody("Profil"));
		expect(profile.document.querySelector("[data-studio-back]")).toBeNull();
	});

	it("rejects a header rebuilt as brand + screen title or with a tampered title", () => {
		const primary = build(
			travelBlueprint,
			"Eksplorasi",
			mobileBody("Eksplorasi"),
		);
		for (const modify of [
			(d: Document) =>
				d
					.querySelector("[data-studio-header]")
					?.insertAdjacentHTML(
						"beforeend",
						"<strong>JelajahNusantara</strong>",
					),
			(d: Document) => {
				const h1 = d.querySelector("[data-studio-header] h1");
				if (h1) h1.textContent = "Jelajahin Eksplorasi Paket";
			},
			(d: Document) =>
				d
					.querySelector("[data-studio-header]")
					?.insertAdjacentHTML(
						"afterbegin",
						'<a data-studio-back href="#">x</a>',
					),
		]) {
			const document = doc(primary.html);
			modify(document);
			expect(
				validateCanonicalShell(
					document.documentElement.outerHTML,
					travelBlueprint,
					"Eksplorasi",
					null,
				),
			).toContain("Required app header missing, duplicated, or modified.");
		}
	});

	it("strips an AI-generated brand+title header instead of duplicating the app bar", () => {
		const source = mobileBody("Beranda").replace(
			"<main",
			"<header><strong>BukuKas Pro</strong><h1>Beranda Ringkas</h1></header><main",
		);
		const { html, document } = build(financeBlueprint, "Beranda", source);
		expect(document.querySelectorAll("[data-studio-header]")).toHaveLength(1);
		expect(document.querySelectorAll("header")).toHaveLength(1);
		expect(document.body.textContent).not.toContain("Beranda Ringkas");
		expect(
			validateCanonicalShell(html, financeBlueprint, "Beranda", null),
		).toEqual([]);
	});

	it("web and mobile projects sharing a blueprint diverge by platform, one project stays identical", () => {
		const asWeb: StudioDesignBlueprint = {
			...financeBlueprint,
			productIdentity: { ...financeBlueprint.productIdentity, platform: "web" },
			canonicalShell: {
				version: 1,
				statusBar: "none",
				density: "comfortable",
				activeDestinations:
					financeBlueprint.canonicalShell?.activeDestinations ?? {},
				navigation: "sidebar",
			},
		};
		const web = build(asWeb, "Beranda", webBody("Beranda"));
		const mobile = build(financeBlueprint, "Beranda", mobileBody("Beranda"));
		expect(web.html).not.toBe(mobile.html);
		expect(
			web.document
				.querySelector("[data-studio-appbar]")
				?.getAttribute("data-studio-appbar"),
		).toBe("web");

		const first = build(financeBlueprint, "Beranda", mobileBody("Beranda"));
		const second = build(
			financeBlueprint,
			"Catat Transaksi",
			mobileBody("Catat Transaksi"),
		);
		const styleOf = (d: Document) =>
			d.querySelector("#studio-canonical-style")?.outerHTML;
		expect(styleOf(first.document)).toBe(styleOf(second.document));
		const navIdentity = (d: Document) =>
			d
				.querySelector("nav")
				?.outerHTML.replace(/ aria-current="page"/g, "")
				.replace(/\s+>/g, ">");
		expect(navIdentity(first.document)).toBe(navIdentity(second.document));
	});

	it("mobile shell reserves safe areas for bars and keeps export identical to preview", () => {
		const { html, document } = build(
			travelBlueprint,
			"Eksplorasi",
			mobileBody("Eksplorasi"),
		);
		// The injected screen stylesheet must not fight the canonical shell rules.
		const css =
			document.querySelector("#studio-canonical-style")?.textContent ?? "";
		expect(css).toContain("env(safe-area-inset-bottom)");
		expect(css).toContain("env(safe-area-inset-top)");
		// Screen-owned styles must not break the canonical shell region.
		expect(inspectStudioHtml(html).hard).toEqual([]);
		// Export path only slices the document; shell identity must survive.
		const exported = extractCleanHtml(html);
		expect(exported).toBe(html);
		const exportedDocument = doc(exported);
		expect(
			exportedDocument.querySelector("[data-studio-header] h1")?.textContent,
		).toBe("Eksplorasi");
		expect(
			exportedDocument.querySelectorAll("[data-studio-navigation] a"),
		).toHaveLength(4);
	});
});
