// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { rewritePreviewAssets } from "../utils/preview-html";

let frame: HTMLIFrameElement | undefined;
afterEach(() => {
	frame?.remove();
	vi.restoreAllMocks();
});

function reporter(
	source = "<html><head></head><body></body></html>",
	headLinks = "",
	body = "<main>Captured content</main>",
) {
	frame = document.createElement("iframe");
	document.body.append(frame);
	const win = frame.contentWindow as (Window & typeof globalThis) | null;
	if (!win) throw new Error("iframe unavailable");
	const doc = win.document;
	doc.head.innerHTML = headLinks;
	doc.body.innerHTML = body;
	Object.defineProperty(doc, "readyState", {
		configurable: true,
		value: "complete",
	});
	vi.spyOn(win.HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
		width: 100,
		height: 100,
		top: 0,
		left: 0,
		bottom: 100,
		right: 100,
		x: 0,
		y: 0,
		toJSON: () => ({}),
	});
	const post = vi.spyOn(window, "postMessage").mockImplementation(() => {});
	const html = rewritePreviewAssets(
		source,
		"https://example.com/",
		undefined,
		undefined,
		{ visualSnapshot: true },
	);
	const code = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
		.map((m) => m[1])
		.find((s) => s?.includes("vibedesign-preview-ping"));
	if (!code) throw new Error("reporter missing");
	new Function(
		"window",
		"document",
		"parent",
		"Element",
		"getComputedStyle",
		"requestAnimationFrame",
		"MutationObserver",
		code,
	)(
		win,
		doc,
		window,
		win.Element,
		win.getComputedStyle.bind(win),
		(callback: () => void) => callback(),
		win.MutationObserver,
	);
	return { win, doc, post, frame };
}

function lastReport(post: { mock: { calls: unknown[][] } }): unknown {
	return post.mock.calls.at(-1)?.[0];
}

describe("preview reporter stylesheet readiness", () => {
	it("withholds ready until the external stylesheet load settles", () => {
		const { win, post, frame } = reporter(
			"<html><head></head><body></body></html>",
			'<link rel="stylesheet" href="/style.css">',
		);
		const link = (
			frame as HTMLIFrameElement
		).contentWindow?.document.querySelector("link");
		win.dispatchEvent(
			new win.MessageEvent("message", {
				source: window,
				data: { type: "vibedesign-preview-ping" },
			}),
		);
		expect(lastReport(post)).toMatchObject({ state: "preparing" });
		link?.dispatchEvent(new win.Event("load"));
		expect(lastReport(post)).toMatchObject({ state: "ready" });
	});

	it("reports degraded when the stylesheet fails but content is visible", () => {
		const { win, post, frame } = reporter(
			"<html><head></head><body></body></html>",
			'<link rel="stylesheet" href="/missing.css">',
		);
		const link = (
			frame as HTMLIFrameElement
		).contentWindow?.document.querySelector("link");
		link?.dispatchEvent(new win.Event("error"));
		expect(lastReport(post)).toMatchObject({ state: "degraded", failed: 1 });
	});

	it("does not gate on inline styles or non-stylesheet links", () => {
		const { win, post } = reporter(
			'<html><head><link rel="icon" href="/favicon.ico"><style>body{color:red}</style></head><body></body></html>',
		);
		win.dispatchEvent(
			new win.MessageEvent("message", {
				source: window,
				data: { type: "vibedesign-preview-ping" },
			}),
		);
		expect(lastReport(post)).toMatchObject({ state: "ready" });
	});

	it("reports ready when every stylesheet is disabled or inline", () => {
		const { win, post } = reporter(
			"<html><head></head><body></body></html>",
			'<link rel="stylesheet" href="/alt.css" disabled>',
		);
		win.dispatchEvent(
			new win.MessageEvent("message", {
				source: window,
				data: { type: "vibedesign-preview-ping" },
			}),
		);
		expect(lastReport(post)).toMatchObject({ state: "ready" });
	});

	it("reports ready immediately when there are no external stylesheets", () => {
		const { win, post } = reporter();
		win.dispatchEvent(
			new win.MessageEvent("message", {
				source: window,
				data: { type: "vibedesign-preview-ping" },
			}),
		);
		expect(lastReport(post)).toMatchObject({ state: "ready" });
	});

	it("keeps the verdict preparing while content is visible but the stylesheet has not settled", () => {
		const { win, post, frame } = reporter(
			"<html><head></head><body></body></html>",
			'<link rel="stylesheet" href="/slow.css">',
		);
		const link = (
			frame as HTMLIFrameElement
		).contentWindow?.document.querySelector("link");
		win.dispatchEvent(
			new win.MessageEvent("message", {
				source: window,
				data: { type: "vibedesign-preview-ping" },
			}),
		);
		expect(lastReport(post)).toMatchObject({ state: "preparing" });
		expect(lastReport(post)).not.toMatchObject({ state: "ready" });
		link?.dispatchEvent(new win.Event("load"));
		expect(lastReport(post)).toMatchObject({ state: "ready" });
	});
});
