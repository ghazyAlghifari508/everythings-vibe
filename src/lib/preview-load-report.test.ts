import { describe, expect, it } from "vitest";
import { rewritePreviewAssets } from "./preview-html";

function inlineScripts(html: string): string[] {
	return [
		...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi),
	]
		.map((m) => m[1] ?? "")
		.filter((body) => body.trim().length > 0);
}

describe("preview load reporting shim", () => {
	it("emits syntactically valid inline scripts", () => {
		const rewritten = rewritePreviewAssets(
			'<html><head></head><body><img src="/a.png"><script src="/b.js"></script></body></html>',
			"https://example.com/",
		);

		for (const source of inlineScripts(rewritten)) {
			expect(() => new Function(source)).not.toThrow();
		}
	});

	it("leaves already-proxied asset urls untouched in the emitted shim", () => {
		const rewritten = rewritePreviewAssets(
			"<html><head></head><body></body></html>",
			"https://example.com/",
		);
		const source = inlineScripts(rewritten).join("\n");

		expect(source).toContain(
			"asset=/^(?:\\/|https?:\\/\\/[^/]+)\\/api\\/scrape\\/asset?/i",
		);
		expect(source).toContain('KNOWN[u]||"/api/scrape/asset?url="');
	});

	it("reports document readiness to the parent frame", () => {
		const rewritten = rewritePreviewAssets(
			"<html><head></head><body><p>hi</p></body></html>",
			"https://example.com/",
		);
		expect(rewritten).toContain("parent.postMessage");
		expect(rewritten).toContain("vibedesign-preview");
	});

	it("reports failures for blocked or errored external resources", () => {
		const rewritten = rewritePreviewAssets(
			'<html><head></head><body><img src="/broken.png"></body></html>',
			"https://example.com/",
		);
		expect(rewritten).toContain('addEventListener("error"');
	});

	it("never relaxes the sandbox by granting same-origin access", () => {
		const rewritten = rewritePreviewAssets(
			"<html><head></head><body></body></html>",
			"https://example.com/",
		);
		expect(rewritten).not.toContain("allow-same-origin");
	});

	it("injects exactly one reporter when a document is rewritten again", () => {
		const first = rewritePreviewAssets(
			'<html><head></head><body><img src="/a.png"></body></html>',
			"https://example.com/",
		);
		const second = rewritePreviewAssets(
			first,
			"https://example.com/",
			(target: string) => target,
		);

		expect(second.match(/vibedesign-preview/g) ?? []).toHaveLength(1);
	});
});
