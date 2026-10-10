// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScrapeDetail } from "./scrape-detail";

function report(state: string, failed = 0) {
	const frame = screen.queryByTitle<HTMLIFrameElement>(/^Preview /);
	const source = frame?.contentWindow ?? null;
	window.dispatchEvent(
		new MessageEvent("message", {
			data: { type: "vibedesign-preview", state, failed },
			source,
		}),
	);
}

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("ScrapeDetail preview readiness", () => {
	it("shows a retry for fatal rendering reports without hiding source", () => {
		const retry = vi.fn();
		render(
			<ScrapeDetail
				domain="example.com"
				previewHtml="original"
				previewSrcDoc="<html></html>"
				onRetryPreview={retry}
			/>,
		);
		act(() => report("failed"));
		fireEvent.click(screen.getByRole("button", { name: /coba lagi/i }));
		expect(retry).toHaveBeenCalledOnce();
		expect(screen.getByRole("tab", { name: /Source HTML/i })).toBeDefined();
	});
	it("shows a preparing state until the preview document arrives", () => {
		render(
			<ScrapeDetail
				domain="example.com"
				previewHtml="<html><body>source</body></html>"
				previewSrcDoc=""
				previewState="loading"
			/>,
		);
		expect(screen.getByRole("status").textContent).toMatch(
			/preview belum tersedia/i,
		);
		expect(screen.queryByTitle("Preview example.com")).toBeNull();
	});

	it("shows a preparing state while the signed document is still loading", () => {
		render(
			<ScrapeDetail
				domain="example.com"
				previewHtml="<html><body>source</body></html>"
				previewSrcDoc=""
				previewState="loading"
				onRetryPreview={vi.fn()}
			/>,
		);
		expect(screen.getByRole("status").textContent).toMatch(/belum tersedia/i);
		expect(screen.queryByTitle("Preview example.com")).toBeNull();
	});

	it("does not treat onLoad alone as success and stays preparing without a report", () => {
		render(
			<ScrapeDetail
				domain="example.com"
				previewHtml="<html><body>source</body></html>"
				previewSrcDoc="<html><body>signed</body></html>"
				previewState="ready"
			/>,
		);
		const iframe = screen.getByTitle("Preview example.com");
		expect(iframe.getAttribute("srcdoc")).toBe(
			"<html><body>signed</body></html>",
		);
		expect(screen.getByRole("status").textContent).toMatch(/menyiapkan/i);
	});

	it("marks the preview ready when the framed document reports success", () => {
		render(
			<ScrapeDetail
				domain="example.com"
				previewHtml="<html><body>source</body></html>"
				previewSrcDoc="<html><body>signed</body></html>"
				previewState="ready"
			/>,
		);
		act(() => report("ready", 0));
		expect(screen.queryByText(/menyiapkan preview website/i)).toBeNull();
		expect(screen.queryByRole("status")).toBeNull();
		expect(screen.getByTitle("Preview example.com")).toBeDefined();
	});

	it("shows preparing feedback inside the preview canvas, not below it", () => {
		const { container } = render(
			<ScrapeDetail
				domain="example.com"
				previewHtml="<html><body>source</body></html>"
				previewSrcDoc="<html><body>signed</body></html>"
				previewState="ready"
			/>,
		);
		const status = screen.getByRole("status");
		expect(status.textContent).toMatch(/menyiapkan preview website/i);
		const panel = screen.getByRole("tabpanel", {
			name: /Preview index\.html/i,
		});
		expect(panel.contains(status)).toBe(true);
		expect(
			container.querySelector("output")?.parentElement?.className,
		).not.toMatch(/border-t/);
	});

	it("distinguishes an empty framed document from a ready one", () => {
		render(
			<ScrapeDetail
				domain="example.com"
				previewHtml="<html><body>source</body></html>"
				previewSrcDoc="<html><body></body></html>"
				previewState="ready"
			/>,
		);
		act(() => report("empty", 0));
		expect(screen.getByRole("status").textContent).toMatch(/tidak berisi/i);
	});

	it("warns when the framed document lost external resources", () => {
		render(
			<ScrapeDetail
				domain="example.com"
				previewHtml="<html><body>source</body></html>"
				previewSrcDoc="<html><body>signed</body></html>"
				previewState="ready"
			/>,
		);
		act(() => report("degraded", 3));
		expect(screen.getByRole("status").textContent).toMatch(/sebagian|gagal/i);
	});

	it("offers a retry when the preview document cannot be prepared", () => {
		const onRetryPreview = vi.fn();
		render(
			<ScrapeDetail
				domain="example.com"
				previewHtml="<html><body>source</body></html>"
				previewSrcDoc=""
				previewState="failed"
				previewError="Gagal menyiapkan preview scrape."
				onRetryPreview={onRetryPreview}
			/>,
		);
		expect(screen.getByRole("status").textContent).toMatch(
			/gagal menyiapkan preview/i,
		);
		fireEvent.click(screen.getByRole("button", { name: /coba lagi/i }));
		expect(onRetryPreview).toHaveBeenCalledOnce();
	});

	it("keeps the original source available for copy and download when preview fails", () => {
		const source = "<html><body>Original source</body></html>";
		const writeText = vi.fn(async () => {});
		vi.stubGlobal("navigator", { clipboard: { writeText } });
		render(
			<ScrapeDetail
				domain="example.com"
				previewHtml={source}
				previewSrcDoc=""
				previewState="failed"
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: /Salin HTML/i }));
		expect(writeText).toHaveBeenCalledWith(source);
	});

	it("registers the listener before the iframe exists so an early load is not lost", async () => {
		const seen: string[] = [];
		render(
			<ScrapeDetail
				domain="example.com"
				previewHtml="<html><body>source</body></html>"
				previewSrcDoc="<html><body>signed</body></html>"
				previewState="ready"
			/>,
		);

		const frame = screen.getByTitle<HTMLIFrameElement>("Preview example.com");
		// Simulate the frame reporting the instant it loads, which is what happens
		// for a small srcdoc before React attaches its effect.
		await act(async () => {
			report("ready", 0);
		});
		seen.push(document.querySelector("output")?.textContent ?? "");

		expect(seen[0] ?? "").not.toMatch(/menyiapkan preview website/i);
		expect(screen.queryByRole("status")).toBeNull();
		expect(frame).toBeDefined();
	});

	it("keeps asking the frame until it reports, even without a load event", async () => {
		vi.useFakeTimers();
		try {
			render(
				<ScrapeDetail
					domain="example.com"
					previewHtml="<html><body>source</body></html>"
					previewSrcDoc="<html><body>signed</body></html>"
					previewState="ready"
				/>,
			);
			const frame = screen.getByTitle<HTMLIFrameElement>("Preview example.com");
			const posted: unknown[] = [];
			vi.spyOn(frame.contentWindow as Window, "postMessage").mockImplementation(
				(...args: unknown[]) => {
					posted.push(args[0]);
				},
			);

			await act(async () => {
				vi.advanceTimersByTime(250);
			});
			expect(posted.length).toBeGreaterThanOrEqual(1);
			expect(posted[0]).toEqual({ type: "vibedesign-preview-ping" });

			await act(async () => {
				report("ready", 0);
			});
			await act(async () => {
				vi.advanceTimersByTime(2000);
			});
			const afterSettle = posted.length;
			await act(async () => {
				vi.advanceTimersByTime(2000);
			});
			expect(posted.length).toBe(afterSettle);
			expect(screen.queryByText(/menyiapkan preview website/i)).toBeNull();
			expect(screen.queryByRole("status")).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it("does not remount the iframe when switching Preview to Source HTML and back", () => {
		render(
			<ScrapeDetail
				domain="example.com"
				previewHtml="<html><body>source</body></html>"
				previewSrcDoc="<html><body>signed</body></html>"
				previewState="ready"
			/>,
		);
		const before = screen.getByTitle("Preview example.com");
		fireEvent.click(screen.getByRole("tab", { name: /Source HTML/i }));
		expect(before.getAttribute("srcdoc")).toBe("");
		expect(
			screen.getByRole("tabpanel", { name: /Source code index\.html/i }),
		).toBeDefined();
		fireEvent.click(screen.getByRole("tab", { name: /^Preview$/i }));
		const after = screen.getByTitle("Preview example.com");
		expect(after).toBe(before);
		expect(after.getAttribute("srcdoc")).toBe("<html><body>signed</body></html>");
	});
});
