import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
	assembleCanonicalShell,
	validateCanonicalShell,
} from "../services/studio-canonical-shell";
import type { StudioDesignBlueprint } from "../services/studio-design-blueprint";

const blueprint: StudioDesignBlueprint = {
	productIdentity: {
		productName: "Sample",
		targetAudience: "General",
		platform: "mobile",
		visualDirection: "Editorial",
	},
	designTokens: {
		primary: "#123456",
		secondary: "#555555",
		background: "#ffffff",
		surface: "#fafafa",
		fontFamily: "Arial",
		radius: 8,
		border: "1px solid #dddddd",
		elevation: "none",
	},
	sharedComponents: {
		header: "App bar",
		navigation: "Bottom tabs",
		buttons: "Solid",
		inputs: "Bordered",
		cards: "Flat",
		tabs: "Underline",
		icons: "Outline",
	},
	navigationContract: {
		destinations: ["overview", "entry"],
		labels: ["Overview", "Entry"],
		iconMapping: { overview: "home", entry: "plus" },
		ordering: ["entry", "overview"],
		activeItemRule: "Match screen",
	},
	screenPlan: [
		{ name: "Summary", role: "Summary", order: 0 },
		{ name: "Form", role: "Form", order: 1 },
	],
	canonicalShell: {
		version: 1,
		navigation: "bottom",
		statusBar: "none",
		density: "comfortable",
		activeDestinations: { Summary: "overview", Form: "entry" },
	},
};
const html =
	'<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main data-studio-content><p>Screen content</p><label for="amount">Amount</label><input id="amount" autofocus><article data-card>Details</article></main></body></html>';
const doc = (value: string) => new JSDOM(value).window.document;

describe("canonical assembly", () => {
	it("enforces ordering and identical assets with only active state changing", () => {
		const first = assembleCanonicalShell(html, blueprint, "Summary", null);
		const second = assembleCanonicalShell(
			html.replace("Screen content", "Different content"),
			blueprint,
			"Form",
			null,
		);
		const a = doc(first);
		const b = doc(second);
		expect(
			Array.from(a.querySelectorAll("[data-destination]"), (node) =>
				node.getAttribute("data-destination"),
			),
		).toEqual(["entry", "overview"]);
		expect(
			a
				.querySelector('[aria-current="page"]')
				?.getAttribute("data-destination"),
		).toBe("overview");
		expect(
			b
				.querySelector('[aria-current="page"]')
				?.getAttribute("data-destination"),
		).toBe("entry");
		expect(
			Array.from(a.querySelectorAll("nav svg"), (node) => node.outerHTML),
		).toEqual(
			Array.from(b.querySelectorAll("nav svg"), (node) => node.outerHTML),
		);
		expect(a.querySelector("[data-studio-content]")?.textContent).not.toBe(
			b.querySelector("[data-studio-content]")?.textContent,
		);
		expect(validateCanonicalShell(first, blueprint, "Summary", null)).toEqual(
			[],
		);
	});

	it("is idempotent and keeps editable fields without accidental autofocus", () => {
		const first = assembleCanonicalShell(html, blueprint, "Summary", null);
		expect(assembleCanonicalShell(first, blueprint, "Summary", null)).toBe(
			first,
		);
		const document = doc(first);
		expect(document.querySelectorAll("[data-studio-shell]")).toHaveLength(1);
		expect(document.querySelectorAll("input")).toHaveLength(1);
		expect(document.querySelector("[autofocus]")).toBeNull();
	});

	it("replaces legacy navigation and adopts <main> if data-studio-content attribute is missing", () => {
		const source = html
			.replace(" data-studio-content", "")
			.replace("<body>", "<body><nav>Old navigation</nav>");
		const assembled = assembleCanonicalShell(
			source,
			blueprint,
			"Summary",
			null,
		);
		const document = doc(assembled);
		expect(document.querySelectorAll("[data-studio-shell]")).toHaveLength(1);
		expect(document.querySelectorAll("nav")).toHaveLength(1);
		expect(document.querySelector("nav")?.textContent).not.toContain(
			"Old navigation",
		);
		expect(document.querySelector("[data-studio-content]")).not.toBeNull();
		expect(
			validateCanonicalShell(assembled, blueprint, "Summary", null),
		).toEqual([]);
	});

	it("detects shell tampering, duplicates and unexpected status chrome", () => {
		const valid = assembleCanonicalShell(html, blueprint, "Summary", null);
		for (const modify of [
			(d: Document) => d.querySelector("nav")?.remove(),
			(d: Document) =>
				d.querySelector("nav")?.append(d.createElement("button")),
			(d: Document) => d.querySelector("nav svg")?.remove(),
			(d: Document) =>
				d
					.querySelector('[aria-current="page"]')
					?.removeAttribute("aria-current"),
			(d: Document) => d.body.append(d.createElement("nav")),
			(d: Document) =>
				d.body.insertAdjacentHTML(
					"beforeend",
					"<div data-studio-status-bar>Clock</div>",
				),
		]) {
			const document = doc(valid);
			modify(document);
			expect(
				validateCanonicalShell(
					document.documentElement.outerHTML,
					blueprint,
					"Summary",
					null,
				).length,
			).toBeGreaterThan(0);
		}
	});

	it("eliminates trailing pipe artifacts after currency amounts and animated cursor spans", () => {
		const artifactHtml = html.replace(
			"<p>Screen content</p>",
			'<p>JUMLAH YANG DIKELUARKAN</p><span class="amount">Rp 44.000|</span><span class="animate-pulse">|</span>',
		);
		const assembled = assembleCanonicalShell(
			artifactHtml,
			blueprint,
			"Summary",
			null,
		);
		const document = doc(assembled);
		expect(document.querySelector(".amount")?.textContent).toBe("Rp 44.000");
		expect(document.querySelector(".animate-pulse")).toBeNull();
		// Preserves legitimate functional inputs
		expect(document.querySelector("input")).not.toBeNull();
	});
});
