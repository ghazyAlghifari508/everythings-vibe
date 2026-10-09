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
	it("rewrites CSS contexts without changing script source", () => {
		const script = `<script>const font = new URL("https://example.com/font.woff2"); const text = "url(/literal.png)"; const pattern = /url\\(\\/regex\\.png\\)/;</script>`;
		const raw = `<html><head>${script}<style>.hero{background:url("/hero.png")}</style></head><body><div style="background:url('/inline.png')"></div></body></html>`;
		const rewritten = rewritePreviewAssets(raw, "https://example.com/page");

		expect(rewritten).toContain(script);
		expect(rewritten).toContain(
			`<style>.hero{background:url("/api/scrape/asset?url=https%3A%2F%2Fexample.com%2Fhero.png")}</style>`,
		);
		expect(rewritten).toContain(
			`style="background:url('/api/scrape/asset?url=https%3A%2F%2Fexample.com%2Finline.png')"`,
		);
	});
	it("preserves entity-quoted data URLs in inline styles", () => {
		const html = `<div style="background-image: url(&quot;data:image/webp;base64,AAAA&quot;)"></div>`;

		const rewritten = rewritePreviewAssets(html, "https://www.framer.com/");

		expect(rewritten).toContain(
			`style="background-image: url(&quot;data:image/webp;base64,AAAA&quot;)"`,
		);
		expect(rewritten).not.toContain("%26quot%3Bdata%3Aimage%2Fwebp");
	});
	it("preserves amp-escaped entity quotes around inline data URLs", () => {
		const html = `<div style="background-image: url(&amp;quot;data:image/webp;base64,AAAA&amp;quot;)"></div>`;

		const rewritten = rewritePreviewAssets(html, "https://www.framer.com/");

		expect(rewritten).toContain(
			`style="background-image: url(&quot;data:image/webp;base64,AAAA&quot;)"`,
		);
		expect(rewritten).not.toContain("%26amp%3Bquot%3Bdata%3Aimage%2Fwebp");
		expect(rewritten).not.toContain("%26quot%3Bdata%3Aimage%2Fwebp");
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
	it("preserves data URI commas and descriptors while rewriting adjacent image candidates", () => {
		const dataSvg = "data:image/svg+xml,%3Csvg%3E%3C/svg%3E";
		const raw = `<img srcset="${dataSvg} 1x, /first.png 2x, data:image/png;base64,AAAA 3x, /second.png 4x">`;
		const rewritten = rewritePreviewAssets(raw, "https://example.com/page");

		expect(rewritten).toContain(
			`<img srcset="${dataSvg} 1x, /api/scrape/asset?url=https%3A%2F%2Fexample.com%2Ffirst.png 2x, data:image/png;base64,AAAA 3x, /api/scrape/asset?url=https%3A%2F%2Fexample.com%2Fsecond.png 4x">`,
		);
		expect(rewritten).not.toContain('clean(v).split(",")');
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
