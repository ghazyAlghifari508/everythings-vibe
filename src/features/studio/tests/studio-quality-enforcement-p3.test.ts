import { describe, expect, it } from "vitest";
import { validateBlueprint } from "../services/studio-design-blueprint";
import { inspectStudioHtml } from "../services/studio-html-diagnostics";
import { financeBlueprint } from "./fixtures/studio-evaluation-fixtures";

const page = (body: string, css = "") =>
	`<!doctype html><html><head><style>${css}</style></head><body><main data-studio-content>${body}</main></body></html>`;

const layout = {
	gutter: 18,
	contentMaxWidth: 1100,
	spacing: [4, 8, 12, 20, 32],
	typography: [13, 16, 20, 28],
};

describe("P3 shared layout contract", () => {
	it("preserves one validated spacing and typography contract across distinct screen roles", () => {
		const result = validateBlueprint({ ...financeBlueprint, layout });
		expect(result).toMatchObject({ ok: true, blueprint: { layout } });
	});

	it.each([
		{ ...layout, gutter: -1 },
		{ ...layout, spacing: [12, 4] },
		{ ...layout, typography: [16, 12, 24] },
		{ ...layout, contentMaxWidth: 0 },
	])("rejects invalid shared layout boundaries: %j", (invalid) => {
		expect(validateBlueprint({ ...financeBlueprint, layout: invalid }).ok).toBe(
			false,
		);
	});
});

describe("P3 evidence-based structural quality", () => {
	it.each([
		[
			'<label style="text-overflow:ellipsis;overflow:hidden;white-space:nowrap" for="milk">Oat Milk with extra price</label><input id="milk">',
			"ESSENTIAL_TEXT_CLIPPED",
		],
		[
			'<button data-primary style="height:0;overflow:hidden">Checkout</button>',
			"CRITICAL_CONTENT_HIDDEN",
		],
		['<span data-ui="value">Rp<br>42.000</span>', "ATOMIC_LABEL_BROKEN"],
		["<output>3<br>Item</output>", "ATOMIC_LABEL_BROKEN"],
		[
			'<div data-media="product" style="height:120px;overflow:hidden"><img alt="Coffee" src="https://example.com/coffee.jpg" style="height:240px;width:100%"></div>',
			"MEDIA_FRAME_CONFLICT",
		],
		[
			'<div data-ui="carousel" style="display:flex;overflow-x:hidden"><article style="flex:1 1 0%;width:240px">Recommendation</article></div>',
			"SCROLLER_SHRINKING",
		],
		[
			'<div style="display:flex;flex-wrap:nowrap;width:200px;overflow:hidden"><button style="min-width:150px">Checkout</button><output style="min-width:120px">Rp42.000</output></div>',
			"NARROW_COMPOSITION",
		],
	])("requires repair only for a concrete structural conflict: %s", (body, code) => {
		expect(inspectStudioHtml(page(body))).toMatchObject({
			findings: expect.arrayContaining([
				expect.objectContaining({
					code,
					severity: "repairable",
					confidence: "high",
				}),
			]),
		});
	});

	it("recognizes applied stylesheet clipping, not unused rules or desktop-only rules", () => {
		const body =
			'<label class="option" for="milk">Oat Milk</label><input id="milk">';
		expect(
			inspectStudioHtml(
				page(
					body,
					".option{text-overflow:ellipsis;overflow:hidden;white-space:nowrap}",
				),
			),
		).toMatchObject({
			findings: expect.arrayContaining([
				expect.objectContaining({ code: "ESSENTIAL_TEXT_CLIPPED" }),
			]),
		});
		expect(
			inspectStudioHtml(
				page(
					body,
					".unused{text-overflow:ellipsis;overflow:hidden;white-space:nowrap}@media(min-width:900px){.option{height:0;overflow:hidden}}",
				),
			),
		).toMatchObject({ repairable: [] });
	});

	it("keeps functional badges and unrelated duplicate record statuses advisory", () => {
		const result = inspectStudioHtml(
			page(
				'<article><span data-ui="badge">In stock</span><span data-ui="badge">In stock</span></article><article><span role="status">In stock</span></article>',
			),
		);
		expect(result).toMatchObject({
			hard: [],
			repairable: [],
			findings: expect.arrayContaining([
				expect.objectContaining({
					code: "DUPLICATE_STATUS",
					severity: "advisory",
				}),
			]),
		});
	});

	it("preserves healthy mobile options, atomic values, intentional media crop and scrolling", () => {
		expect(
			inspectStudioHtml(
				page(`
			<fieldset><legend>Milk</legend><label style="min-height:44px"><input type="radio" name="milk" checked>Oat Milk <span data-ui="value">+Rp8.000</span></label></fieldset>
			<div data-ui="stepper"><button aria-label="Decrease">−</button><output>3 Item</output><button aria-label="Increase">+</button></div>
			<div data-ui="carousel" style="display:flex;overflow-x:auto"><article style="flex:0 0 240px">Coffee</article></div>
			<div data-media="product" style="aspect-ratio:16/10;overflow:hidden"><img alt="Coffee" src="https://example.com/coffee.jpg" style="width:100%;height:100%;object-fit:contain"></div>
			<button data-primary>Checkout <span data-ui="value">Rp42.000</span></button>
		`),
			),
		).toMatchObject({ hard: [], repairable: [] });
	});
});
