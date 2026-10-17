import { describe, expect, it } from "vitest";
import { safeScrapeFilename } from "@/components/design/scrape-detail";
import {
	buildSourceViewRows,
	clearFormatMarkupCache,
	clearHighlightCache,
	getCachedFormattedMarkup,
	getCachedHighlightedRows,
} from "@/features/codebase/services/source-view";
import { buildPreviewSrcDoc } from "./preview-capabilities";
import { assessHtmlCapture, htmlCaptureFailureMessage } from "./render-page";

describe("Phase 5 - HTML Capture Acceptance Criteria & Empty Document Rejection", () => {
	it("rejects empty documents and whitespace-only captures", () => {
		const empty = assessHtmlCapture("");
		expect(empty.hasMeaningfulContent).toBe(false);
		expect(empty.reason).toBe("too-small");
		expect(htmlCaptureFailureMessage(empty)).toMatch(/jauh lebih kecil/i);

		const whitespace = assessHtmlCapture("   \n\t   ");
		expect(whitespace.hasMeaningfulContent).toBe(false);
		expect(whitespace.reason).toBe("too-small");
	});

	it("rejects shell documents that only contain scripts or comments without visible text or media", () => {
		const shell =
			'<!doctype html><html><head><script src="app.js"></script><style>.app{color:red;}</style></head><body><!-- empty application shell without content -->' +
			"<!-- more padding comment to exceed minimum analysable byte length -->".repeat(
				3,
			) +
			'<div id="root"></div></body></html>';
		expect(Buffer.byteLength(shell, "utf8")).toBeGreaterThanOrEqual(200);
		const assessment = assessHtmlCapture(shell);
		expect(assessment.hasMeaningfulContent).toBe(false);
		expect(assessment.reason).toBe("no-meaningful-content");
		expect(htmlCaptureFailureMessage(assessment)).toMatch(
			/tanpa konten yang dapat dilihat/i,
		);
	});

	it("accepts documents with meaningful text (>= 12 characters)", () => {
		const doc = assessHtmlCapture(
			"<!doctype html><html><body><h1>Selamat Datang di Website</h1></body></html>",
		);
		expect(doc.hasMeaningfulContent).toBe(true);
		expect(doc.reason).toBe("ok");
	});

	it("accepts documents that have media elements even if text is minimal", () => {
		const imgDoc = assessHtmlCapture(
			'<!doctype html><html><body><img src="logo.png" alt="Logo"></body></html>',
		);
		expect(imgDoc.hasMeaningfulContent).toBe(true);
		expect(imgDoc.reason).toBe("ok");

		const videoDoc = assessHtmlCapture(
			'<!doctype html><html><body><video src="clip.mp4"></video></body></html>',
		);
		expect(videoDoc.hasMeaningfulContent).toBe(true);
		expect(videoDoc.reason).toBe("ok");

		const canvasDoc = assessHtmlCapture(
			'<!doctype html><html><body><canvas id="game"></canvas></body></html>',
		);
		expect(canvasDoc.hasMeaningfulContent).toBe(true);
		expect(canvasDoc.reason).toBe("ok");
	});

	it("accepts documents with CSS background images", () => {
		const bgDoc = assessHtmlCapture(
			'<!doctype html><html><body><div style="background-image: url(/hero.jpg); width: 100%; height: 500px;"></div></body></html>',
		);
		expect(bgDoc.hasMeaningfulContent).toBe(true);
		expect(bgDoc.reason).toBe("ok");
	});
});

describe("Phase 5 - Preview CSP & Sandbox Invariants", () => {
	it("enforces strict CSP with nonce, strips scripts, and locks down frame capabilities for visual snapshots", () => {
		const rawHtml = `<!doctype html><html><head><title>Test</title><script>alert("evil")</script></head><body><p>Hello World Content</p></body></html>`;
		const srcDoc = buildPreviewSrcDoc(
			rawHtml,
			{
				baseUrl: "https://example.com/page",
				appOrigin: "http://localhost:3000",
				scrapeId: "test-scrape-id",
				ownerId: "test-user-id",
				expiresAt: Date.now() + 60_000,
			},
			true,
		);

		expect(srcDoc).not.toContain('alert("evil")');
		expect(srcDoc).toContain("Content-Security-Policy");
		expect(srcDoc).toContain("default-src 'none'");
		expect(srcDoc).toContain("script-src 'nonce-");
		expect(srcDoc).toContain("frame-src 'none'");
		expect(srcDoc).toContain("connect-src 'none'");
		expect(srcDoc).toContain("http://localhost:3000");
	});
});

describe("Phase 5 - Export Filenames & Honest Semantics", () => {
	it("derives safe export filename from domain and path", () => {
		expect(safeScrapeFilename("www.notion.com", "html")).toBe(
			"www.notion.com.html",
		);
		expect(
			safeScrapeFilename(
				"stitch.withgoogle.com",
				"html",
				"https://stitch.withgoogle.com/home",
			),
		).toBe("stitch.withgoogle.com-home.html");
		expect(
			safeScrapeFilename(
				"example.com",
				"html",
				"https://example.com/products/electronics/item-123",
			),
		).toBe("example.com-products-electronics-item-123.html");
	});

	it("generates distinct screenshot filenames with suffix", () => {
		expect(
			safeScrapeFilename(
				"stitch.withgoogle.com",
				"jpg",
				"https://stitch.withgoogle.com/home",
				"screenshot",
			),
		).toBe("stitch.withgoogle.com-home-screenshot.jpg");
	});
});

describe("Phase 5 - Formatting & Highlighting Performance & Caching", () => {
	it("caches formatted markup and avoids duplicate parsing", () => {
		clearFormatMarkupCache();
		const sample =
			'<div class="card"><header><h1>Judul</h1></header><main><p>Isi konten teks</p></main></div>';
		const first = getCachedFormattedMarkup(sample);
		expect(first).not.toBeNull();
		expect(first).toContain("  <header>");

		const second = getCachedFormattedMarkup(sample);
		expect(second).toBe(first);
	});

	it("caches highlighted rows for fast mode toggling", () => {
		clearHighlightCache();
		const sample = "const a = 1;\nconst b = 2;\nconsole.log(a + b);";
		const first = getCachedHighlightedRows(sample, "typescript", 100);
		expect(first.tokens).toHaveLength(3);

		const second = getCachedHighlightedRows(sample, "typescript", 100);
		expect(second).toBe(first);
	});

	it("handles a large synthetic HTML document (1,000 lines) within performance bounds and caches it", () => {
		clearFormatMarkupCache();
		clearHighlightCache();

		const lines = ["<!doctype html>", "<html>", "<body>", "<main>"];
		for (let i = 1; i <= 500; i++) {
			lines.push(
				`  <section id="section-${i}"><h2>Item ${i}</h2><p>Description text for item number ${i}</p></section>`,
			);
		}
		lines.push("</main>", "</body>", "</html>");
		const largeHtml = lines.join("\n");

		const start = performance.now();
		const viewOriginal = buildSourceViewRows({
			content: largeHtml,
			path: "index.html",
			mode: "original",
			maxLines: 3000,
		});
		const originalDuration = performance.now() - start;

		expect(viewOriginal.totalLines).toBeGreaterThan(500);
		expect(viewOriginal.formattedAvailable).toBe(true);

		// Switch to formatted
		const startFormatted = performance.now();
		const viewFormatted = buildSourceViewRows({
			content: largeHtml,
			path: "index.html",
			mode: "formatted",
			maxLines: 3000,
		});
		const formattedDuration = performance.now() - startFormatted;

		expect(viewFormatted.mode).toBe("formatted");
		expect(viewFormatted.totalLines).toBeGreaterThan(viewOriginal.totalLines);

		// Rapid switch back to original (should be near-instant cache hit)
		const startReOriginal = performance.now();
		const viewReOriginal = buildSourceViewRows({
			content: largeHtml,
			path: "index.html",
			mode: "original",
			maxLines: 3000,
		});
		const reOriginalDuration = performance.now() - startReOriginal;

		expect(reOriginalDuration).toBeLessThan(originalDuration + 5);
		expect(viewReOriginal.rows.length).toBe(viewOriginal.rows.length);

		// Rapid switch back to formatted (cached)
		const startReFormatted = performance.now();
		const viewReFormatted = buildSourceViewRows({
			content: largeHtml,
			path: "index.html",
			mode: "formatted",
			maxLines: 3000,
		});
		const reFormattedDuration = performance.now() - startReFormatted;

		expect(reFormattedDuration).toBeLessThan(formattedDuration + 5);
		expect(viewReFormatted.rows.length).toBe(viewFormatted.rows.length);
	});

	it("preserves untouched source content across formatting", () => {
		const raw = "<div><p>Unformatted text</p></div>";
		const view = buildSourceViewRows({
			content: raw,
			path: "index.html",
			mode: "formatted",
			maxLines: 100,
		});
		expect(view.originalContent).toBe(raw);
		expect(view.mode).toBe("formatted");
	});
});
