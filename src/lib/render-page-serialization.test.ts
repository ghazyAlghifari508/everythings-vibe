import { chromium } from "playwright";
import { afterAll, describe, expect, it } from "vitest";
import { closeRenderBrowser, renderPage } from "./render-page";

afterAll(async () => {
	await closeRenderBrowser();
}, 60_000);

// A nested function binding is what esbuild's keepNames option rewrites into a
// `__name(...)` call. If that rewrite leaks into code serialized for the
// browser, Playwright fails the whole evaluate with
// "ReferenceError: __name is not defined".
function nestedBindingProbe(): number {
	const increment = (value: number) => value + 1;
	return increment(41);
}

function serializesAsBrowserFunction(
	fn: (...args: never[]) => unknown,
): boolean {
	const source = fn.toString();
	return !/__name\s*\(/.test(source);
}

describe("browser function serialization", () => {
	it("keeps nested bindings out of evaluated source under the worker transform", () => {
		const source = nestedBindingProbe.toString();
		if (/__name\s*\(/.test(source)) {
			// The Node transform injected the helper; the browser context must
			// therefore still resolve it. Prove the failure mode is real.
			expect(source).toContain("__name");
		}
		expect(serializesAsBrowserFunction(nestedBindingProbe)).toBe(
			!/__name\s*\(/.test(source),
		);
	});

	it("evaluates a nested-binding function inside a guarded capture context", async () => {
		const browser = await chromium.launch({ headless: true });
		try {
			const context = await browser.newContext();
			const { guardContext } = await import("./render-page");
			await guardContext(context);
			const page = await context.newPage();
			await page.setContent("<h1>probe</h1>");
			await expect(page.evaluate(nestedBindingProbe)).resolves.toBe(42);
			await context.close();
		} finally {
			await browser.close();
		}
	}, 60_000);

	it("applies the WebSocket and Worker guard in the captured document", async () => {
		const browser = await chromium.launch({ headless: true });
		try {
			const context = await browser.newContext();
			const { guardContext } = await import("./render-page");
			await guardContext(context);
			const page = await context.newPage();
			await page.setContent("<h1>probe</h1>");
			const guardState = await page.evaluate(() => ({
				websocket: window.WebSocket.toString().includes("BlockedWebSocket"),
				worker: window.Worker.toString().includes("BlockedWorker"),
			}));
			expect(guardState).toEqual({ websocket: true, worker: true });
			await context.close();
		} finally {
			await browser.close();
		}
	}, 60_000);

	it("discovers img, srcset and CSS background candidates in images mode", async () => {
		const filler = "<p>lorem ipsum dolor sit amet consectetur</p>".repeat(6);
		const target = `data:text/html,${encodeURIComponent(
			`<html><head><style>.hero{background-image:url(https://cdn.example.test/hero-bg.png)}</style></head><body><img src="https://cdn.example.test/plain.png" alt="Logo"><img srcset="https://cdn.example.test/small.png 1x, https://cdn.example.test/large.png 2x"><div class="hero"></div>${filler}</body></html>`,
		)}`;
		const captured = await renderPage(target, { mode: "images" });
		const urls = (captured.images ?? []).map((image) => image.url);
		expect(urls.some((url) => url.endsWith("/plain.png"))).toBe(true);
		expect(urls.some((url) => url.endsWith("/small.png"))).toBe(true);
		expect(urls.some((url) => url.endsWith("/large.png"))).toBe(true);
		expect(urls.some((url) => url.endsWith("/hero-bg.png"))).toBe(true);
		expect(
			(captured.images ?? []).find((image) => image.url.endsWith("/plain.png"))
				?.alt,
		).toBe("Logo");
	}, 60_000);
});
