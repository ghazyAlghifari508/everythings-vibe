import { describe, expect, it } from "vitest";
import { rewritePreviewAssets } from "@/features/scrape/utils/preview-html";

// Security regression guard for the preview boundary. Every assertion here
// describes a protection that must survive any future change to the preview
// pipeline: if one of these fails, the fix traded safety for convenience.
describe("preview capture security contract", () => {
	const SOURCE = '<html><head></head><body><img src="/a.png"></body></html>';

	it("never grants the iframe same-origin access", () => {
		const rewritten = rewritePreviewAssets(SOURCE, "https://example.com");
		expect(rewritten).not.toContain("allow-same-origin");
		expect(rewritten).not.toContain("allow-top-navigation");
		expect(rewritten).not.toContain("allow-popups");
		expect(rewritten).not.toContain("allow-modals");
	});

	it("routes every captured subresource through the signed asset proxy", () => {
		const rewritten = rewritePreviewAssets(
			'<html><head><link rel="stylesheet" href="/s.css"></head><body><img src="/i.png"><video poster="/p.jpg"></video></body></html>',
			"https://example.com",
		);
		expect(rewritten).toContain("/api/scrape/asset?url=");
		expect(rewritten).not.toMatch(/<img src="https:\/\/example\.com/);
		expect(rewritten).not.toMatch(/<video poster="https:\/\/example\.com/);
	});

	it("strips the captured document's own CSP and base so they cannot be widened", () => {
		const rewritten = rewritePreviewAssets(
			'<html><head><meta http-equiv="Content-Security-Policy" content="default-src *"><base href="https://evil.example/"></head><body></body></html>',
			"https://example.com",
		);
		expect(rewritten).not.toMatch(/content-security-policy/i);
		expect(rewritten).not.toMatch(/<base\b/i);
	});

	it("keeps non-http schemes from being proxied as remote fetches", () => {
		const rewritten = rewritePreviewAssets(
			'<html><body><img src="javascript:alert(1)"><a href="mailto:x@y.z"></a></body></html>',
			"https://example.com",
		);
		expect(rewritten).toContain("javascript:alert(1)");
		expect(rewritten).not.toContain(encodeURIComponent("javascript:alert(1)"));
	});

	it("does not let a data URL become a proxy target", () => {
		const rewritten = rewritePreviewAssets(
			'<html><body><img src="data:image/png;base64,AAAA"></body></html>',
			"https://example.com",
		);
		expect(rewritten).toContain("data:image/png;base64,AAAA");
		expect(rewritten).not.toContain(encodeURIComponent("data:image/png"));
	});

	it("neutralizes the storage and cookie surface of the captured document", () => {
		const rewritten = rewritePreviewAssets(SOURCE, "https://example.com");
		expect(rewritten).toContain('"localStorage","sessionStorage"');
		expect(rewritten).toContain("document.cookie");
	});

	it("keeps exactly one reporter so the parent cannot be flooded by duplicates", () => {
		const first = rewritePreviewAssets(SOURCE, "https://example.com");
		const second = rewritePreviewAssets(
			first,
			"https://example.com",
			(target: string) => target,
		);
		const reporters = (html: string) =>
			[...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)]
				.map((match) => match[1] ?? "")
				.filter((body) => body.includes("vibedesign-preview-ping")).length;
		expect(reporters(first)).toBe(1);
		expect(reporters(second)).toBe(1);
	});
});
