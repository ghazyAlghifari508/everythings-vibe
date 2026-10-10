import { chromium } from "playwright";
import { describe, expect, it } from "vitest";
import {
	buildPreviewSrcDoc,
	rewritePreviewModule,
	verifyPreviewAssetCapability,
} from "./preview-capabilities";
import { buildScrapePreviewDocument } from "./scrape-preview-document";

describe("visual snapshot browser contract", () => {
	it("loads signed static, literal dynamic, and nested modules from an opaque iframe", async () => {
		const secret = "module fixture secret with enough entropy";
		const options = {
			baseUrl: "https://cdn.example/app/index.html",
			appOrigin: "https://app.example",
			scrapeId: "fixture",
			ownerId: "owner",
			expiresAt: Date.now() + 60_000,
			secret,
		};
		const modules = new Map([
			[
				"https://cdn.example/app/main.mjs",
				'import { value } from "./nested/child.mjs"; const result = await import("./dynamic.mjs"); document.body.textContent = value + result.value; document.body.dataset.base = new URL("./icon.svg", import.meta.url).href;',
			],
			[
				"https://cdn.example/app/nested/child.mjs",
				'export { value } from "../shared.mjs";',
			],
			["https://cdn.example/app/shared.mjs", 'export const value = "static-";'],
			[
				"https://cdn.example/app/dynamic.mjs",
				'export const value = "dynamic";',
			],
		]);
		const browser = await chromium.launch({ headless: true });
		try {
			const page = await browser.newPage();
			const requests: string[] = [];
			const errors: string[] = [];
			page.on("pageerror", (error) => errors.push(error.message));
			await page.route("**/*", async (route) => {
				requests.push(route.request().url());
				const token = new URL(route.request().url()).searchParams.get("cap");
				const claims = verifyPreviewAssetCapability(token ?? "", secret);
				const source = claims && modules.get(claims.target);
				if (!claims || !source) return route.abort();
				return route.fulfill({
					body: await rewritePreviewModule(source, claims.target, options),
					headers: {
						"content-type": "text/javascript",
						"access-control-allow-origin": "*",
					},
				});
			});
			await page.setContent('<iframe sandbox="allow-scripts"></iframe>');
			const html = buildPreviewSrcDoc(
				'<html><head></head><body><script type="module" src="./main.mjs"></script></body></html>',
				options,
			);
			await page
				.locator("iframe")
				.evaluate((frame, doc) => frame.setAttribute("srcdoc", doc), html);
			const frame = page.frames()[1];
			await frame.waitForFunction(
				() => document.body.textContent === "static-dynamic",
			);
			expect(await frame.locator("body").getAttribute("data-base")).toBe(
				"https://cdn.example/app/icon.svg",
			);
			expect(errors).toEqual([]);
			expect(requests).toHaveLength(4);
			expect(
				requests.every((url) => new URL(url).pathname === "/api/scrape/asset"),
			).toBe(true);
		} finally {
			await browser.close();
		}
	}, 30_000);
	it("measures empty roots and visible content without executing captured code", async () => {
		const browser = await chromium.launch({ headless: true });
		try {
			const page = await browser.newPage();
			for (const [html, expected] of [
				['<div id="root"></div>', "empty"],
				['<main style="opacity:0"><h1>Hidden content</h1></main>', "empty"],
				[
					"<main><h1>Visible content</h1></main><script>document.body.remove()</script>",
					"ready",
				],
			] as const) {
				const preview = buildScrapePreviewDocument(
					{
						id: "fixture",
						status: "completed",
						mode: "html",
						sourceUrl: "https://example.com/",
						html: `<html><head></head><body>${html}</body></html>`,
					},
					"owner",
					"https://app.example",
					Date.now(),
					"browser fixture secret with enough entropy",
				);
				await page.setContent(
					'<script>window.reports=[];addEventListener("message",e=>window.reports.push(e.data))</script><iframe sandbox="allow-scripts"></iframe>',
				);
				await page.locator("iframe").evaluate((frame, doc) => {
					frame.setAttribute("srcdoc", doc);
				}, preview?.srcDoc ?? "");
				await page.waitForFunction(() =>
					Reflect.get(window, "reports").some(
						(report: { state: string }) =>
							report.state === "ready" || report.state === "empty",
					),
				);
				const reports: Array<{ state: string }> = await page.evaluate(() =>
					Reflect.get(window, "reports"),
				);
				expect(reports.at(-1)?.state).toBe(expected);
			}
		} finally {
			await browser.close();
		}
	}, 30_000);
});
