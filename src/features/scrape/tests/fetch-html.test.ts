import { describe, expect, it } from "vitest";
import {
	decodeHtmlEntities,
	extractPageTitle,
	forceDesktopViewport,
	stylesheetHrefs,
	withBaseHref,
} from "@/features/scrape/services/html-document";
import { DESKTOP_WIDTH } from "@/features/scrape/services/page-capture";

describe("fetch-html helpers", () => {
	it("pins the desktop viewport width", () => {
		expect(DESKTOP_WIDTH).toBe(1440);
		const replaced = forceDesktopViewport(
			`<html><head><meta name="viewport" content="width=device-width"></head><body></body></html>`,
		);
		expect(replaced).toContain('content="width=1440"');
		expect(replaced).not.toContain("device-width");
	});

	it("extracts and absolutizes stylesheet hrefs with a cap", () => {
		const links = Array.from(
			{ length: 10 },
			(_, i) => `<link rel="stylesheet" href="/s${i}.css">`,
		).join("");
		const hrefs = stylesheetHrefs(
			`<html><head>${links}</head></html>`,
			"https://example.com/page",
		);
		expect(hrefs).toHaveLength(8);
		expect(hrefs[0]).toBe("https://example.com/s0.css");
	});

	it("injects a base href for relative assets", () => {
		const out = withBaseHref(
			`<html><head></head><body></body></html>`,
			"https://example.com/page",
		);
		expect(out).toContain('<base href="https://example.com/page">');
	});

	it("extracts the page title", () => {
		expect(
			extractPageTitle(
				`<html><head><title>  Linear  —  App </title></head></html>`,
			),
		).toBe("Linear — App");
		expect(extractPageTitle(`<html><head></head></html>`)).toBeNull();
	});

	it("decodes entities in the page title without HTML injection", () => {
		expect(
			extractPageTitle(
				`<html><head><title>Riset &amp; Pengembangan</title></head></html>`,
			),
		).toBe("Riset & Pengembangan");
		expect(
			extractPageTitle(
				`<html><head><title>A &lt; B &gt; C &quot;D&quot;</title></head></html>`,
			),
		).toBe('A < B > C "D"');
		expect(
			extractPageTitle(
				`<html><head><title>Hak &#169; 2026</title></head></html>`,
			),
		).toBe("Hak © 2026");
		expect(
			extractPageTitle(
				`<html><head><title>Em &#x2014; Dash</title></head></html>`,
			),
		).toBe("Em — Dash");
	});

	it("decodes entities generically and leaves unknowns intact", () => {
		expect(decodeHtmlEntities("A &amp; B")).toBe("A & B");
		expect(decodeHtmlEntities("&#65;&#x42;")).toBe("AB");
		expect(decodeHtmlEntities("Fish &chips; here")).toBe("Fish &chips; here");
		expect(decodeHtmlEntities("plain text")).toBe("plain text");
	});
});
