// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioFrameToolbar } from "../components/canvas/studio-frame-toolbar";
import { buildStudioPreviewTarget } from "../types/studio-preview-contract";

const baseProps = {
	placement: { x: 100, y: 120, side: "right" as const },
	frameName: "Layar 1",
	device: "desktop" as const,
	nativeDevice: "desktop" as const,
	liveReady: true,
	previewTarget: buildStudioPreviewTarget({
		projectId: "p1",
		frameId: "f1",
		device: "desktop",
	}),
};

afterEach(cleanup);

describe("P9 contextual toolbar interaction", () => {
	it("renders six labelled icon actions and marks the active viewport", () => {
		render(
			<StudioFrameToolbar
				{...baseProps}
				onDeviceChange={vi.fn()}
				onFocus={vi.fn()}
				onRefresh={vi.fn()}
			/>,
		);
		const toolbar = screen.getByRole("toolbar", {
			name: "Kontrol frame Layar 1",
		});
		expect(toolbar.querySelectorAll("button")).toHaveLength(6);
		const desktop = screen.getByRole("button", { name: /Desktop/ });
		const tablet = screen.getByRole("button", { name: /Tablet/ });
		expect(desktop.getAttribute("aria-pressed")).toBe("true");
		expect(tablet.getAttribute("aria-pressed")).toBe("false");
	});

	it("disables non-native viewports before the live surface is ready", () => {
		render(
			<StudioFrameToolbar
				{...baseProps}
				liveReady={false}
				onDeviceChange={vi.fn()}
				onFocus={vi.fn()}
				onRefresh={vi.fn()}
			/>,
		);
		expect(
			(screen.getByRole("button", { name: /Desktop/ }) as HTMLButtonElement)
				.disabled,
		).toBe(false);
		expect(
			(screen.getByRole("button", { name: /Tablet/ }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
		expect(
			(screen.getByRole("button", { name: /Mobile/ }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
	});

	it("keeps P10 preview disabled while its route is unavailable", () => {
		render(
			<StudioFrameToolbar
				{...baseProps}
				onDeviceChange={vi.fn()}
				onFocus={vi.fn()}
				onRefresh={vi.fn()}
				onPreview={vi.fn()}
			/>,
		);
		expect(
			(screen.getByRole("button", { name: /pratinjau/ }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
		expect(
			(screen.getByRole("button", { name: /Muat ulang/ }) as HTMLButtonElement)
				.disabled,
		).toBe(false);
	});

	it("reports device changes without leaking pointer gestures to the canvas", () => {
		const onDeviceChange = vi.fn();
		const onCanvasPointerDown = vi.fn();
		render(
			<div onPointerDown={onCanvasPointerDown}>
				<StudioFrameToolbar
					{...baseProps}
					onDeviceChange={onDeviceChange}
					onFocus={vi.fn()}
					onRefresh={vi.fn()}
				/>
			</div>,
		);
		fireEvent.pointerDown(screen.getByRole("button", { name: /Mobile/ }));
		fireEvent.click(screen.getByRole("button", { name: /Mobile/ }));
		expect(onCanvasPointerDown).not.toHaveBeenCalled();
		expect(onDeviceChange).toHaveBeenCalledWith("mobile");
	});
});
