import { describe, expect, it } from "vitest";
import { assessHtmlCapture, htmlCaptureFailureMessage } from "./render-page";

const FILLER = "<p>lorem ipsum dolor sit amet consectetur</p>".repeat(6);

function wrap(body: string, head = ""): string {
	return `<html><head>${head}</head><body>${body}</body></html>`;
}

describe("assessHtmlCapture", () => {
	it("accepts a document with visible text", () => {
		const assessment = assessHtmlCapture(wrap(FILLER));
		expect(assessment.hasMeaningfulContent).toBe(true);
		expect(assessment.reason).toBe("ok");
	});

	it("rejects a syntactically valid shell that rendered nothing", () => {
		// An application shell is far above any byte threshold yet shows nothing,
		// which is exactly the case a length check cannot detect.
		const shell = wrap(
			`<div id="__next"></div><div id="portal-root"></div><!--${"shell padding ".repeat(20)}-->`,
			`<style>${".app{display:flex}".repeat(20)}</style>`,
		);
		const assessment = assessHtmlCapture(shell);
		expect(assessment.bytes).toBeGreaterThan(200);
		expect(assessment.hasMeaningfulContent).toBe(false);
		expect(assessment.reason).toBe("no-meaningful-content");
	});

	it("rejects a document whose only text lives inside scripts", () => {
		const scripted = wrap(
			'<div id="root"></div>',
			"<script>const message='this is a long rendered app payload that never mounted';</script>",
		);
		expect(assessHtmlCapture(scripted).hasMeaningfulContent).toBe(false);
	});

	it("rejects a document whose only text lives inside style blocks", () => {
		const styled = wrap(
			"<div></div>",
			"<style>.hero{content:'a very long decorative string that is not page copy'}</style>",
		);
		expect(assessHtmlCapture(styled).hasMeaningfulContent).toBe(false);
	});

	it("rejects a document that is too small to be a page", () => {
		const assessment = assessHtmlCapture("<html><body></body></html>");
		expect(assessment.hasMeaningfulContent).toBe(false);
		expect(assessment.reason).toBe("too-small");
	});

	it("rejects a comment-only document", () => {
		const commented = wrap(
			`<!--${"a long commented out block ".repeat(20)}-->`,
		);
		expect(assessHtmlCapture(commented).hasMeaningfulContent).toBe(false);
	});

	it("accepts a short but real page", () => {
		expect(
			assessHtmlCapture(wrap("<h1>Selamat datang di toko kami</h1>"))
				.hasMeaningfulContent,
		).toBe(true);
	});

	it("accepts an image-only page even before the image bytes arrive", () => {
		const imageOnly = wrap(
			'<img src="/api/scrape/asset?url=hero.png" alt="Hero illustration">',
		);
		expect(assessHtmlCapture(imageOnly).hasMeaningfulContent).toBe(true);
	});

	it("accepts a page whose content is a CSS background image", () => {
		const background = wrap(
			'<div style="background-image:url(https://cdn.example/hero.jpg)" class="hero"></div>',
		);
		expect(assessHtmlCapture(background).hasMeaningfulContent).toBe(true);
	});

	it("accepts an embedded media or frame page", () => {
		for (const markup of [
			'<video controls><source src="/api/scrape/asset?url=clip.mp4"></video>',
			'<iframe srcdoc="&lt;p&gt;inner&lt;/p&gt;"></iframe>',
			'<object data="/api/scrape/asset?url=brochure.bin"></object>',
		])
			expect(assessHtmlCapture(wrap(markup)).hasMeaningfulContent).toBe(true);
	});

	it("counts decoded entities as visible text and ignores whitespace-only ones", () => {
		// Non-breaking spaces decode to whitespace, which is not content.
		expect(
			assessHtmlCapture(wrap(`<p>${"&nbsp;".repeat(40)}</p>`))
				.hasMeaningfulContent,
		).toBe(false);
		expect(
			assessHtmlCapture(wrap("<p>&amp;nbsp; ini konten teks asli</p>"))
				.hasMeaningfulContent,
		).toBe(true);
	});
});

describe("htmlCaptureFailureMessage", () => {
	it("names the actual reason instead of a generic failure", () => {
		expect(
			htmlCaptureFailureMessage({
				bytes: 40,
				hasMeaningfulContent: false,
				reason: "too-small",
			}),
		).toMatch(/jauh lebih kecil/i);
		expect(
			htmlCaptureFailureMessage({
				bytes: 5000,
				hasMeaningfulContent: false,
				reason: "no-meaningful-content",
			}),
		).toMatch(/tanpa konten yang dapat dilihat/i);
	});
});
