import { describe, expect, it } from "vitest";
import { inspectStudioHtml } from "../services/studio-html-diagnostics";

const page = (body: string, style = "") =>
	`<!doctype html><html><head><style>${style}</style></head><body>${body}</body></html>`;

describe("DOM-aware output diagnostics", () => {
	it.each([
		'<div id="same"></div><p id="same">Duplicate</p>',
		'<input id="field">',
		"<button><svg></svg></button>",
		'<script src="https://untrusted.test/runtime.js"></script>',
		'<img src="missing-component.svg" alt="Sample">',
		'<svg><use href="#absent"></use></svg>',
		'<iframe src="https://untrusted.test"></iframe>',
		'<button onclick="alert(1)">Action</button>',
		"<p>Amount <div>Nested block</div></p>",
	])("reports hard boundary failures: %s", (body) => {
		expect(inspectStudioHtml(page(body)).hard.length).toBeGreaterThan(0);
	});

	it("preserves labeled editable controls and intentional separators", () => {
		const result = inspectStudioHtml(
			page(
				'<label for="field">Amount</label><input id="field"><p>Income | Expense</p><button aria-label="Close"><svg></svg></button><svg><symbol id="shape"></symbol><use href="#shape"></use></svg>',
			),
		);
		expect(result.hard).toEqual([]);
		expect(result.warnings).toEqual([]);
	});

	it("distinguishes numeric trailing pipes and floating/cursor risks as soft warnings", () => {
		const result = inspectStudioHtml(
			page(
				'<p>USD 123.45|</p><span class="cursor">|</span>',
				'.cursor::after{content:"|";animation:blink 1s infinite}.badge{position:fixed;bottom:0}',
			),
		);
		expect(result.hard).toEqual([]);
		expect(result.warnings.length).toBeGreaterThanOrEqual(2);
	});

	it("detects unapproved status chrome and accidental initial focus", () => {
		const result = inspectStudioHtml(
			page(
				'<div class="status-bar">Clock</div><input aria-label="Amount" autofocus>',
			),
		);
		expect(result.hard).toHaveLength(2);
	});
});
