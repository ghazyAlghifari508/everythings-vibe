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

	it("leaves ambiguous controls and security-sensitive attributes untouched", () => {
		const html =
			'<html><body><button onclick="danger()"><img alt="One"><img alt="Two"></button><input placeholder="Guess"></body></html>';
		expect(repairStudioAccessibleLabels(html)).toBe(html);
		expect(inspectStudioHtml(html).hard).toContain(
			"Unintended event handler on BUTTON.",
		);
	});
});
