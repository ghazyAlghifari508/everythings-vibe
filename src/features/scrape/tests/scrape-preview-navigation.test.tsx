// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SCRAPE_SOURCE_PREVIEW_MAX_HEIGHT } from "@/features/scrape/types/scrape-constants";
import { ScrapeDetail } from "../components/scrape-detail";

const SCREENSHOT = "data:image/png;base64,cHJldmlldw==";
const SOURCE_HTML = "<html><body><p>Captured</p></body></html>";

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

/** A document with exactly `lines` lines, so line counts stay predictable. */
function buildDocument(lines: number): string {
	const body: string[] = [];
	for (let index = 0; index < lines - 4; index += 1) {
		body.push(`<p class="row-${index}">Item ${index}</p>`);
	}
	return ["<html>", "<body>", ...body, "</body>", "</html>"].join("\n");
}

function openSource() {
	fireEvent.click(screen.getByRole("tab", { name: /HTML Source/i }));
}

describe("scrape HTML preview navigation", () => {
	it("keeps one primary tab bar and no third navigation layer", () => {
		render(
			<ScrapeDetail
				domain="example.com"
				previewHtml={SOURCE_HTML}
				previewSrcDoc={SOURCE_HTML}
				previewState="ready"
				screenshot={SCREENSHOT}
			/>,
		);

		expect(screen.getAllByRole("tablist")).toHaveLength(1);
		expect(screen.getAllByRole("tab")).toHaveLength(2);
		expect(screen.getByRole("tab", { name: /Preview/i })).toBeDefined();
		expect(screen.getByRole("tab", { name: /HTML Source/i })).toBeDefined();

		// The old third layer announced itself with a visible caption. The phrase
		// may survive only as the screen-reader name of the mode selector.
		const caption = [...document.querySelectorAll("*")].filter(
			(node) => node.textContent?.trim() === "Mode tampilan visual",
		);
		expect(caption.map((node) => node.tagName)).toEqual(["LEGEND"]);
	});

	it("offers the visual mode selector only when both modes are available", () => {
		const both = render(
			<ScrapeDetail
				domain="example.com"
				previewHtml={SOURCE_HTML}
				previewSrcDoc={SOURCE_HTML}
				previewState="ready"
				screenshot={SCREENSHOT}
			/>,
		);
		expect(
			screen.getByRole("group", { name: /mode tampilan visual/i }),
		).toBeDefined();
		both.unmount();

		render(
			<ScrapeDetail
				domain="example.com"
				previewHtml={SOURCE_HTML}
				previewSrcDoc={SOURCE_HTML}
				previewState="ready"
			/>,
		);
		expect(
			screen.queryByRole("group", { name: /mode tampilan visual/i }),
		).toBeNull();
		expect(screen.getByTitle("Preview example.com")).toBeDefined();
	});

	it("shows the screenshot directly when no DOM preview exists", () => {
		render(
			<ScrapeDetail
				domain="example.com"
				previewHtml={SOURCE_HTML}
				screenshot={SCREENSHOT}
			/>,
		);

		expect(
			screen.queryByRole("group", { name: /mode tampilan visual/i }),
		).toBeNull();
		expect(screen.getByTestId("scrape-visual-screenshot")).toBeDefined();
	});

	it("shows the unavailable surface when no visual mode exists", () => {
		render(
			<ScrapeDetail
				domain="example.com"
				previewHtml={SOURCE_HTML}
				previewState="failed"
				previewError="Gagal menyiapkan preview scrape."
			/>,
		);

		expect(
			screen.queryByRole("group", { name: /mode tampilan visual/i }),
		).toBeNull();
		expect(screen.getByTestId("preview-unavailable")).toBeDefined();
		expect(screen.getByText(/Gagal menyiapkan preview scrape/i)).toBeDefined();
	});

	it("keeps the screenshot surface free of duplicate source and retry actions", () => {
		render(
			<ScrapeDetail
				domain="example.com"
				previewHtml={SOURCE_HTML}
				previewSrcDoc={SOURCE_HTML}
				previewState="ready"
				screenshot={SCREENSHOT}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /Tangkapan Layar/i }));

		expect(screen.getByTestId("scrape-visual-screenshot")).toBeDefined();
		expect(
			screen.queryByRole("button", { name: /lihat html source/i }),
		).toBeNull();
		expect(screen.queryByRole("button", { name: /coba lagi/i })).toBeNull();
		expect(screen.getAllByRole("tab", { name: /HTML Source/i })).toHaveLength(
			1,
		);
	});

	it("keeps a retry when the DOM preview failed and a screenshot is shown", () => {
		const onRetryPreview = vi.fn();
		render(
			<ScrapeDetail
				domain="example.com"
				previewHtml={SOURCE_HTML}
				previewState="failed"
				previewError="Gagal menyiapkan preview scrape."
				screenshot={SCREENSHOT}
				onRetryPreview={onRetryPreview}
			/>,
		);

		expect(screen.getByTestId("scrape-visual-screenshot")).toBeDefined();
		fireEvent.click(screen.getByRole("button", { name: /coba lagi/i }));
		expect(onRetryPreview).toHaveBeenCalledOnce();
	});

	it("keeps every line of a 713-line document reachable", () => {
		const content = buildDocument(713);
		render(<ScrapeDetail domain="example.com" previewHtml={content} />);
		openSource();

		const rows = screen.getAllByTestId("codebase-source-row");
		expect(rows).toHaveLength(713);
		expect(rows[rows.length - 1]?.getAttribute("data-line")).toBe("713");
		expect(screen.getByTestId("codebase-source-linecount").textContent).toBe(
			"713 baris",
		);
	});

	it("bounds the source area so a long document scrolls inside it", () => {
		render(
			<ScrapeDetail domain="example.com" previewHtml={buildDocument(713)} />,
		);
		openSource();

		const body = screen.getByTestId("codebase-source-body");
		expect(body.style.maxHeight).toBe(`${SCRAPE_SOURCE_PREVIEW_MAX_HEIGHT}px`);
	});

	it("keeps the chosen source view when the primary tab changes", () => {
		render(
			<ScrapeDetail
				domain="example.com"
				previewHtml="<div><span>minified</span></div>"
			/>,
		);
		openSource();
		fireEvent.click(screen.getByTestId("codebase-source-mode-formatted"));
		expect(
			screen
				.getByTestId("codebase-source-mode-formatted")
				.getAttribute("aria-pressed"),
		).toBe("true");

		fireEvent.click(screen.getByRole("tab", { name: /Preview/i }));
		openSource();

		expect(
			screen
				.getByTestId("codebase-source-mode-formatted")
				.getAttribute("aria-pressed"),
		).toBe("true");
	});

	it("reports clipped rows honestly and downloads the complete document", async () => {
		const content = buildDocument(3_100);
		const createObjectURL = vi.fn((_blob: Blob) => "blob:download");
		vi.stubGlobal("URL", { createObjectURL, revokeObjectURL: vi.fn() });
		const click = vi
			.spyOn(HTMLAnchorElement.prototype, "click")
			.mockImplementation(() => {});

		render(<ScrapeDetail domain="example.com" previewHtml={content} />);
		openSource();

		const notice = screen.getByTestId("codebase-source-truncated");
		expect(notice.textContent).toContain("3.000");
		expect(notice.textContent).toContain("3.100");
		expect(notice.textContent).not.toMatch(/repository lokal/i);
		expect(notice.textContent).toMatch(/unduh file html/i);

		fireEvent.click(screen.getByRole("button", { name: /Download .*\.html/i }));
		await waitFor(() => expect(createObjectURL).toHaveBeenCalledOnce());
		expect(await createObjectURL.mock.calls[0]?.[0].text()).toBe(content);
		expect(click).toHaveBeenCalledOnce();
	});
});
