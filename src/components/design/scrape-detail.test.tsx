// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScrapeDetail } from "./scrape-detail";

const initialWindowHeight = window.innerHeight;
const resizeObservers: TestResizeObserver[] = [];

class TestResizeObserver implements ResizeObserver {
	target: Element | null = null;

	constructor(readonly callback: ResizeObserverCallback) {
		resizeObservers.push(this);
	}

	observe(target: Element) {
		this.target = target;
		Object.defineProperty(target, "clientWidth", {
			configurable: true,
			value: 1200,
		});
		this.callback([], this);
	}

	unobserve() {}
	disconnect() {}
}

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	resizeObservers.length = 0;
	window.innerHeight = initialWindowHeight;
});
describe("ScrapeDetail", () => {
	it("renders HTML result with Preview and Source HTML views plus icon actions", () => {
		render(
			<ScrapeDetail
				domain="www.notion.com"
				previewHtml="<html><body>hi</body></html>"
			/>,
		);
		expect(screen.getByRole("tab", { name: /^Preview$/i })).toBeDefined();
		expect(screen.getByRole("tab", { name: /Source HTML/i })).toBeDefined();
		expect(screen.getByRole("button", { name: /Salin HTML/i })).toBeDefined();
		expect(
			screen.getByRole("button", { name: /Download index\.html/i }),
		).toBeDefined();
		expect(
			screen.queryByRole("button", { name: /Salin DESIGN\.md/i }),
		).toBeNull();
	});
	it("resizes from the measured container and viewport while preserving readable preview scale", async () => {
		window.innerHeight = 900;
		vi.stubGlobal("ResizeObserver", TestResizeObserver);
		render(
			<ScrapeDetail
				domain="www.notion.com"
				previewHtml="<main>desktop</main>"
			/>,
		);

		const iframe = screen.getByTitle("Preview www.notion.com");
		await waitFor(() =>
			expect(iframe.style.transform).toBe("scale(0.8333333333333334)"),
		);
		expect(iframe.style.width).toBe("1440px");
		expect(iframe.style.height).toBe("675px");
		expect(iframe.parentElement?.style.height).toBe("563px");

		window.innerHeight = 700;
		act(() => window.dispatchEvent(new Event("resize")));
		await waitFor(() => expect(iframe.style.height).toBe("525px"));

		const container = resizeObservers[0]?.target;
		expect(container).not.toBeNull();
		if (!container)
			throw new Error("ResizeObserver did not observe the preview container");
		act(() => {
			Object.defineProperty(container, "clientWidth", {
				configurable: true,
				value: 390,
			});
			resizeObservers[0]?.callback([], resizeObservers[0]);
		});
		await waitFor(() => expect(iframe.style.transform).toBe("scale(0.75)"));
		expect(iframe.style.width).toBe("1440px");
		expect(iframe.parentElement?.style.height).toBe("394px");
		expect(container.classList.contains("overflow-x-auto")).toBe(true);
	});

	it("shows no design inspector sections in the HTML result", () => {
		const { container } = render(
			<ScrapeDetail
				domain="www.notion.com"
				previewHtml="<html><body>hi</body></html>"
			/>,
		);
		expect(screen.queryByRole("heading", { name: /palet warna/i })).toBeNull();
		expect(screen.queryByRole("heading", { name: /tipografi/i })).toBeNull();
		expect(screen.queryByRole("heading", { name: /panduan/i })).toBeNull();
		expect(
			screen.queryByRole("button", { name: /implement ke ai agent/i }),
		).toBeNull();
		expect(container.textContent).not.toMatch(/DESIGN\.md selesai/i);
	});

	it("shows copy feedback without replacing the toolbar layout", async () => {
		vi.stubGlobal("navigator", {
			clipboard: { writeText: vi.fn(async () => {}) },
		});
		render(
			<ScrapeDetail
				domain="www.notion.com"
				previewHtml="<html><body>hi</body></html>"
			/>,
		);
		const copyButton = screen.getByRole("button", {
			name: /Salin HTML/i,
		});
		fireEvent.click(copyButton);
		expect(await screen.findByText(/tersalin ke clipboard/i)).toBeDefined();
		expect(
			screen.getByRole("button", { name: /Download index\.html/i }),
		).toBeDefined();
	});
	it("keeps the preview sandbox and referrer policy restricted", () => {
		render(
			<ScrapeDetail domain="example.com" previewHtml="<main>safe</main>" />,
		);
		const iframe = screen.getByTitle("Preview example.com");
		expect(iframe.getAttribute("sandbox")).toBe("allow-scripts");
		expect(iframe.getAttribute("referrerpolicy")).toBe("no-referrer");
	});

	it("switches between Preview and exact Source HTML", () => {
		const source = "<html><body>Original source</body></html>";
		render(<ScrapeDetail domain="example.com" previewHtml={source} />);
		fireEvent.click(screen.getByRole("tab", { name: /Source HTML/i }));
		expect(
			screen.getByRole("tabpanel", { name: /Source code index\.html/i })
				.textContent,
		).toBe(source);
		fireEvent.click(screen.getByRole("tab", { name: /^Preview$/i }));
		expect(
			screen.getByRole("tabpanel", { name: /Preview index\.html/i }),
		).toBeDefined();
	});

	it("copies the exact original source HTML", async () => {
		const source = "<html><body>Original source</body></html>";
		const writeText = vi.fn(async (_value: string) => {});
		vi.stubGlobal("navigator", { clipboard: { writeText } });
		render(<ScrapeDetail domain="example.com" previewHtml={source} />);
		fireEvent.click(screen.getByRole("button", { name: /Salin HTML/i }));
		expect(await screen.findByText(/tersalin ke clipboard/i)).toBeDefined();
		expect(writeText).toHaveBeenCalledWith(source);
	});

	it("downloads the exact original source HTML", async () => {
		const click = vi
			.spyOn(HTMLAnchorElement.prototype, "click")
			.mockImplementation(() => {});
		const source = "<html><body>Original source</body></html>";
		const createObjectURL = vi.fn((_blob: Blob) => "blob:preview");
		vi.stubGlobal("URL", { createObjectURL, revokeObjectURL: vi.fn() });
		render(<ScrapeDetail domain="example.com" previewHtml={source} />);
		fireEvent.click(
			screen.getByRole("button", { name: /Download index\.html/i }),
		);
		await waitFor(() => expect(createObjectURL).toHaveBeenCalledOnce());
		expect(click).toHaveBeenCalledOnce();
		expect(await createObjectURL.mock.calls[0]?.[0].text()).toBe(source);
	});
});
