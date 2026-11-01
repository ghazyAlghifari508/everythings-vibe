import { describe, expect, it } from "vitest";
import { inspectStudioHtml } from "../services/studio-html-diagnostics";

const page = (body: string, css = "") =>
	`<!doctype html><html><head><style>${css}</style></head><body><main data-studio-content>${body}</main></body></html>`;

describe("static layout quality boundaries", () => {
	it("rejects invalid CSS rather than silently rendering an unstyled screen", () => {
		expect(
			inspectStudioHtml(page("<p>Sample content</p>", "p { color: red;")).hard,
		).toContain("Invalid generated stylesheet.");
	});

	it("warns about decorative skeletons without converting quality into failure", () => {
		const result = inspectStudioHtml(
			page("<div data-skeleton></div><p>Sample content</p>"),
		);
		expect(result.hard).toEqual([]);
		expect(result.warnings).toContain(
			"Loading placeholder in a static screen; render content unless a loading state was requested.",
		);
	});

	it("reports duplicate status labels in one component, not across independent records", () => {
		const duplicate = inspectStudioHtml(
			page(
				'<article><span role="status">Approved</span><span role="status">Approved</span></article>',
			),
		);
		expect(duplicate.warnings).toContain(
			"Repeated status label in the same component.",
		);
		const independent = inspectStudioHtml(
			page(
				'<article><span role="status">Approved</span></article><article><span role="status">Approved</span></article>',
			),
		);
		expect(independent.warnings).not.toContain(
			"Repeated status label in the same component.",
		);
	});

	it("does not treat an unused wide rule or an intentional scroller as proven overflow", () => {
		const result = inspectStudioHtml(
			page(
				'<div style="overflow-x:auto;max-width:100%"><table style="min-width:1600px"><tr><td>Sample</td></tr></table></div>',
				".unused{width:2000px}",
			),
		);
		expect(result.hard).toEqual([]);
	});
});
