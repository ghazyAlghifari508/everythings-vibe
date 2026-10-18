// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	isFrameVisualPending,
	resolveFrameArtboardMode,
	StudioFrame,
} from "@/features/studio/components/canvas/studio-frame";
import { StudioFrameShimmer } from "@/features/studio/components/canvas/studio-frame-shimmer";
import { STUDIO_VISUAL_WIDTH } from "@/features/studio/types/studio-constants";

describe("StudioFrameShimmer", () => {
	afterEach(() => cleanup());

	it("renders one full-surface shimmer for a mobile frame", () => {
		const { container } = render(
			<StudioFrameShimmer viewport="mobile" status="generating" />,
		);
		const surface = container.querySelector('[data-testid="mobile-shimmer"]');
		expect(surface).not.toBeNull();
		// The whole artboard is the animated surface, so the shimmer class must
		// sit on the element that fills the frame box.
		expect(surface?.className).toContain("studio-frame-shimmer");
		expect(surface?.className).toContain("size-full");
	});

	it("renders one full-surface shimmer for a web frame", () => {
		const { container } = render(
			<StudioFrameShimmer viewport="web" status="queued" />,
		);
		expect(
			container.querySelector('[data-testid="web-shimmer"]'),
		).not.toBeNull();
	});

	it("contains no skeleton content, spinner, or loading label", () => {
		const { container } = render(
			<StudioFrameShimmer viewport="mobile" status="generating" />,
		);
		const surface = container.querySelector('[data-testid="mobile-shimmer"]');
		expect(surface?.childElementCount).toBe(0);
		expect(container.querySelector("svg")).toBeNull();
		expect(surface?.textContent).toBe("");
		expect(surface?.getAttribute("data-frame-status")).toBe("generating");
	});
});

describe("isFrameVisualPending", () => {
	it("keeps shimmering while the frame is queued or generating", () => {
		expect(isFrameVisualPending("queued", false, false)).toBe(true);
		expect(isFrameVisualPending("generating", false, false)).toBe(true);
	});

	it("keeps shimmering when HTML is ready but the preview is not displayable yet", () => {
		expect(isFrameVisualPending("ready", false, false)).toBe(true);
	});

	it("stops shimmering once the real preview exists", () => {
		expect(isFrameVisualPending("ready", true, false)).toBe(false);
	});

	it("stops shimmering for failed frames so recovery feedback is visible", () => {
		expect(isFrameVisualPending("failed", false, false)).toBe(false);
		expect(isFrameVisualPending("failed", false, true)).toBe(false);
	});

	it("stops shimmering when the preview failed so the retry state shows", () => {
		expect(isFrameVisualPending("ready", false, true)).toBe(false);
	});
});

describe("resolveFrameArtboardMode", () => {
	it("shimmers only while the preview is genuinely pending", () => {
		expect(
			resolveFrameArtboardMode({
				status: "queued",
				hasRenderableHtml: false,
				hasVisual: false,
				hasVisualError: false,
			}),
		).toBe("shimmer");
		expect(
			resolveFrameArtboardMode({
				status: "ready",
				hasRenderableHtml: true,
				hasVisual: false,
				hasVisualError: false,
			}),
		).toBe("shimmer");
	});

	it("reveals the preview once the visual exists", () => {
		expect(
			resolveFrameArtboardMode({
				status: "ready",
				hasRenderableHtml: true,
				hasVisual: true,
				hasVisualError: false,
			}),
		).toBe("preview");
	});

	it("shows a targeted visual retry when the capture failed", () => {
		expect(
			resolveFrameArtboardMode({
				status: "ready",
				hasRenderableHtml: true,
				hasVisual: false,
				hasVisualError: true,
			}),
		).toBe("visual-error");
	});

	it("never shimmers forever for a ready frame without HTML", () => {
		expect(
			resolveFrameArtboardMode({
				status: "ready",
				hasRenderableHtml: false,
				hasVisual: false,
				hasVisualError: false,
			}),
		).toBe("preview-unavailable");
	});

	it("shows the generation failure state for failed frames", () => {
		expect(
			resolveFrameArtboardMode({
				status: "failed",
				hasRenderableHtml: false,
				hasVisual: false,
				hasVisualError: false,
			}),
		).toBe("generation-failed");
	});
});

describe("StudioFrame", () => {
	afterEach(() => cleanup());

	function frame(
		overrides: Partial<Parameters<typeof StudioFrame>[0]["frame"]>,
	) {
		return {
			id: "f-1",
			projectId: "p-1",
			name: "Dashboard",
			description: "Main screen",
			viewport: "mobile",
			htmlCode: null,
			status: "queued",
			order: 0,
			error: null,
			attempts: 0,
			visualHash: null,
			promptHash: null,
			createdAt: new Date(),
			updatedAt: new Date(),
			...overrides,
		};
	}

	it("never mounts executable generated content in the application canvas", () => {
		const onSelect = vi.fn();
		const { container } = render(
			<StudioFrame
				frame={frame({
					status: "ready",
					htmlCode: "<html><body><h1>Dashboard Content</h1></body></html>",
				})}
				isSelected={false}
				onSelect={onSelect}
				isCanvasPanning={false}
			/>,
		);

		expect(screen.getByText("Dashboard")).toBeDefined();
		expect(container.querySelector("iframe")).toBeNull();
		expect(container.querySelector("script")).toBeNull();
	});

	it("shows the frame title above a shimmering artboard while generating", () => {
		const { container } = render(
			<StudioFrame
				frame={frame({ status: "generating" })}
				isSelected={false}
				onSelect={vi.fn()}
				isCanvasPanning={false}
			/>,
		);

		expect(screen.getAllByText("Dashboard").length).toBeGreaterThanOrEqual(1);
		// Active generation is a small spinner next to the title, not a badge.
		expect(screen.getByLabelText("Sedang digenerate")).toBeDefined();
		expect(screen.queryByText(/Menggenerate/i)).toBeNull();
		// The artboard itself is one shimmer surface, not skeleton content.
		expect(
			container.querySelector('[data-testid="mobile-shimmer"]'),
		).not.toBeNull();
		expect(screen.queryByText(/Membuat desain layar/i)).toBeNull();
		expect(screen.queryByText(/Menunggu giliran/i)).toBeNull();
	});

	it("distinguishes queued from generating for assistive technology", () => {
		const { unmount } = render(
			<StudioFrame
				frame={frame({ status: "queued" })}
				isSelected={false}
				onSelect={vi.fn()}
				isCanvasPanning={false}
			/>,
		);
		expect(screen.getByLabelText("Menunggu antrean")).toBeDefined();
		expect(screen.queryByLabelText("Sedang digenerate")).toBeNull();
		unmount();

		render(
			<StudioFrame
				frame={frame({ status: "generating" })}
				isSelected={false}
				onSelect={vi.fn()}
				isCanvasPanning={false}
			/>,
		);
		expect(screen.getByLabelText("Sedang digenerate")).toBeDefined();
		expect(screen.queryByLabelText("Menunggu antrean")).toBeNull();
	});

	it("needs no ready badge once the frame is complete", () => {
		render(
			<StudioFrame
				frame={frame({
					status: "ready",
					htmlCode: "<html><body>Ready</body></html>",
				})}
				isSelected={false}
				onSelect={vi.fn()}
				isCanvasPanning={false}
			/>,
		);
		expect(screen.queryByText(/Siap/i)).toBeNull();
		expect(screen.queryByText(/Menyiapkan pratinjau/i)).toBeNull();
	});

	it("offers no frame-level copy action", () => {
		render(
			<StudioFrame
				frame={frame({
					status: "ready",
					htmlCode: "<html><body>Ready</body></html>",
				})}
				isSelected={false}
				onSelect={vi.fn()}
				isCanvasPanning={false}
			/>,
		);
		expect(screen.queryByText(/Salin/i)).toBeNull();
		expect(screen.queryByRole("button", { name: /Salin/i })).toBeNull();
		expect(screen.queryByText(/Tersalin/i)).toBeNull();
	});

	it("stops shimmering and explains a ready frame without stored HTML", () => {
		const onRetry = vi.fn();
		const { container } = render(
			<StudioFrame
				frame={frame({ status: "ready", htmlCode: "   " })}
				isSelected={false}
				onSelect={vi.fn()}
				onRetry={onRetry}
				isCanvasPanning={false}
			/>,
		);
		expect(screen.getByText("Pratinjau tidak tersedia")).toBeDefined();
		expect(
			container.querySelector('[data-testid="mobile-shimmer"]'),
		).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: /Generate ulang/i }));
		expect(onRetry).toHaveBeenCalledWith("f-1");
	});

	it("keeps shimmering when HTML exists but the preview is not ready", () => {
		const { container } = render(
			<StudioFrame
				frame={frame({
					status: "ready",
					htmlCode: "<html><body>Ready</body></html>",
				})}
				isSelected={false}
				onSelect={vi.fn()}
				isCanvasPanning={false}
			/>,
		);

		expect(
			container.querySelector('[data-testid="mobile-shimmer"]'),
		).not.toBeNull();
	});

	it("sizes a mobile artboard at the canonical capture width so it never shifts", () => {
		const { container } = render(
			<StudioFrame
				frame={frame({ status: "generating" })}
				isSelected={false}
				onSelect={vi.fn()}
				isCanvasPanning={false}
			/>,
		);

		const artboard = container.querySelector<HTMLElement>(
			".studio-frame-shimmer",
		)?.parentElement;
		// The artboard box must already match the width the visual is captured
		// at, so the frame does not resize when the preview arrives.
		expect(artboard?.style.width).toBe(`${STUDIO_VISUAL_WIDTH.mobile}px`);
	});

	it("uses restrained corner rounding instead of a decorative device bezel", () => {
		const { container } = render(
			<StudioFrame
				frame={frame({ status: "generating" })}
				isSelected={false}
				onSelect={vi.fn()}
				isCanvasPanning={false}
			/>,
		);

		const artboard = container.querySelector<HTMLElement>(
			".studio-frame-shimmer",
		)?.parentElement;
		expect(artboard?.className).toContain("rounded-lg");
		expect(artboard?.className).not.toContain("rounded-[24px]");
	});

	it("triggers onSelect when frame is clicked", () => {
		const onSelect = vi.fn();
		render(
			<StudioFrame
				frame={frame({
					id: "f-3",
					name: "Settings",
					status: "ready",
					htmlCode: "<html><body>Settings</body></html>",
				})}
				isSelected={false}
				onSelect={onSelect}
				isCanvasPanning={false}
			/>,
		);

		fireEvent.click(screen.getByText("Settings"));
		expect(onSelect).toHaveBeenCalledWith("f-3", false);
	});

	it("renders failed state with retry button and no shimmer", () => {
		const onRetry = vi.fn();
		const { container } = render(
			<StudioFrame
				frame={frame({
					id: "f-4",
					name: "Failed Frame",
					status: "failed",
					error: "AI limit",
				})}
				isSelected={false}
				onSelect={vi.fn()}
				onRetry={onRetry}
				isCanvasPanning={false}
			/>,
		);

		expect(screen.getAllByText(/Gagal/i).length).toBeGreaterThanOrEqual(1);
		expect(
			container.querySelector('[data-testid="mobile-shimmer"]'),
		).toBeNull();
		const retryBtn = screen.getAllByRole("button", { name: /Coba lagi/i })[0];
		fireEvent.click(retryBtn);
		expect(onRetry).toHaveBeenCalledWith("f-4");
	});
});
