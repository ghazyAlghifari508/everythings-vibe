import type { Page } from "playwright";
import { describe, expect, it, vi } from "vitest";
import { inlineIframes } from "@/features/scrape/services/render-page-helpers";
import { SCRAPE_MAX_HTML_BYTES } from "@/features/scrape/types/scrape-constants";
import { SCRAPE_LIMITS } from "@/features/scrape/types/scrape-contract";

interface MockFrameOptions {
	url: string;
	content?: string | (() => Promise<string>);
	outerHTML?: string;
	failsContent?: boolean;
	failsElement?: boolean;
}

function createMockPage(pageUrl: string, frames: MockFrameOptions[] = []) {
	const mainFrame = {
		url: () => pageUrl,
	};
	const childFrames = frames.map((opts) => ({
		url: () => opts.url,
		content: async () => {
			if (opts.failsContent) throw new Error("Frame content load error");
			if (typeof opts.content === "function") return opts.content();
			return opts.content ?? "<div>Default frame content</div>";
		},
		frameElement: async () => {
			if (opts.failsElement) throw new Error("Frame element detached");
			return {
				evaluate: async () =>
					opts.outerHTML ?? `<iframe src="${opts.url}"></iframe>`,
			};
		},
	}));

	return {
		url: () => pageUrl,
		frames: () => [mainFrame, ...childFrames],
	} as unknown as Page;
}

describe("inlineIframes", () => {
	it("returns HTML unmodified when the page has no iframes", async () => {
		const html = "<html><body><h1>Sample</h1></body></html>";
		const page = createMockPage("https://example.com/page", []);

		const offResult = await inlineIframes(page, html, {
			includeIframes: false,
		});
		expect(offResult).toBe(html);

		const onResult = await inlineIframes(page, html, { includeIframes: true });
		expect(onResult).toBe(html);
	});

	it("does not inline iframes when includeIframes is false (OFF / default)", async () => {
		const html =
			'<html><body><iframe src="https://example.com/widget"></iframe></body></html>';
		const page = createMockPage("https://example.com/page", [
			{
				url: "https://example.com/widget",
				content: "<p>Same-origin content</p>",
				outerHTML: '<iframe src="https://example.com/widget"></iframe>',
			},
		]);

		const result = await inlineIframes(page, html, { includeIframes: false });
		expect(result).toBe(html);
		expect(result).not.toContain("srcdoc");
	});

	it("inlines a single same-origin iframe when includeIframes is true (ON)", async () => {
		const html =
			'<html><body><iframe id="f1" src="/form"></iframe></body></html>';
		const page = createMockPage("https://example.com/app", [
			{
				url: "https://example.com/form",
				content: "<form><input name='name' /></form>",
				outerHTML: '<iframe id="f1" src="/form"></iframe>',
			},
		]);

		const result = await inlineIframes(page, html, { includeIframes: true });
		expect(result).toContain('<iframe srcdoc="&lt;form>');
		expect(result).toContain("name='name'");
		expect(result).not.toContain('src="/form"');
	});

	it("safely escapes content and prevents regex dollar replacement corruption", async () => {
		const html =
			'<html><body><iframe src="/price"></iframe><p>Footer</p></body></html>';
		const sensitiveContent =
			'<div class="pricing">Price: $100 & $200 with <b>bold</b> and "quotes"</div>';
		const page = createMockPage("https://example.com/home", [
			{
				url: "https://example.com/price",
				content: sensitiveContent,
				outerHTML: '<iframe src="/price"></iframe>',
			},
		]);

		const result = await inlineIframes(page, html, { includeIframes: true });
		expect(result).toContain("$100");
		expect(result).toContain("$200");
		expect(result).toContain("&amp;");
		expect(result).toContain("&quot;quotes&quot;");
		expect(result).toContain("&lt;b>bold&lt;/b>");
		expect(result).toContain("<p>Footer</p>");
	});

	it("inlines multiple same-origin iframes without collision or double insertion", async () => {
		const html = [
			"<html><body>",
			'<iframe id="first" src="/first"></iframe>',
			'<div class="divider">middle</div>',
			'<iframe id="second" src="/second"></iframe>',
			"</body></html>",
		].join("");

		const page = createMockPage("https://example.com/multi", [
			{
				url: "https://example.com/first",
				content: "<span>First Widget Content</span>",
				outerHTML: '<iframe id="first" src="/first"></iframe>',
			},
			{
				url: "https://example.com/second",
				content: "<span>Second Widget Content</span>",
				outerHTML: '<iframe id="second" src="/second"></iframe>',
			},
		]);

		const result = await inlineIframes(page, html, { includeIframes: true });
		expect(result).toContain(
			'<iframe srcdoc="&lt;span>First Widget Content&lt;/span>" id="first"></iframe>',
		);
		expect(result).toContain(
			'<iframe srcdoc="&lt;span>Second Widget Content&lt;/span>" id="second"></iframe>',
		);
		expect(result).toContain('<div class="divider">middle</div>');
	});

	it("skips cross-origin iframes and preserves original markup", async () => {
		const html =
			'<html><body><iframe src="https://thirdparty.com/ad"></iframe></body></html>';
		const onActivity = vi.fn();
		const page = createMockPage("https://example.com/page", [
			{
				url: "https://thirdparty.com/ad",
				content: "<div>Third party ad</div>",
				outerHTML: '<iframe src="https://thirdparty.com/ad"></iframe>',
			},
		]);

		const result = await inlineIframes(page, html, {
			includeIframes: true,
			onActivity,
		});
		expect(result).toBe(html);
		expect(onActivity).toHaveBeenCalledWith("Iframe cross-origin dilewati");
	});

	it("skips about:blank or invalid URLs without throwing", async () => {
		const html =
			'<html><body><iframe src="about:blank"></iframe></body></html>';
		const onActivity = vi.fn();
		const page = createMockPage("https://example.com/page", [
			{
				url: "about:blank",
				content: "blank",
				outerHTML: '<iframe src="about:blank"></iframe>',
			},
		]);

		const result = await inlineIframes(page, html, {
			includeIframes: true,
			onActivity,
		});
		expect(result).toBe(html);
		expect(onActivity).toHaveBeenCalledWith("Iframe cross-origin dilewati");
	});

	it("tolerates frame content failure and does not break main HTML", async () => {
		const html =
			'<html><body><iframe src="/failing"></iframe><p>Safe</p></body></html>';
		const onActivity = vi.fn();
		const page = createMockPage("https://example.com/page", [
			{
				url: "https://example.com/failing",
				failsContent: true,
				outerHTML: '<iframe src="/failing"></iframe>',
			},
		]);

		const result = await inlineIframes(page, html, {
			includeIframes: true,
			onActivity,
		});
		expect(result).toBe(html);
		expect(onActivity).toHaveBeenCalledWith(
			"Iframe tidak dapat diakses, dilewati",
		);
	});

	it("skips iframes exceeding maximum size without breaking main HTML", async () => {
		const html =
			'<html><body><iframe src="/huge"></iframe><p>Safe</p></body></html>';
		const onActivity = vi.fn();
		const oversizedContent = "A".repeat(
			Math.floor(SCRAPE_MAX_HTML_BYTES / 10) + 100,
		);
		const page = createMockPage("https://example.com/page", [
			{
				url: "https://example.com/huge",
				content: oversizedContent,
				outerHTML: '<iframe src="/huge"></iframe>',
			},
		]);

		const result = await inlineIframes(page, html, {
			includeIframes: true,
			onActivity,
		});
		expect(result).toBe(html);
		expect(onActivity).toHaveBeenCalledWith("Iframe terlalu besar dilewati");
	});

	it("respects maxFrames limit and stops processing further frames", async () => {
		const framesCount = SCRAPE_LIMITS.maxFrames + 5;
		const mockFrames: MockFrameOptions[] = [];
		let html = "<html><body>";
		for (let i = 1; i <= framesCount; i++) {
			const tag = `<iframe id="frame-${i}" src="/frame-${i}"></iframe>`;
			html += tag;
			mockFrames.push({
				url: `https://example.com/frame-${i}`,
				content: `<span>Content ${i}</span>`,
				outerHTML: tag,
			});
		}
		html += "</body></html>";

		const page = createMockPage("https://example.com/limits", mockFrames);
		const result = await inlineIframes(page, html, { includeIframes: true });

		const inlinedCount = (result.match(/srcdoc="/g) || []).length;
		expect(inlinedCount).toBe(SCRAPE_LIMITS.maxFrames);
	});
});
