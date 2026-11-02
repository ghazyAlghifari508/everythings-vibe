import { describe, expect, it } from "vitest";
import { rewritePreviewAssets } from "@/features/scrape/utils/preview-html";
import { buildScrapePreviewDocument } from "@/features/scrape/utils/scrape-preview-document";

const BASE = "https://example.com/landing";

function snapshot(
	html: string,
	resolve: (target: string) => string = (target) => target,
): string {
	return rewritePreviewAssets(html, BASE, resolve, new Map(), {
		visualSnapshot: true,
	});
}

function shellCount(html: string): number {
	return [...html.matchAll(/data-vibe-preview-scroll/gi)].length;
}

/**
 * The preview has one real scroll problem to solve: a captured page can lock
 * its own root scroller (`html,body{overflow:hidden}`) and then move it with
 * script the snapshot never runs, which left every section below the first
 * viewport unreachable. These fixtures pin the narrow fix.
 */
describe("preview scroll shell", () => {
	const locked = `<html><head><style>html,body{height:100%;overflow:hidden}body{background:#fff}</style></head><body><section id="hero">Hero</section><div id="app" style="height:100%;overflow-y:auto"><section id="one">One</section><section id="two">Two</section></div></body></html>`;

	it("restores the root scroller of a page that locked it", () => {
		const rewritten = snapshot(locked);
		expect(rewritten).toContain("data-vibe-preview-scroll");
		expect(rewritten).toContain("overflow-y:auto!important");
		expect(rewritten).toContain("height:auto!important");
	});

	it("never puts overflow on elements other than html and body", () => {
		const shell = snapshot(locked).match(
			/<style data-vibe-preview-scroll>[\s\S]*?<\/style>/i,
		)?.[0];
		expect(shell).toBeDefined();
		expect(shell).toContain("html,body{");
		// No universal selector, no blanket overflow rule for nested elements.
		expect(shell).not.toContain("*{");
		expect(shell?.match(/\{/g)).toHaveLength(1);
	});

	it("keeps a nested scroll container exactly as the source authored it", () => {
		const rewritten = snapshot(locked);
		expect(rewritten).toContain(
			'<div id="app" style="height:100%;overflow-y:auto">',
		);
	});

	it("keeps external images and assets routed through the proxy alongside the shell", () => {
		const rewritten = snapshot(
			'<html><body><img src="/hero.png" srcset="/hero.png 1x, /hero@2x.png 2x"><link rel="stylesheet" href="/site.css"></body></html>',
			(target) => `/api/scrape/asset?url=${encodeURIComponent(target)}`,
		);
		expect(rewritten).toContain("data-vibe-preview-scroll");
		expect(rewritten).toContain(
			"/api/scrape/asset?url=https%3A%2F%2Fexample.com%2Fhero.png",
		);
		expect(rewritten).toContain(
			"/api/scrape/asset?url=https%3A%2F%2Fexample.com%2Fhero%402x.png",
		);
		expect(rewritten).toContain(
			"/api/scrape/asset?url=https%3A%2F%2Fexample.com%2Fsite.css",
		);
	});

	it("keeps every section of a long document in the rewritten snapshot", () => {
		const sections = Array.from(
			{ length: 40 },
			(_, index) => `<section id="section-${index}">Section ${index}</section>`,
		).join("");
		const rewritten = snapshot(`<html><body>${sections}</body></html>`);
		for (let index = 0; index < 40; index += 1)
			expect(rewritten).toContain(`id="section-${index}"`);
	});

	it("adds the shell once, even when a processed document is processed again", () => {
		const first = snapshot(locked);
		const second = snapshot(first);
		expect(shellCount(first)).toBe(1);
		expect(shellCount(second)).toBe(1);
	});

	it("keeps the shell out of the stored standalone document", () => {
		const stored = rewritePreviewAssets(locked, BASE, (target) => target);
		expect(stored).not.toContain("data-vibe-preview-scroll");
	});

	it("reaches the app through the signed snapshot the preview actually renders", () => {
		const preview = buildScrapePreviewDocument(
			{
				id: "scrape-1",
				status: "completed",
				mode: "html",
				sourceUrl: BASE,
				html: locked,
			},
			"owner",
			"https://app.example",
			Date.now(),
			"preview fixture secret with enough entropy",
		);
		expect(preview?.srcDoc).toContain("data-vibe-preview-scroll");
		expect(preview?.srcDoc).toContain("form-action 'none'");
	});
});

describe("preview readiness report contract", () => {
	// A snapshot renders without the page's own scripts, so the only errors it
	// can observe are resource errors. Treating a broken <video>/<source>/<link>
	// as fatal made a rendered page report "failed" purely because one asset was
	// missing, which is what pushed the surface into the screenshot fallback.
	it("classifies every resource element as a resource error, not a script failure", () => {
		const reporter = snapshot("<html><body><p>hi</p></body></html>").match(
			/<script>\(\(\)=>\{if\(window\.parent===window\)return;let failed=0;[\s\S]*?<\/script>/,
		)?.[0];
		expect(reporter).toBeDefined();
		expect(reporter).toContain(
			"IMG|LINK|SOURCE|VIDEO|AUDIO|TRACK|SCRIPT|IFRAME|EMBED|OBJECT|PICTURE",
		);
	});

	it("reports the document height so the frame can grow to the whole page", () => {
		const rewritten = snapshot("<html><body><p>hi</p></body></html>");
		expect(rewritten).toContain("height:h");
		expect(rewritten).toContain("scrollHeight");
	});
});
