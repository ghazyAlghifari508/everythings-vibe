import { describe, expect, it } from "vitest";
import {
	DESKTOP_WIDTH,
	extractPageTitle,
	forceDesktopViewport,
	stylesheetHrefs,
	withBaseHref,
} from "./fetch-html";

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
			extractPageTitle(`<html><head><title>  Linear  —  App </title></head></html>`),
		).toBe("Linear — App");
		expect(extractPageTitle(`<html><head></head></html>`)).toBeNull();
	});
});
