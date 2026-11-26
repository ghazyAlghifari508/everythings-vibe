import {
	STUDIO_CANVAS_BOTTOM_INSET_PX,
	STUDIO_CANVAS_FRAME_PADDING_PX,
	STUDIO_CANVAS_HEADER_INSET_PX,
	STUDIO_CANVAS_OVERLAY_EDGE_PX,
	STUDIO_CANVAS_TOOLBAR_INSET_PX,
	STUDIO_FRAME_TOOLBAR_BORDER_GAP_PX,
	STUDIO_FRAME_TOOLBAR_BUTTON_PX,
	STUDIO_FRAME_TOOLBAR_FRAME_GAP_PX,
	STUDIO_FRAME_TOOLBAR_HEIGHT_PX,
	STUDIO_FRAME_TOOLBAR_WIDTH_PX,
} from "@/features/studio/types/studio-constants";
import type { StudioCanvasFrameBounds } from "./studio-canvas-fit";
import { frameOffset } from "./studio-canvas-fit";

export interface StudioFrameToolbarInput {
	bounds: StudioCanvasFrameBounds[];
	frameIndex: number;
	zoom: number;
	pan: { x: number; y: number };
	canvas: { width: number; height: number };
	leftInsetPx: number;
}

export interface StudioFrameScreenRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface StudioFrameToolbarPlacement {
	x: number;
	y: number;
	maxHeight: number;
	side: "left" | "right";
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

/**
 * Artboard position in screen space after the shared camera transform. The
 * surface applies `p-24` before the first frame, so the same padding is part
 * of every frame's canvas-local origin.
 */
export function computeFrameScreenRect({
	bounds,
	frameIndex,
	zoom,
	pan,
}: Pick<
	StudioFrameToolbarInput,
	"bounds" | "frameIndex" | "zoom" | "pan"
>): StudioFrameScreenRect | null {
	const frame = bounds[frameIndex];
	if (!frame) return null;
	return {
		x:
			pan.x +
			(STUDIO_CANVAS_FRAME_PADDING_PX + frameOffset(bounds, frameIndex)) * zoom,
		y: pan.y + STUDIO_CANVAS_FRAME_PADDING_PX * zoom,
		width: frame.width * zoom,
		height: frame.height * zoom,
	};
}

/**
 * Places six screen-space buttons beside one frame. Buttons never inherit the
 * canvas scale, so they stay readable at 35% zoom; the left bound includes the
 * floating chat inset and the right bound the permanent tool palette. The
 * toolbar prefers the roomier side and clamps near viewport boundaries.
 */
export function computeFrameToolbarPlacement(
	input: StudioFrameToolbarInput,
): StudioFrameToolbarPlacement | null {
	const rect = computeFrameScreenRect(input);
	if (!rect) return null;
	// The collapsed chat launcher still occupies the left edge.
	const leftBound =
		Math.max(
			input.leftInsetPx,
			STUDIO_FRAME_TOOLBAR_BUTTON_PX + STUDIO_CANVAS_OVERLAY_EDGE_PX,
		) + STUDIO_CANVAS_OVERLAY_EDGE_PX;
	const rightBound = input.canvas.width - STUDIO_CANVAS_TOOLBAR_INSET_PX;
	const topBound = STUDIO_CANVAS_HEADER_INSET_PX;
	const maxHeight = Math.min(
		STUDIO_FRAME_TOOLBAR_HEIGHT_PX,
		input.canvas.height - topBound - STUDIO_CANVAS_BOTTOM_INSET_PX,
	);
	if (rightBound - leftBound < STUDIO_FRAME_TOOLBAR_WIDTH_PX || maxHeight <= 0)
		return null;
	const rightX = rect.x + rect.width + STUDIO_FRAME_TOOLBAR_FRAME_GAP_PX;
	const leftX =
		rect.x - STUDIO_FRAME_TOOLBAR_FRAME_GAP_PX - STUDIO_FRAME_TOOLBAR_WIDTH_PX;
	const rightSpace = rightBound - (rect.x + rect.width);
	const leftSpace = rect.x - leftBound;
	const fitsRight =
		rightX >= leftBound && rightX + STUDIO_FRAME_TOOLBAR_WIDTH_PX <= rightBound;
	const fitsLeft =
		leftX >= leftBound && leftX + STUDIO_FRAME_TOOLBAR_WIDTH_PX <= rightBound;
	const side =
		fitsLeft !== fitsRight
			? fitsLeft
				? "left"
				: "right"
			: rightSpace >= leftSpace
				? "right"
				: "left";
	const x = clamp(
		side === "right" ? rightX : leftX,
		leftBound,
		rightBound - STUDIO_FRAME_TOOLBAR_WIDTH_PX,
	);
	const bottomBound =
		input.canvas.height - STUDIO_CANVAS_BOTTOM_INSET_PX - maxHeight;
	const y = clamp(
		rect.y + Math.min(STUDIO_FRAME_TOOLBAR_BORDER_GAP_PX, rect.height * 0.1),
		topBound,
		bottomBound,
	);
	return { x, y, side, maxHeight };
}
