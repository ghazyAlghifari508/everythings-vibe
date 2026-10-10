import { describe, expect, it } from "vitest";
import { rewritePreviewAssets } from "./preview-html";

describe("preview load reporting shim", () => {
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
