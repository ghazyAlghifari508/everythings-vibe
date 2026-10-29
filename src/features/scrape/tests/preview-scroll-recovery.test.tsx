// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	SCRAPE_PREVIEW_FRAME_LOAD_TIMEOUT_MS,
	SCRAPE_PREVIEW_FRAME_MAX_HEIGHT,
	SCRAPE_PREVIEW_FRAME_MIN_HEIGHT,
} from "@/features/scrape/types/scrape-constants";
import { ScrapeDetail } from "../components/scrape-detail";

const SCREENSHOT = "data:image/png;base64,cHJldmlldw==";
const DOMAIN = "example.com";

const SECTIONS = ["hero", "one", "two", "three"]
	.map((id) => `<section id="${id}">${id}</section>`)
	.join("");
const DOCUMENT = `<html><head></head><body>${SECTIONS}<div style="height:6000px">tail</div></body></html>`;

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

function frame(): HTMLIFrameElement {
	return screen.getByTitle(`Preview ${DOMAIN}`) as HTMLIFrameElement;
}

function reportFrame(state: string, height?: number): void {
	const iframe = frame();
	act(() => {
		window.dispatchEvent(
			new MessageEvent("message", {
				data: { type: "vibedesign-preview", state, height },
				source: iframe.contentWindow,
			}),
		);
	});
}

function renderDetail(
	props: Partial<React.ComponentProps<typeof ScrapeDetail>> = {},
) {
	return render(
		<ScrapeDetail
			domain={DOMAIN}
			previewHtml={DOCUMENT}
			previewSrcDoc={DOCUMENT}
			previewState="ready"
			{...props}
		/>,
	);
}

describe("scrape preview scrolling", () => {
	it("grows the frame to the height the document reports", () => {
		renderDetail();
		expect(frame().style.height).toBe("675px");

		reportFrame("ready", 4200);

		expect(frame().style.height).toBe("4200px");
	});

	it("grows past the initial canvas once the page reports more content", () => {
		renderDetail();
		const canvas = frame().parentElement as HTMLElement;
		const before = Number.parseInt(canvas.style.height, 10);

		reportFrame("ready", 5000);

		expect(Number.parseInt(canvas.style.height, 10)).toBeGreaterThan(before);
	});

	it("bounds an extreme document instead of creating an unbounded frame", () => {
		renderDetail();
		reportFrame("ready", 900_000);
		expect(frame().style.height).toBe(`${SCRAPE_PREVIEW_FRAME_MAX_HEIGHT}px`);
	});

	it("never shrinks the frame below a usable height", () => {
		renderDetail();
		reportFrame("ready", 12);
		expect(frame().style.height).toBe(`${SCRAPE_PREVIEW_FRAME_MIN_HEIGHT}px`);
	});

	it("ignores a height that is not a positive number", () => {
		renderDetail();
		reportFrame("ready", Number.NaN);
		expect(frame().style.height).toBe("675px");
	});

	it("keeps the loading canvas in view until the document renders", () => {
		renderDetail();

		reportFrame("preparing", 9000);

		// Growing on a preparing report would push the spinner below the fold.
		expect(frame().style.height).toBe("675px");
		expect(screen.getByRole("status").textContent).toMatch(/menyiapkan/i);
	});

	it("keeps the document mounted when the source tab is opened and closed", () => {
		renderDetail();
		const srcDoc = frame().getAttribute("srcdoc");
		expect(srcDoc).toContain('id="three"');

		fireEvent.click(screen.getByRole("tab", { name: /HTML Source/i }));
		expect(frame().getAttribute("srcdoc")).toBe(srcDoc);

		fireEvent.click(screen.getByRole("tab", { name: /Preview/i }));
		expect(frame().getAttribute("srcdoc")).toBe(srcDoc);
	});

	it("keeps the sandbox and referrer policy on the grown frame", () => {
		renderDetail();
		reportFrame("ready", 4200);
		expect(frame().getAttribute("sandbox")).toBe("allow-scripts");
		expect(frame().getAttribute("referrerpolicy")).toBe("no-referrer");
	});
});

describe("scrape preview recovery", () => {
	it("keeps the interactive document when only some resources failed", () => {
		renderDetail({ screenshot: SCREENSHOT });

		reportFrame("degraded");

		expect(frame()).toBeDefined();
		expect(screen.getByText(/sebagian tampilan belum termuat/i)).toBeDefined();
		expect(screen.queryByTestId("scrape-visual-screenshot")).toBeNull();
	});

	it("falls back to the capture when the frame stops rendering", () => {
		renderDetail({ screenshot: SCREENSHOT });

		reportFrame("failed");

		expect(screen.queryByTitle(`Preview ${DOMAIN}`)).toBeNull();
		expect(screen.getByTestId("scrape-visual-screenshot")).toBeDefined();
		const notice = screen.getByTestId("scrape-visual-notice");
		expect(notice.textContent).toMatch(/tangkapan layar statis/i);
		expect(screen.getAllByRole("button", { name: /coba lagi/i })).toHaveLength(
			1,
		);
	});

	it("keeps the source HTML reachable from the fallback", () => {
		renderDetail({
			previewSrcDoc: "",
			previewState: "failed",
			screenshot: SCREENSHOT,
		});

		fireEvent.click(screen.getByRole("tab", { name: /HTML Source/i }));

		expect(
			screen.getByRole("tabpanel", { name: /Source code index\.html/i })
				.textContent,
		).toContain("hero");
	});

	it("puts one recovery notice above the screenshot capture", () => {
		const onRetryPreview = vi.fn();
		renderDetail({
			previewSrcDoc: "",
			previewState: "failed",
			previewError: "Gagal menyiapkan preview scrape.",
			screenshot: SCREENSHOT,
			onRetryPreview,
		});

		const notice = screen.getByTestId("scrape-visual-notice");
		const image = screen.getByTestId("scrape-visual-screenshot");
		expect(
			notice.compareDocumentPosition(image) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
		expect(notice.textContent).toMatch(/tangkapan layar statis/i);
		expect(notice.textContent).not.toMatch(/preview interaktif.*berhasil/i);

		const retries = screen.getAllByRole("button", { name: /coba lagi/i });
		expect(retries).toHaveLength(1);
		fireEvent.click(retries[0]);
		expect(onRetryPreview).toHaveBeenCalledOnce();
	});

	it("explains a static capture without offering a pointless retry", () => {
		renderDetail({ screenshot: SCREENSHOT });

		fireEvent.click(screen.getByRole("button", { name: /Tangkapan Layar/i }));

		expect(screen.getByTestId("scrape-visual-notice").textContent).toMatch(
			/tangkapan layar statis, bukan preview interaktif/i,
		);
		expect(screen.queryByRole("button", { name: /coba lagi/i })).toBeNull();
	});

	it("shows the fallback without a retry while the interactive preview loads", () => {
		renderDetail({
			previewSrcDoc: "",
			previewState: "loading",
			screenshot: SCREENSHOT,
		});

		expect(screen.getByTestId("scrape-visual-notice").textContent).toMatch(
			/menyiapkan preview interaktif/i,
		);
		expect(screen.queryByRole("button", { name: /coba lagi/i })).toBeNull();
	});

	it("offers a retry when the DOM failed and no screenshot exists", () => {
		const onRetryPreview = vi.fn();
		renderDetail({
			previewSrcDoc: "",
			previewState: "failed",
			previewError: "Gagal menyiapkan preview scrape.",
			onRetryPreview,
		});

		expect(screen.getByTestId("preview-unavailable")).toBeDefined();
		fireEvent.click(screen.getByRole("button", { name: /coba lagi/i }));
		expect(onRetryPreview).toHaveBeenCalledOnce();
	});

	it("drops the old failed state once the retried preview is ready", () => {
		const onRetryPreview = vi.fn();
		const view = renderDetail({
			previewSrcDoc: "",
			previewState: "failed",
			previewError: "Gagal menyiapkan preview scrape.",
			screenshot: SCREENSHOT,
			onRetryPreview,
		});

		fireEvent.click(screen.getByRole("button", { name: /coba lagi/i }));
		expect(onRetryPreview).toHaveBeenCalledOnce();

		view.rerender(
			<ScrapeDetail
				domain={DOMAIN}
				previewHtml={DOCUMENT}
				previewSrcDoc={DOCUMENT}
				previewState="ready"
				screenshot={SCREENSHOT}
			/>,
		);

		expect(frame().getAttribute("srcdoc")).toBe(DOCUMENT);
		expect(screen.queryByTestId("scrape-visual-notice")).toBeNull();
		expect(screen.queryByTestId("scrape-visual-screenshot")).toBeNull();
		expect(screen.queryByRole("button", { name: /coba lagi/i })).toBeNull();
	});

	it("keeps exactly one retry after a retry that fails again", () => {
		const onRetryPreview = vi.fn();
		const failed = {
			previewSrcDoc: "",
			previewState: "failed" as const,
			previewError: "Gagal menyiapkan preview scrape.",
			screenshot: SCREENSHOT,
			onRetryPreview,
		};
		const view = renderDetail(failed);
		fireEvent.click(screen.getByRole("button", { name: /coba lagi/i }));
		view.rerender(
			<ScrapeDetail domain={DOMAIN} previewHtml={DOCUMENT} {...failed} />,
		);

		expect(screen.getAllByRole("button", { name: /coba lagi/i })).toHaveLength(
			1,
		);
		expect(screen.getByTestId("scrape-visual-notice")).toBeDefined();
	});

	it("settles a frame that never answers instead of loading forever", () => {
		vi.useFakeTimers();
		renderDetail({ screenshot: SCREENSHOT });

		act(() => {
			vi.advanceTimersByTime(SCRAPE_PREVIEW_FRAME_LOAD_TIMEOUT_MS + 1_000);
		});

		expect(screen.getByTestId("scrape-visual-screenshot")).toBeDefined();
		expect(screen.getAllByRole("button", { name: /coba lagi/i })).toHaveLength(
			1,
		);
	});

	it("never fails a frame that already reported its state", () => {
		vi.useFakeTimers();
		renderDetail({ screenshot: SCREENSHOT });

		reportFrame("ready", 4200);
		act(() => {
			vi.advanceTimersByTime(SCRAPE_PREVIEW_FRAME_LOAD_TIMEOUT_MS + 30_000);
		});

		// A subresource that never finishes loading cannot turn a rendered page
		// into a failure, so the surface must stay on the interactive preview.
		expect(frame()).toBeDefined();
		expect(screen.queryByTestId("scrape-visual-screenshot")).toBeNull();
	});
});

describe("scrape screenshot fallback", () => {
	it("lets a tall capture scroll inside the viewer instead of shrinking it", () => {
		renderDetail({ screenshot: SCREENSHOT });

		fireEvent.click(screen.getByRole("button", { name: /Tangkapan Layar/i }));

		const image = screen.getByTestId("scrape-visual-screenshot");
		const viewer = image.parentElement as HTMLElement;
		expect(viewer.className).toContain("overflow-auto");
		expect(viewer.className).toContain("max-h-");
		// The capture keeps its natural proportions, so a full-page grab is
		// readable and taller than the viewer rather than scaled down to fit.
		expect(image.className).toContain("h-auto");
		expect(image.className).toContain("w-full");
		expect(image.className).not.toContain("object-contain");
		expect(image.className).not.toContain("max-h-[700px]");
	});

	it("keeps no duplicate navigation around the capture", () => {
		renderDetail({ screenshot: SCREENSHOT });

		fireEvent.click(screen.getByRole("button", { name: /Tangkapan Layar/i }));

		expect(screen.getAllByRole("tablist")).toHaveLength(1);
		expect(screen.getAllByRole("tab", { name: /HTML Source/i })).toHaveLength(
			1,
		);
	});
});
