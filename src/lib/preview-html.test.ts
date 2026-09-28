import { describe, expect, it } from "vitest";
import { cleanPreviewHtml, rewriteCssUrls } from "./preview-html";

describe("cleanPreviewHtml", () => {
	it("strips script tags and rewrites relative resources to asset proxy", () => {
		const raw = `<html><head><script>alert('xss')</script><link rel="stylesheet" href="/styles.css"></head><body><img src="/logo.png"></body></html>`;
		const cleaned = cleanPreviewHtml(raw, "https://example.com");

		expect(cleaned).not.toContain("<script>");
		expect(cleaned).toContain(
			"/api/scrape/asset?url=https%3A%2F%2Fexample.com%2Fstyles.css",
		);
		expect(cleaned).toContain(
			"/api/scrape/asset?url=https%3A%2F%2Fexample.com%2Flogo.png",
		);
	});

	it("rewrites css url() references to asset proxy", () => {
		const rewritten = rewriteCssUrls(
			`.hero { background: url(/bg.jpg); }`,
			"https://example.com",
		);
		expect(rewritten).toContain(
			"/api/scrape/asset?url=https%3A%2F%2Fexample.com%2Fbg.jpg",
		);
	});
});
