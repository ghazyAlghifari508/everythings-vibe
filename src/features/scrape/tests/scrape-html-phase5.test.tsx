// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScrapeDetail } from "../components/scrape-detail";

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("Phase 5 UI — Separate HTML Source and Visual Reference", () => {
	it("renders distinct Visual and HTML Source tabs", () => {
		render(
			<ScrapeDetail
				domain="stitch.withgoogle.com"
				sourceUrl="https://stitch.withgoogle.com/home"
				previewHtml="<html><body>Google Stitch Content</body></html>"
			/>,
		);

		const visualTab = screen.getByRole("tab", { name: /Visual|Preview/i });
		const sourceTab = screen.getByRole("tab", {
			name: /HTML Source|Source HTML/i,
		});

		expect(visualTab).toBeDefined();
		expect(sourceTab).toBeDefined();

		// Initially on Visual tab
		expect(visualTab.getAttribute("aria-selected")).toBe("true");
		expect(sourceTab.getAttribute("aria-selected")).toBe("false");

		// Switch to HTML Source tab
		fireEvent.click(sourceTab);
		expect(visualTab.getAttribute("aria-selected")).toBe("false");
		expect(sourceTab.getAttribute("aria-selected")).toBe("true");
		expect(screen.getByTestId("codebase-source-preview")).toBeDefined();
	});

	it("renders browser screenshot fallback when DOM preview is unavailable or failed", () => {
		const fakeScreenshot = "data:image/jpeg;base64,fake-screenshot-data";
		render(
			<ScrapeDetail
				domain="stitch.withgoogle.com"
				sourceUrl="https://stitch.withgoogle.com/home"
				previewHtml="<html><body>Google Stitch Shell</body></html>"
				previewState="failed"
				previewError="Gagal menyiapkan preview"
				screenshot={fakeScreenshot}
			/>,
		);

		// Shows the screenshot view rather than an empty error box
		const screenshotImg = screen.getByTestId("scrape-visual-screenshot");
		expect(screenshotImg).toBeDefined();
		expect(screenshotImg.getAttribute("src")).toBe(fakeScreenshot);

		// The screenshot surface owns no navigation of its own.
		expect(
			screen.queryByRole("button", { name: /lihat html source/i }),
		).toBeNull();
		expect(screen.queryByText(/Referensi visual asli/i)).toBeNull();

		// HTML Source remains accessible
		expect(screen.getByRole("tab", { name: /HTML Source/i })).toBeDefined();
	});

	it("renders honest preview fallback when neither DOM preview nor screenshot exists", () => {
		render(
			<ScrapeDetail
				domain="example.com"
				previewHtml="<html><body>Blank page</body></html>"
				previewState="failed"
				previewError="Gagal memuat"
				screenshot={null}
			/>,
		);

		expect(screen.getByTestId("preview-unavailable")).toBeDefined();
		expect(screen.getByText(/Gagal memuat/i)).toBeDefined();
		// The source stays one click away in the tab bar, so the failure
		// surface must not repeat that action.
		expect(
			screen.queryByRole("button", { name: /Buka Source HTML/i }),
		).toBeNull();
		expect(screen.getByRole("tab", { name: /HTML Source/i })).toBeDefined();
	});

	it("allows switching between live DOM preview and Screenshot when both exist", () => {
		const fakeScreenshot = "data:image/jpeg;base64,another-screenshot";
		render(
			<ScrapeDetail
				domain="example.com"
				previewHtml="<html><body>Full page</body></html>"
				previewSrcDoc="<html><body>Rendered DOM</body></html>"
				previewState="ready"
				screenshot={fakeScreenshot}
			/>,
		);

		// The sub-view switcher is present
		const domButton = screen.getByRole("button", { name: /Tampilan DOM/i });
		const screenshotButton = screen.getByRole("button", {
			name: /Tangkapan Layar/i,
		});

		expect(domButton).toBeDefined();
		expect(screenshotButton).toBeDefined();

		// Initially DOM preview is active
		expect(domButton.getAttribute("aria-pressed")).toBe("true");
		expect(screenshotButton.getAttribute("aria-pressed")).toBe("false");
		expect(screen.getByTitle("Preview example.com")).toBeDefined();

		// Click Tangkapan Layar
		fireEvent.click(screenshotButton);
		expect(screenshotButton.getAttribute("aria-pressed")).toBe("true");
		expect(domButton.getAttribute("aria-pressed")).toBe("false");
		expect(screen.getByTestId("scrape-visual-screenshot")).toBeDefined();
	});

	it("downloads with honest filename derived from domain and path without misleading index.html message", async () => {
		const source = "<html><body>Original unmodified source</body></html>";
		const createObjectURL = vi.fn((_blob: Blob) => "blob:download");
		const originalCreateObjectURL = window.URL.createObjectURL;
		const originalRevokeObjectURL = window.URL.revokeObjectURL;
		window.URL.createObjectURL = createObjectURL;
		window.URL.revokeObjectURL = vi.fn();
		const click = vi
			.spyOn(HTMLAnchorElement.prototype, "click")
			.mockImplementation(() => {});

		try {
			render(
				<ScrapeDetail
					domain="stitch.withgoogle.com"
					sourceUrl="https://stitch.withgoogle.com/home"
					previewHtml={source}
				/>,
			);

			const downloadButton = screen.getByRole("button", {
				name: /Download stitch\.withgoogle\.com-home\.html/i,
			});
			expect(downloadButton).toBeDefined();

			fireEvent.click(downloadButton);
			await waitFor(() => expect(createObjectURL).toHaveBeenCalledOnce());
			expect(click).toHaveBeenCalledOnce();

			// Crucial acceptance criterion: NO misleading "index.html mulai diunduh." message!
			expect(screen.queryByText(/index\.html mulai diunduh/i)).toBeNull();
		} finally {
			window.URL.createObjectURL = originalCreateObjectURL;
			window.URL.revokeObjectURL = originalRevokeObjectURL;
		}
	});

	it("allows downloading the visual screenshot when available", async () => {
		const fakeScreenshot = "data:image/jpeg;base64,screenshot-for-download";
		const click = vi
			.spyOn(HTMLAnchorElement.prototype, "click")
			.mockImplementation(() => {});

		render(
			<ScrapeDetail
				domain="stitch.withgoogle.com"
				sourceUrl="https://stitch.withgoogle.com/home"
				previewHtml="<html><body>Source</body></html>"
				screenshot={fakeScreenshot}
			/>,
		);

		const screenshotDownloadBtn = screen.getByRole("button", {
			name: /Download screenshot stitch\.withgoogle\.com-home-screenshot\.jpg/i,
		});
		expect(screenshotDownloadBtn).toBeDefined();

		fireEvent.click(screenshotDownloadBtn);
		expect(click).toHaveBeenCalledOnce();
	});

	it("preserves exact unmodified content when copied", async () => {
		const raw =
			"<html><body><script>raw();</script><p>Exact Text</p></body></html>";
		const writeText = vi.fn(async (_val: string) => {});
		vi.stubGlobal("navigator", { clipboard: { writeText } });

		render(<ScrapeDetail domain="example.com" previewHtml={raw} />);

		const copyBtn = screen.getByRole("button", { name: /Salin HTML/i });
		fireEvent.click(copyBtn);

		expect(
			await screen.findByRole("button", { name: "HTML tersalin" }),
		).toBeDefined();
		expect(screen.queryByText(/tersalin ke clipboard/i)).toBeNull();
		expect(writeText).toHaveBeenCalledWith(raw);
	});
});
