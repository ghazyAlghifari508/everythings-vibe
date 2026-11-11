import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { indexStudioElements } from "../services/studio-element-document";
import { buildStudioInspectionDocument } from "../services/studio-element-inspection";
import { acceptStudioSelectionMessage } from "../utils/studio-element-bridge";

const context = { projectId: "p", frameId: "f", baseRevision: 2 };
const html =
	'<!doctype html><html><head></head><body><section id="hero"><h1>Welcome</h1></section></body></html>';
const indexed = indexStudioElements(html, context);
const entry = indexed.elements.find((item) => item.selector === "#hero");
if (!entry) throw new Error("Missing hero");
const payload = {
	type: "studio:element:select",
	channel: "12345678-1234-4234-8234-123456789abc",
	projectId: "p",
	frameId: "f",
	baseRevision: 2,
	baseHash: indexed.baseHash,
	elementId: entry.elementId,
	bounds: { x: 5, y: -10, width: 100, height: 80 },
};
const source = {};
const expected = {
	...context,
	baseHash: indexed.baseHash,
	channel: payload.channel,
	source,
	elements: indexed.elements,
};

describe("bounded opaque-origin selection bridge", () => {
	it("accepts only a known DOM identity from the exact sandbox window", () => {
		expect(
			acceptStudioSelectionMessage(
				{ source, origin: "null", data: payload },
				expected,
			),
		).toMatchObject({
			type: "studio:element:select",
			target: { ...entry, bounds: payload.bounds },
		});
	});
	it("accepts bounds updates without treating them as a new selection", () => {
		expect(
			acceptStudioSelectionMessage(
				{
					source,
					origin: "null",
					data: { ...payload, type: "studio:element:bounds" },
				},
				expected,
			),
		).toMatchObject({
			type: "studio:element:bounds",
			target: { ...entry, bounds: payload.bounds },
		});
	});
	it.each([
		{ frameId: "other" },
		{ projectId: "other" },
		{ baseRevision: 3 },
		{ baseHash: "a".repeat(64) },
		{ channel: crypto.randomUUID() },
		{ type: "studio:execute", html: "<script>bad</script>" },
		{ elementId: "unknown" },
		{ bounds: { x: 0, y: 0, width: Infinity, height: 2 } },
	])("rejects mismatched or invalid payload %j", (change) => {
		expect(
			acceptStudioSelectionMessage(
				{ source, origin: "null", data: { ...payload, ...change } },
				expected,
			),
		).toBeNull();
	});
	it("rejects forged sender and non-opaque origin", () => {
		expect(
			acceptStudioSelectionMessage(
				{ source: {}, origin: "null", data: payload },
				expected,
			),
		).toBeNull();
		expect(
			acceptStudioSelectionMessage(
				{ source, origin: "https://untrusted.test", data: payload },
				expected,
			),
		).toBeNull();
	});
	it("sanitizes generated scripts, event handlers, embeds and navigation; injects only its nonce-authorized bridge", async () => {
		const raw = html
			.replace(
				"</head>",
				'<script>parent.evil=true</script><meta http-equiv="refresh" content="0;url=https://evil.test"></head>',
			)
			.replace(
				"<h1>",
				'<iframe src="https://evil.test"></iframe><h1 onclick="evil()">',
			);
		const inspection = await buildStudioInspectionDocument(
			raw,
			context,
			payload.channel,
			"https://studio.test",
		);
		const doc = new JSDOM(inspection.html).window.document;
		expect(doc.querySelectorAll("script")).toHaveLength(1);
		expect(doc.querySelector("script")?.getAttribute("nonce")).toBe(
			payload.channel,
		);
		expect(
			doc.querySelectorAll("iframe, [onclick], meta[http-equiv=refresh]"),
		).toHaveLength(0);
		expect(
			doc
				.querySelector('meta[http-equiv="Content-Security-Policy"]')
				?.getAttribute("content"),
		).toContain(`script-src 'nonce-${payload.channel}'`);
		expect(
			doc
				.querySelector('meta[http-equiv="Content-Security-Policy"]')
				?.getAttribute("content"),
		).not.toContain("unsafe-eval");
		expect(
			inspection.elements.find((item) => item.selector === "#hero")?.signature,
		).toBe(
			indexStudioElements(raw, context).elements.find(
				(item) => item.selector === "#hero",
			)?.signature,
		);
		expect(html).not.toContain("data-ev-editor");
	});
	it("discards forged inspection identities and isolates form and popover behavior", async () => {
		const raw = html.replace(
			"<h1>",
			'<form action="https://evil.test"><input autofocus></form><button popovertarget="hero">Open</button><h1 data-ev-inspect-id="id:hero">',
		);
		const inspection = await buildStudioInspectionDocument(
			raw,
			context,
			payload.channel,
			"https://studio.test",
		);
		const dom = new JSDOM(inspection.html);
		try {
			const heading = dom.window.document.querySelector("h1");
			expect(heading?.getAttribute("data-ev-inspect-id")).not.toBe("id:hero");
			expect(
				dom.window.document.querySelectorAll(
					"[action], [autofocus], [popovertarget]",
				),
			).toHaveLength(0);
		} finally {
			dom.window.close();
		}
	});
});
