// @vitest-environment jsdom
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
	it("does not wrap a relative proxy URL when the runtime scans resources", () => {
		const html = rewritePreviewAssets(
			'<html><head></head><body><img src="/api/scrape/asset?url=sample"></body></html>',
			"https://example.com/",
		);
		document.documentElement.innerHTML = html;
		new Function(inlineScripts(html)[0])();
		document.dispatchEvent(new Event("DOMContentLoaded"));
		expect(document.querySelector("img")?.getAttribute("src")).toBe(
			"/api/scrape/asset?url=sample",
		);
	});
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

	it("answers a parent ping so a late listener still learns the load result", () => {
		const rewritten = rewritePreviewAssets(
			"<html><head></head><body><p>hi</p></body></html>",
			"https://example.com/",
		);
		const reporter = inlineScripts(rewritten).find((s) =>
			s.includes("vibedesign-preview"),
		);
		expect(reporter).toBeDefined();
		expect(reporter).toContain('addEventListener("message"');
		expect(reporter).toContain("vibedesign-preview-ping");
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

		const reporters = (html: string) =>
			[...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)]
				.map((m) => m[1] ?? "")
				.filter((body) => body.includes("vibedesign-preview-ping")).length;

		expect(reporters(first)).toBe(1);
		expect(reporters(second)).toBe(1);
	});
});
