// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { rewritePreviewAssets } from "../utils/preview-html";

let frame: HTMLIFrameElement | undefined;
afterEach(() => {
	frame?.remove();
	vi.restoreAllMocks();
});

function reporter(source = "<html><head></head><body></body></html>") {
	frame = document.createElement("iframe");
	document.body.append(frame);
	const win = frame.contentWindow as (Window & typeof globalThis) | null;
	if (!win) throw new Error("iframe unavailable");
	const doc = win.document;
	doc.body.innerHTML = "<main>Captured content</main><img>";
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
	return { win, doc, post };
}

describe("preview frame reporter behavior", () => {
	it("keeps usable content visible after a nonfatal asset error", () => {
		const { win, doc, post } = reporter();
		doc.querySelector("img")?.dispatchEvent(new win.Event("error"));
		expect(post.mock.calls.at(-1)?.[0]).toMatchObject({
			state: "degraded",
			failed: 1,
		});
	});

	it("reports delayed captured content for a script-heavy source without executing its scripts", () => {
		const { win, doc, post } = reporter(
			'<html><head><script src="/app.js"></script></head><body><main id="root"></main><script>throw new Error("must not execute")</script></body></html>',
		);
		doc.body.innerHTML = "";
		win.dispatchEvent(
			new win.MessageEvent("message", {
				source: window,
				data: { type: "vibedesign-preview-ping" },
			}),
		);
		expect(post.mock.calls.at(-1)?.[0]).toMatchObject({ state: "empty" });
		doc.body.innerHTML = "<main>Delayed captured content</main>";
		win.dispatchEvent(
			new win.MessageEvent("message", {
				source: window,
				data: { type: "vibedesign-preview-ping" },
			}),
		);
		expect(post.mock.calls.at(-1)?.[0]).toMatchObject({ state: "ready" });
	});

	it("reports a fatal document error when no content is usable", () => {
		const { win, doc, post } = reporter();
		doc.body.innerHTML = "";
		win.dispatchEvent(new win.ErrorEvent("error"));
		expect(post.mock.calls.at(-1)?.[0]).toMatchObject({ state: "failed" });
	});
});
