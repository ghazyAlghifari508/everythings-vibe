import { describe, expect, it } from "vitest";
import { validateGeneratedHtml } from "../services/studio-generated-html-validation";
import { inspectStudioHtml } from "../services/studio-html-diagnostics";

const page = (body: string, css = "") =>
	`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><main data-studio-content>${body}</main></body></html>`;

const repairCodes = (html: string) =>
	inspectStudioHtml(html)
		.findings.filter(({ severity }) => severity === "repairable")
		.map(({ code }) => code);

describe("P6 evidence-based structural classification", () => {
	it.each([
		"<output><div>3</div><div>item</div></output>",
		'<span data-price><span style="display:block">USD</span><span style="display:block">42.00</span></span>',
	])("repairs forced block-separated atomic values: %s", (body) => {
		expect(repairCodes(page(body))).toContain("ATOMIC_LABEL_BROKEN");
	});

	it("repairs a shrinking carousel even when its track is scrollable", () => {
		expect(
			repairCodes(
				page(
					'<div data-ui="carousel" style="display:flex;overflow-x:auto"><article style="width:280px;flex:1 1 auto">Destination A</article><article style="width:280px;flex:1 1 auto">Destination B</article></div>',
				),
			),
		).toContain("SCROLLER_SHRINKING");
	});

	it("preserves native contained scrolling and atomic inline labels", () => {
		const html = page(
			'<output><span>3</span> <span>item</span></output><div data-ui="carousel" style="display:flex;overflow-x:auto"><article style="flex:0 0 280px">Destination A</article></div>',
		);
		expect(repairCodes(html)).toEqual([]);
	});

	it("does not request repair for intentionally hidden responsive alternatives", () => {
		expect(
			repairCodes(
				page(
					'<div style="display:none"><output>3<br>item</output><button style="height:0;overflow:hidden">Alternative action</button></div>',
				),
			),
		).toEqual([]);
	});

	it("does not mistake a perpendicular zero dimension for proven text clipping", () => {
		expect(
			repairCodes(
				page(
					'<div style="width:0;overflow-y:hidden;overflow-x:visible"><span data-price>USD 42.00</span></div>',
				),
			),
		).toEqual([]);
	});

	it("classifies duplicated canonical navigation as repairable structure, not unsafe HTML", () => {
		const result = inspectStudioHtml(
			page(
				"<nav data-studio-navigation>Home</nav><nav data-studio-navigation>Home</nav>",
			),
		);
		expect(result.hard).toEqual([]);
		expect(result.findings).toContainEqual(
			expect.objectContaining({
				code: "DUPLICATE_GLOBAL_NAVIGATION",
				severity: "repairable",
				confidence: "high",
			}),
		);
	});

	it("does not block max-width-constrained content using a second fixed-width heuristic", () => {
		const html = page(
			'<article style="width:1800px;max-width:100%">Readable responsive content</article>',
		);
		expect(inspectStudioHtml(html).hard).toEqual([]);
		expect(
			validateGeneratedHtml(html, {
				blueprint: null,
				viewport: "web",
				expectTokens: false,
			}),
		).toEqual([]);
	});

	it("repairs essential headings hidden inside a zero-height clipping box", () => {
		expect(
			repairCodes(
				page(
					'<section style="height:0;overflow:hidden"><h2>Required choice</h2></section>',
				),
			),
		).toContain("CRITICAL_CONTENT_HIDDEN");
	});

	it("keeps subjective badge and spacing concerns advisory while retaining unsafe interaction failures", () => {
		const result = inspectStudioHtml(
			page(
				'<section style="padding:120px"><article style="padding:120px"><span data-ui="badge">Selected</span><span data-ui="badge">Selected</span></article></section><button onclick="evil()">Pay</button>',
			),
		);
		expect(result.findings).toContainEqual(
			expect.objectContaining({
				code: "UNSAFE_EVENT_HANDLER",
				severity: "hard",
				confidence: "high",
			}),
		);
		expect(result.findings).toContainEqual(
			expect.objectContaining({
				code: "DUPLICATE_STATUS",
				severity: "advisory",
			}),
		);
		expect(result.repairable).toEqual([]);
	});
});
