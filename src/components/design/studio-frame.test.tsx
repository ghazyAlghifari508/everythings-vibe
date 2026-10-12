// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioFrame, isFrameVisualPending } from "./studio-frame";
import { StudioFrameShimmer } from "./studio-frame-shimmer";

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
		expect(screen.getByText(/Menggenerate/i)).toBeDefined();
		// The artboard itself is one shimmer surface, not skeleton content.
		expect(
			container.querySelector('[data-testid="mobile-shimmer"]'),
		).not.toBeNull();
		expect(screen.queryByText(/Membuat desain layar/i)).toBeNull();
		expect(screen.queryByText(/Menunggu giliran/i)).toBeNull();
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
