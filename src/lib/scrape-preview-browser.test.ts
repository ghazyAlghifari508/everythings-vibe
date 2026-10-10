import { chromium } from "playwright";
import { describe, expect, it } from "vitest";
import { buildScrapePreviewDocument } from "./scrape-preview-document";

describe("visual snapshot browser contract", () => {
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
