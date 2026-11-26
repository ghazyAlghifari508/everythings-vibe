import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { indexStudioElements } from "../services/studio-element-document";
import { buildStudioInspectionDocument } from "../services/studio-element-inspection";
import {
	acceptStudioRendererMessage,
	acceptStudioSelectionMessage,
} from "../utils/studio-element-bridge";

const context = { projectId: "p", frameId: "f", baseRevision: 2 };
const channel = "12345678-1234-4234-8234-123456789abc";
const html =
	'<!doctype html><html><head><style>.hero{min-height:100vh}</style></head><body><section id="hero" class="hero"><h1>Welcome</h1><img src="/api/studio/asset?id=missing"><i data-lucide="home"></i></section></body></html>';

describe("one persisted HTML across renderer modes", () => {
	it("the live document leaves the persisted HTML and its identity untouched", async () => {
		const before = indexStudioElements(html, context);
		const live = await buildStudioInspectionDocument(
			html,
			context,
			channel,
			"https://studio.test",
		);
		expect(live.baseHash).toBe(before.baseHash);
		expect(html).not.toContain("data-ev-inspect-id");
		expect(html).not.toContain("studio:renderer");
		expect(live.html).toContain("data-ev-inspect-id");
	});
	it("editor overlays and bridge code exist only in the ephemeral document", async () => {
		const live = await buildStudioInspectionDocument(
			html,
			context,
			channel,
			"https://studio.test",
		);
		const dom = new JSDOM(live.html);
		try {
			expect(dom.window.document.querySelectorAll("script")).toHaveLength(1);
			expect(live.html).toContain("studio:renderer:ready");
			expect(live.html).toContain("--ev-vh");
			expect(live.html).not.toMatch(/min-height:100vh/);
		} finally {
			dom.window.close();
		}
		expect(html).not.toContain("--ev-vh");
	});
	it("reports unresolved assets and unrendered icons without regenerating", async () => {
		const live = await buildStudioInspectionDocument(
			html,
			context,
			channel,
			"https://studio.test",
		);
		expect(live.unresolvedAssets).toBe(1);
		expect(live.unrenderedIcons).toBe(1);
	});
	it("the sandbox keeps untrusted markup inert in every mode", async () => {
		const live = await buildStudioInspectionDocument(
			html.replace("<h1>", '<script>parent.x=1</script><h1 onclick="x()">'),
			context,
			channel,
			"https://studio.test",
		);
		const dom = new JSDOM(live.html);
		try {
			expect(dom.window.document.querySelectorAll("[onclick]")).toHaveLength(0);
			expect(
				dom.window.document
					.querySelector("script")
					?.textContent?.includes("parent.x"),
			).toBe(false);
		} finally {
			dom.window.close();
		}
	});
});

describe("renderer bridge message validation", () => {
	const hash = "b".repeat(64);
	const source = {};
	const expected = { ...context, baseHash: hash, channel, source };
	const ready = {
		type: "studio:renderer:ready",
		...context,
		baseHash: hash,
		channel,
		scrollWidth: 1440,
		scrollHeight: 2000,
		unresolvedImages: 1,
	};
	it("accepts a valid ready message from the exact window", () => {
		expect(
			acceptStudioRendererMessage(
				{ source, origin: "null", data: ready },
				expected,
			),
		).toEqual({
			type: "ready",
			metrics: { scrollWidth: 1440, scrollHeight: 2000 },
			unresolvedImages: 1,
		});
	});
	it("treats metrics as a separate message type", () => {
		const { unresolvedImages: _omit, ...rest } = ready;
		expect(
			acceptStudioRendererMessage(
				{
					source,
					origin: "null",
					data: { ...rest, type: "studio:renderer:metrics" },
				},
				expected,
			)?.type,
		).toBe("metrics");
	});
	it.each([
		{ frameId: "other" },
		{ projectId: "other" },
		{ baseRevision: 9 },
		{ baseHash: "c".repeat(64) },
		{ channel: crypto.randomUUID() },
		{ type: "studio:renderer:exec" },
		{ scrollHeight: Number.POSITIVE_INFINITY },
		{ scrollHeight: -1 },
		{ extra: "field" },
	])("rejects unauthorized or malformed %j", (change) => {
		expect(
			acceptStudioRendererMessage(
				{ source, origin: "null", data: { ...ready, ...change } },
				expected,
			),
		).toBeNull();
	});
	it("rejects a forged sender or a non-opaque origin", () => {
		expect(
			acceptStudioRendererMessage(
				{ source: {}, origin: "null", data: ready },
				expected,
			),
		).toBeNull();
		expect(
			acceptStudioRendererMessage(
				{ source, origin: "https://evil.test", data: ready },
				expected,
			),
		).toBeNull();
		expect(
			acceptStudioRendererMessage(
				{ source, origin: "null", data: ready },
				{ ...expected, source: undefined },
			),
		).toBeNull();
	});
	it("a renderer message is never accepted as an element selection", () => {
		expect(
			acceptStudioSelectionMessage(
				{ source, origin: "null", data: ready },
				{ ...expected, elements: [] },
			),
		).toBeNull();
	});
	it("a sibling frame's channel is rejected (frame isolation)", () => {
		expect(
			acceptStudioRendererMessage(
				{
					source,
					origin: "null",
					data: { ...ready, frameId: "sibling", channel: crypto.randomUUID() },
				},
				expected,
			),
		).toBeNull();
	});
});

describe("legacy documents", () => {
	it("an old project's plain HTML still produces a displayable live document", async () => {
		const legacy = "<html><body><p>Lama</p></body></html>";
		const live = await buildStudioInspectionDocument(
			legacy,
			context,
			channel,
			"https://studio.test",
		);
		expect(live.html).toContain("Lama");
		expect(live.unresolvedAssets).toBe(0);
	});
});
