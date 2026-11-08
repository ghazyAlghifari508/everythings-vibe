// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScrapeDetail } from "../components/scrape-detail";

const DOMAIN = "stitch.withgoogle.com";
const SOURCE_URL = "https://stitch.withgoogle.com/home";
const HTML = "<html><head></head><body><header>Hero</header></body></html>";
const SCREENSHOT =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function reportFrame(state: string, failed = 0, height?: number) {
	const frame = screen.queryByTitle<HTMLIFrameElement>(`Preview ${DOMAIN}`);
	const source = frame?.contentWindow ?? null;
	act(() => {
		window.dispatchEvent(
			new MessageEvent("message", {
				data: { type: "vibedesign-preview", state, failed, height },
				source,
			}),
		);
	});
}

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("P5 — Relocate Nonfatal HTML Preview Warning Below Preview", () => {
	it("1. Ready: tidak ada warning", () => {
		render(
			<ScrapeDetail
				domain={DOMAIN}
				sourceUrl={SOURCE_URL}
				previewHtml={HTML}
				previewSrcDoc={HTML}
				previewState="ready"
			/>,
		);

		reportFrame("ready", 0);

		expect(screen.queryByTestId("scrape-preview-degraded-warning")).toBeNull();
		expect(screen.queryByText(/sebagian tampilan belum termuat/i)).toBeNull();
	});

	it("2. Preparing: loading tetap sesuai existing di dalam canvas", () => {
		const { container } = render(
			<ScrapeDetail
				domain={DOMAIN}
				sourceUrl={SOURCE_URL}
				previewHtml={HTML}
				previewSrcDoc={HTML}
				previewState="ready"
			/>,
		);

		const status = screen.getByRole("status");
		expect(status.textContent).toMatch(/menyiapkan preview website/i);
		expect(screen.queryByTestId("scrape-preview-degraded-warning")).toBeNull();

		const panel = screen.getByRole("tabpanel", {
			name: /Preview index\.html/i,
		});
		expect(panel.contains(status)).toBe(true);
		expect(
			container.querySelector("output")?.parentElement?.className,
		).not.toMatch(/border-t/);
	});

	it("3. Degraded: warning berada setelah area preview (bukan melayang di atas)", () => {
		render(
			<ScrapeDetail
				domain={DOMAIN}
				sourceUrl={SOURCE_URL}
				previewHtml={HTML}
				previewSrcDoc={HTML}
				previewState="ready"
			/>,
		);

		reportFrame("degraded", 2);

		const frame = screen.getByTitle(`Preview ${DOMAIN}`);
		const warning = screen.getByTestId("scrape-preview-degraded-warning");

		expect(frame).toBeDefined();
		expect(warning).toBeDefined();

		// Warning must sit AFTER the preview canvas in DOM order
		expect(
			frame.compareDocumentPosition(warning) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();

		// Warning is not an absolute overlay inside the canvas wrapper
		expect(frame.parentElement?.contains(warning)).toBe(false);

		// Warning displays the concise degraded label and detail
		expect(warning.textContent).toMatch(/sebagian tampilan belum termuat/i);
		expect(warning.textContent).toMatch(
			/beberapa gambar atau elemen mungkin tidak tampil/i,
		);
	});

	it("4. Failed: recovery mudah diakses", () => {
		const retry = vi.fn();
		render(
			<ScrapeDetail
				domain={DOMAIN}
				sourceUrl={SOURCE_URL}
				previewHtml={HTML}
				previewSrcDoc={HTML}
				previewState="ready"
				onRetryPreview={retry}
			/>,
		);

		reportFrame("failed");

		expect(screen.queryByTestId("scrape-preview-degraded-warning")).toBeNull();

		const retryButton = screen.getByRole("button", { name: /coba lagi/i });
		expect(retryButton).toBeDefined();
		fireEvent.click(retryButton);
		expect(retry).toHaveBeenCalledOnce();
	});

	it("5. Screenshot fallback: tidak ada duplikasi warning", () => {
		render(
			<ScrapeDetail
				domain={DOMAIN}
				sourceUrl={SOURCE_URL}
				previewHtml={HTML}
				previewSrcDoc=""
				previewState="failed"
				previewError="Gagal memuat preview"
				screenshot={SCREENSHOT}
			/>,
		);

		// Shows single screenshot fallback notice
		const fallbackNotice = screen.getByTestId("scrape-visual-notice");
		expect(fallbackNotice).toBeDefined();
		expect(fallbackNotice.textContent).toMatch(
			/preview interaktif belum tersedia\. menampilkan tangkapan layar statis\./i,
		);

		// Does not duplicate degraded warning
		expect(screen.queryByTestId("scrape-preview-degraded-warning")).toBeNull();
		expect(screen.queryByText(/sebagian tampilan belum termuat/i)).toBeNull();
	});

	it("6. DOM preview panjang: footer tidak tersembunyi secara tidak wajar", () => {
		render(
			<ScrapeDetail
				domain={DOMAIN}
				sourceUrl={SOURCE_URL}
				previewHtml={HTML}
				previewSrcDoc={HTML}
				previewState="ready"
			/>,
		);

		// Simulate tall document reporting 4200px
		reportFrame("degraded", 1, 4200);

		const frame = screen.getByTitle(`Preview ${DOMAIN}`);
		expect(frame.style.height).toBe("4200px");

		const warning = screen.getByTestId("scrape-preview-degraded-warning");
		expect(warning).toBeDefined();

		// Footer has sticky bottom positioning so it stays visible at the bottom of the viewport
		expect(warning.className).toContain("sticky");
		expect(warning.className).toContain("bottom-0");

		// Still sits in proper footer DOM position
		expect(
			frame.compareDocumentPosition(warning) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
	});

	it("7. Accessibility: notice dan tombol dapat diakses", () => {
		const retry = vi.fn();
		render(
			<ScrapeDetail
				domain={DOMAIN}
				sourceUrl={SOURCE_URL}
				previewHtml={HTML}
				previewSrcDoc={HTML}
				previewState="ready"
				onRetryPreview={retry}
			/>,
		);

		reportFrame("degraded", 3);

		const status = screen.getByRole("status");
		expect(status.textContent).toMatch(/sebagian tampilan belum termuat/i);

		const retryButton = screen.getByRole("button", {
			name: /coba lagi memuat preview interaktif|coba lagi/i,
		});
		expect(retryButton).toBeDefined();

		fireEvent.click(retryButton);
		expect(retry).toHaveBeenCalledOnce();
	});
});
