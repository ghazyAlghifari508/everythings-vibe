import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
	assembleCanonicalShell,
	validateCanonicalShell,
} from "../services/studio-canonical-shell";
import { STUDIO_COMPONENT_PATTERNS } from "../services/studio-component-patterns";
import { enforceDesignSystemOnHtml } from "../services/studio-design-system-html";
import { extractDesignSystemTokens } from "../services/studio-design-tokens";
import { validateGeneratedHtml } from "../services/studio-generated-html-validation";
import { inspectStudioHtml } from "../services/studio-html-diagnostics";
import { financeBlueprint } from "./fixtures/studio-evaluation-fixtures";

const patterns = STUDIO_COMPONENT_PATTERNS.map((pattern) => pattern.html);
const fixtures = [
	["search with trailing action", patterns[0]],
	["four-option segments", patterns[1]],
	[
		"long dropdown label",
		'<label for="filter">Package filter</label><select id="filter"><option>All available subscription packages</option></select>',
	],
	[
		"analytics dashboard",
		'<section><h2>Sample analytics</h2><div data-ui="actions"><button>Export</button></div><article data-card><h3>Revenue</h3><p>125000</p></article></section>',
	],
	["desktop transactions", patterns[3]],
	[
		"mobile payment details",
		"<section><h2>Payment details</h2><dl><dt>Item</dt><dd>Sample booking</dd><dt>Amount</dt><dd>1250000</dd></dl></section>",
	],
	["short status", '<span data-ui="badge">Resmi</span>'],
	[
		"nested cards",
		"<article data-card><h2>Order</h2><section data-card><h3>Delivery</h3><p>Sample address</p></section></article>",
	],
	[
		"large amount form",
		'<div data-ui="field"><label for="amount">Amount</label><input id="amount" value="125000000000"></div>',
	],
	["unrequested skeleton", "<div data-skeleton></div><p>Sample content</p>"],
	[
		"duplicate badge",
		"<article><span data-badge>Ready</span><span data-badge>Ready</span></article>",
	],
	[
		"right edge overflow",
		'<section style="min-width:2000px">Sample content</section>',
	],
	[
		"nested outer padding",
		'<section style="padding:120px"><article style="padding:120px">Sample content</article></section>',
	],
	["without reference", patterns[4]],
	["with reference", patterns[4]],
] as const;

// These assert transformation and validation contracts, not pixel-level visual quality.
describe("spatial generation fixtures", () => {
	it.each(
		fixtures,
	)("preserves required content and validates %s", (name, body) => {
		const tokens =
			name === "with reference"
				? extractDesignSystemTokens(
						"# Design\n## Colors\n- Primary: #123456\n- Background: #ffffff\n- Surface: #fafafa\n- Text: #111111",
					)
				: null;
		const source = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main data-studio-content>${body}</main></body></html>`;
		for (const platform of ["mobile", "web"] as const) {
			const blueprint = {
				...financeBlueprint,
				productIdentity: { ...financeBlueprint.productIdentity, platform },
				canonicalShell: {
					version: 1 as const,
					statusBar: "none" as const,
					density: "comfortable" as const,
					activeDestinations:
						financeBlueprint.canonicalShell?.activeDestinations ?? {},
					navigation:
						platform === "mobile" ? ("bottom" as const) : ("sidebar" as const),
				},
			};
			const enforced = enforceDesignSystemOnHtml(
				source,
				tokens,
				null,
				blueprint,
			);
			const result = assembleCanonicalShell(
				enforced,
				blueprint,
				"Beranda",
				tokens,
			);
			const before = new JSDOM(source);
			const after = new JSDOM(result);
			try {
				expect(
					after.window.document.querySelector("[data-studio-content]")
						?.textContent,
				).toBe(before.window.document.querySelector("main")?.textContent);
				expect(
					validateCanonicalShell(result, blueprint, "Beranda", tokens),
				).toEqual([]);
				const issues = validateGeneratedHtml(result, {
					blueprint,
					viewport: platform,
					expectTokens: tokens !== null,
				});
				if (name === "right edge overflow")
					expect(issues).toContain("Lebar tetap melebihi viewport.");
				else expect(issues).toEqual([]);
				const diagnostics = inspectStudioHtml(result);
				if (name === "unrequested skeleton")
					expect(diagnostics.warnings).toContain(
						"Loading placeholder in a static screen; render content unless a loading state was requested.",
					);
				if (name === "duplicate badge")
					expect(diagnostics.warnings).toContain(
						"Repeated status label in the same component.",
					);
				if (name !== "right edge overflow")
					expect(diagnostics.hard).toEqual([]);
			} finally {
				before.window.close();
				after.window.close();
			}
		}
	});
});
