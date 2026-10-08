import { describe, expect, it } from "vitest";
import { rewriteCssUrls, rewritePreviewAssets } from "./preview-html";

describe("rewritePreviewAssets", () => {
	it("rewrites static resource URLs to the asset proxy", () => {
		const raw = `<html><head><link rel="stylesheet" href="/styles.css"></head><body><img src="/logo.png"></body></html>`;
		const rewritten = rewritePreviewAssets(raw, "https://example.com");

		expect(rewritten).toContain(
			"/api/scrape/asset?url=https%3A%2F%2Fexample.com%2Fstyles.css",
		);
		expect(rewritten).toContain(
			"/api/scrape/asset?url=https%3A%2F%2Fexample.com%2Flogo.png",
		);
	});

	it("rewrites css url() references to the asset proxy", () => {
		const rewritten = rewriteCssUrls(
			`.hero { background: url(/bg.jpg); }`,
			"https://example.com",
		);
		expect(rewritten).toContain(
			"/api/scrape/asset?url=https%3A%2F%2Fexample.com%2Fbg.jpg",
		);
	});

	it("rewrites srcset candidates to the asset proxy", () => {
		const raw = `<html><head></head><body><img srcset="/a.png 1x, /b.png 2x"></body></html>`;
		const rewritten = rewritePreviewAssets(raw, "https://example.com");
		expect(rewritten).toContain(
			"/api/scrape/asset?url=https%3A%2F%2Fexample.com%2Fa.png",
		);
		expect(rewritten).toContain(
			"/api/scrape/asset?url=https%3A%2F%2Fexample.com%2Fb.png",
		);
	});

	it("removes CSP meta and base behavior while keeping scripts", () => {
		const raw = `<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'self'"><base href="https://example.com/sub/"><script src="/app.js"></script></head><body></body></html>`;
		const rewritten = rewritePreviewAssets(raw, "https://example.com/page");

		expect(rewritten).not.toMatch(/content-security-policy/i);
		expect(rewritten).not.toMatch(/<base\b/i);
		expect(rewritten).toContain("/api/scrape/asset?url=");
		expect(rewritten).toMatch(/<script src="\/api\/scrape\/asset\?url=/);
	});

	it("injects a runtime shim for dynamically created asset references", () => {
		const raw = `<html><head></head><body></body></html>`;
		const rewritten = rewritePreviewAssets(raw, "https://example.com");
		expect(rewritten).toContain("setAttribute");
		expect(rewritten).toContain("MutationObserver");
		expect(rewritten).toContain("/api/scrape/asset?url=");
	});
});
