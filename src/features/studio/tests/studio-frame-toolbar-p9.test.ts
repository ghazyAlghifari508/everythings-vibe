import { describe, expect, it } from "vitest";
import {
	STUDIO_CANVAS_HEADER_INSET_PX,
	STUDIO_CANVAS_OVERLAY_EDGE_PX,
	STUDIO_CANVAS_TOOLBAR_INSET_PX,
	STUDIO_FRAME_TOOLBAR_FRAME_GAP_PX,
	STUDIO_FRAME_TOOLBAR_HEIGHT_PX,
	STUDIO_FRAME_TOOLBAR_WIDTH_PX,
} from "../types/studio-constants";
import {
	computeFrameScreenRect,
	computeFrameToolbarPlacement,
} from "../utils/studio-frame-toolbar";

const bounds = [{ width: 1440, height: 900 }];
const canvas = { width: 1200, height: 800 };

function placement(
	overrides: {
		zoom?: number;
		pan?: { x: number; y: number };
		leftInsetPx?: number;
		canvas?: { width: number; height: number };
	} = {},
) {
	return computeFrameToolbarPlacement({
		bounds,
		frameIndex: 0,
		zoom: overrides.zoom ?? 0.5,
		pan: overrides.pan ?? { x: 0, y: 0 },
		canvas: overrides.canvas ?? canvas,
		leftInsetPx: overrides.leftInsetPx ?? 0,
	});
}

describe("P9 contextual frame toolbar placement", () => {
	it("uses the same camera transform as the artboard", () => {
		const rect = computeFrameScreenRect({
			bounds,
			frameIndex: 0,
			zoom: 0.5,
			pan: { x: 20, y: 10 },
		});
		expect(rect).toEqual({
			x: 20 + 96 * 0.5,
			y: 10 + 96 * 0.5,
			width: 720,
			height: 450,
		});
	});

	it("keeps placement inside the canvas across zoom levels", () => {
		for (const zoom of [0.35, 0.5, 1, 2]) {
			const result = placement({ zoom });
			expect(result).not.toBeNull();
			if (!result) continue;
			expect(result.x).toBeGreaterThanOrEqual(STUDIO_CANVAS_OVERLAY_EDGE_PX);
			expect(result.x + STUDIO_FRAME_TOOLBAR_WIDTH_PX).toBeLessThanOrEqual(
				canvas.width - STUDIO_CANVAS_TOOLBAR_INSET_PX,
			);
			expect(Number.isFinite(result.y)).toBe(true);
		}
	});

	it("never covers the chat inset or the right tool palette", () => {
		const leftInsetPx = 340;
		const result = placement({ leftInsetPx });
		expect(result).not.toBeNull();
		if (!result) return;
		expect(result.x).toBeGreaterThanOrEqual(
			leftInsetPx + STUDIO_CANVAS_OVERLAY_EDGE_PX,
		);
		expect(result.x + STUDIO_FRAME_TOOLBAR_WIDTH_PX).toBeLessThanOrEqual(
			canvas.width - STUDIO_CANVAS_TOOLBAR_INSET_PX,
		);
		expect(result.y).toBeGreaterThanOrEqual(STUDIO_CANVAS_HEADER_INSET_PX);
		expect(result.y + STUDIO_FRAME_TOOLBAR_HEIGHT_PX).toBeLessThanOrEqual(
			canvas.height,
		);
	});

	it("prefers the side with room for the frame gap", () => {
		const nearRight = placement({ pan: { x: 700, y: 0 } });
		expect(nearRight?.side).toBe("left");
		if (nearRight) {
			const rect = computeFrameScreenRect({
				bounds,
				frameIndex: 0,
				zoom: 0.5,
				pan: { x: 700, y: 0 },
			});
			expect(nearRight.x + STUDIO_FRAME_TOOLBAR_WIDTH_PX).toBeLessThanOrEqual(
				(rect?.x ?? 0) - STUDIO_FRAME_TOOLBAR_FRAME_GAP_PX,
			);
		}
	});
});
