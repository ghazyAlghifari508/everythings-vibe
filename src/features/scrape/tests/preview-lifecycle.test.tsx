// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SCRAPE_PREVIEW_FRAME_LOAD_TIMEOUT_MS } from "@/features/scrape/types/scrape-constants";
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

describe("scrape preview lifecycle", () => {
	it("mounts the fetched document immediately rather than an empty iframe", () => {
		const view = renderDetail({ previewSrcDoc: "", previewState: "loading" });
		view.rerender(
			<ScrapeDetail
				domain={DOMAIN}
				previewHtml={DOCUMENT}
				previewSrcDoc={DOCUMENT}
				previewState="ready"
			/>,
		);
		expect(frame().getAttribute("srcdoc")).toBe(DOCUMENT);
	});

	it("retries a failed document with a new iframe", () => {
		renderDetail();
		const old = frame();
		reportFrame("failed");
		fireEvent.click(screen.getByRole("button", { name: /coba lagi/i }));
		expect(frame()).not.toBe(old);
		reportFrame("ready");
		expect(screen.queryByRole("status")).toBeNull();
	});

	it("retries a genuinely empty document with a new iframe", () => {
		vi.useFakeTimers();
		renderDetail();
		const old = frame();
		fireEvent.load(old);
		reportFrame("empty");
		act(() => vi.advanceTimersByTime(5000));
		reportFrame("empty");
		fireEvent.click(screen.getByRole("button", { name: /coba lagi/i }));
		expect(frame()).not.toBe(old);
		reportFrame("ready");
		expect(screen.queryByRole("status")).toBeNull();
	});

	it("does not retain old readiness after switching to a newly mounted DOM", () => {
		renderDetail({ screenshot: SCREENSHOT });
		reportFrame("ready");
		fireEvent.click(screen.getByRole("button", { name: /Tangkapan Layar/i }));
		fireEvent.click(screen.getByRole("button", { name: /Tampilan DOM/i }));
		expect(screen.getByRole("status").textContent).toMatch(/menyiapkan/i);
	});

	it("continues an interrupted empty observation after returning to the DOM", () => {
		vi.useFakeTimers();
		renderDetail({ screenshot: SCREENSHOT });
		reportFrame("empty");
		fireEvent.click(screen.getByRole("button", { name: /Tangkapan Layar/i }));
		act(() => vi.advanceTimersByTime(6000));
		fireEvent.click(screen.getByRole("button", { name: /Tampilan DOM/i }));
		reportFrame("empty");
		expect(screen.getByRole("status").textContent).toMatch(/menyiapkan/i);
		act(() => vi.advanceTimersByTime(5000));
		reportFrame("empty");
		expect(screen.getByRole("status").textContent).toMatch(/tidak berisi/i);
	});

	it("preserves readiness when switching tabs while preparing", () => {
		vi.useFakeTimers();
		renderDetail();
		const old = frame();
		fireEvent.click(screen.getByRole("tab", { name: /HTML Source/i }));
		reportFrame("ready");
		fireEvent.click(screen.getByRole("tab", { name: /^Preview$/i }));
		expect(frame()).toBe(old);
		expect(screen.queryByRole("status")).toBeNull();
	});

	it("cleans up polling and pending empty verdict when unmounted", () => {
		vi.useFakeTimers();
		const view = renderDetail();
		const win = frame().contentWindow;
		if (!win) throw new Error("missing frame window");
		const post = vi.spyOn(win, "postMessage");
		fireEvent.load(frame());
		reportFrame("empty");
		view.unmount();
		const calls = post.mock.calls.length;
		act(() => vi.advanceTimersByTime(SCRAPE_PREVIEW_FRAME_LOAD_TIMEOUT_MS * 2));
		expect(post).toHaveBeenCalledTimes(calls);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("does not replace visible content with a late empty report", () => {
		vi.useFakeTimers();
		renderDetail();
		reportFrame("ready");
		for (let i = 0; i < 6; i++) reportFrame("empty");
		act(() => vi.advanceTimersByTime(6000));
		expect(screen.queryByRole("status")).toBeNull();
	});

	it("does not settle a single stale empty report without confirmation", () => {
		vi.useFakeTimers();
		renderDetail();
		fireEvent.load(frame());
		reportFrame("empty");
		act(() => vi.advanceTimersByTime(5000));
		expect(screen.getByRole("status").textContent).toMatch(/menyiapkan/i);
		reportFrame("ready");
		expect(screen.queryByRole("status")).toBeNull();
	});

	it("fails an unresponsive frame after an unconfirmed empty report", () => {
		vi.useFakeTimers();
		renderDetail({ screenshot: SCREENSHOT });
		fireEvent.load(frame());
		reportFrame("empty");
		act(() =>
			vi.advanceTimersByTime(SCRAPE_PREVIEW_FRAME_LOAD_TIMEOUT_MS + 1000),
		);
		expect(screen.getByTestId("scrape-visual-screenshot")).toBeDefined();
	});

	it("retains a settled empty verdict on later empty reports", () => {
		vi.useFakeTimers();
		renderDetail();
		reportFrame("empty");
		act(() => vi.advanceTimersByTime(5000));
		reportFrame("empty");
		expect(screen.getByRole("status").textContent).toMatch(/tidak berisi/i);
	});

	it("keeps rapid empty reports provisional until usable content arrives", () => {
		vi.useFakeTimers();
		renderDetail();
		fireEvent.load(frame());
		for (let i = 0; i < 6; i++) reportFrame("empty");
		expect(screen.getByRole("status").textContent).toMatch(/menyiapkan/i);
		reportFrame("ready");
		expect(screen.queryByRole("status")).toBeNull();
	});

	it("allows content to become ready after the ping budget", () => {
		vi.useFakeTimers();
		renderDetail({ screenshot: SCREENSHOT });
		fireEvent.load(frame());
		reportFrame("preparing");
		act(() => vi.advanceTimersByTime(6000));
		reportFrame("ready");
		act(() => vi.advanceTimersByTime(SCRAPE_PREVIEW_FRAME_LOAD_TIMEOUT_MS));
		expect(frame()).toBeDefined();
		expect(screen.queryByTestId("scrape-visual-screenshot")).toBeNull();
	});

	it("waits for a frame whose load event arrives late", () => {
		vi.useFakeTimers();
		renderDetail({ screenshot: SCREENSHOT });
		act(() =>
			vi.advanceTimersByTime(SCRAPE_PREVIEW_FRAME_LOAD_TIMEOUT_MS - 1000),
		);
		fireEvent.load(frame());
		reportFrame("ready");
		act(() => vi.advanceTimersByTime(2000));
		expect(frame()).toBeDefined();
		expect(screen.queryByTestId("scrape-visual-screenshot")).toBeNull();
	});

	it("ends observation when a frame remains preparing", () => {
		vi.useFakeTimers();
		renderDetail({ screenshot: SCREENSHOT });
		fireEvent.load(frame());
		reportFrame("preparing");
		act(() =>
			vi.advanceTimersByTime(SCRAPE_PREVIEW_FRAME_LOAD_TIMEOUT_MS + 1000),
		);
		expect(screen.getByTestId("scrape-visual-screenshot")).toBeDefined();
	});

	it("ignores messages from a document replaced by a new one", () => {
		const view = renderDetail();
		const previous = frame().contentWindow;
		view.rerender(
			<ScrapeDetail
				domain={DOMAIN}
				previewHtml={DOCUMENT}
				previewSrcDoc={`${DOCUMENT}<!-- renewed -->`}
				previewState="ready"
			/>,
		);
		act(() =>
			window.dispatchEvent(
				new MessageEvent("message", {
					source: previous,
					data: { type: "vibedesign-preview", state: "failed" },
				}),
			),
		);
		expect(frame()).toBeDefined();
		expect(screen.getByRole("status").textContent).toMatch(/menyiapkan/i);
	});

	it("settles when a loaded frame never answers", () => {
		vi.useFakeTimers();
		renderDetail({ screenshot: SCREENSHOT });
		fireEvent.load(frame());
		act(() =>
			vi.advanceTimersByTime(SCRAPE_PREVIEW_FRAME_LOAD_TIMEOUT_MS + 1000),
		);
		expect(screen.getByTestId("scrape-visual-screenshot")).toBeDefined();
	});
});
