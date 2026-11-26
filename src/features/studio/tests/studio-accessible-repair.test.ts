import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { repairStudioAccessibleLabels } from "../services/studio-accessible-repair";
import { inspectStudioHtml } from "../services/studio-html-diagnostics";

describe("narrow accessible label repair", () => {
	it("uses an existing image alternative without changing other markup", () => {
		const html =
			'<html><body><button><img alt="Open &amp; close" src="https://example.com/a.png"></button></body></html>';
		const repaired = repairStudioAccessibleLabels(html);
		expect(repaired).toContain('aria-label="Open &amp; close"');
		expect(inspectStudioHtml(repaired).hard).toEqual([]);
	});

	it("uses an inner SVG aria-label for the parent button", () => {
		const html =
			'<html><body><button><svg aria-label="Close dialog"><path d="M0 0"/></svg></button><button><svg aria-label="Search items"><circle/></svg></button></body></html>';
		const repaired = repairStudioAccessibleLabels(html);
		expect(repaired).toContain('aria-label="Close dialog"');
		expect(repaired).toContain('aria-label="Search items"');
		expect(inspectStudioHtml(repaired).hard).toEqual([]);
	});

	it("assigns deterministic id and name to search fields without either attribute", () => {
		const html =
			'<html><body><div id="studio-search-1"></div><input type="search" aria-label="Cari tujuan" disabled><input type="search" aria-label="Cari tiket" disabled></body></html>';
		const repaired = repairStudioAccessibleLabels(html);
		const dom = new JSDOM(repaired);
		try {
			const fields = dom.window.document.querySelectorAll(
				'input[type="search"]',
			);
			expect(fields[0]?.id).toBe("studio-search-2");
			expect(fields[0]?.getAttribute("name")).toBe("studio-search-2");
			expect(fields[1]?.id).toBe("studio-search-3");
			expect(fields[1]?.getAttribute("name")).toBe("studio-search-3");
		} finally {
			dom.window.close();
		}
	});
	it("keeps later button attributes attached when search inputs precede them", () => {
		const html =
			'<html><body><input type="search" aria-label="Cari tiket" disabled><button><svg aria-label="Close dialog"><path d="M0 0"/></svg></button></body></html>';
		const dom = new JSDOM(repairStudioAccessibleLabels(html));
		try {
			const input = dom.window.document.querySelector('input[type="search"]');
			const button = dom.window.document.querySelector("button");
			expect(input?.id).toBe("studio-search-1");
			expect(input?.getAttribute("name")).toBe("studio-search-1");
			expect(button?.getAttribute("aria-label")).toBe("Close dialog");
		} finally {
			dom.window.close();
		}
	});
	it("leaves ambiguous controls and security-sensitive attributes untouched", () => {
		const html =
			'<html><body><button onclick="danger()"><img alt="One"><img alt="Two"></button><input placeholder="Guess"></body></html>';
		expect(repairStudioAccessibleLabels(html)).toBe(html);
		expect(inspectStudioHtml(html).hard).toContain(
			"Unintended event handler on BUTTON.",
		);
	});
});
