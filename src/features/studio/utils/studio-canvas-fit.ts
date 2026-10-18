import {
	STUDIO_CANVAS_COMPOSER_INSET_PX,
	STUDIO_CANVAS_FIT_PADDING_PX,
	STUDIO_CANVAS_FRAME_GAP_PX,
	STUDIO_CANVAS_FRAME_HEADER_PX,
	STUDIO_CANVAS_HEADER_INSET_PX,
	STUDIO_CANVAS_MIN_VISIBLE_PX,
	STUDIO_CANVAS_TOOLBAR_INSET_PX,
} from "@/features/studio/types/studio-constants";

export interface StudioCanvasFrameBounds {
	width: number;
	height: number;
}

export interface StudioCanvasFitInput {
	bounds: StudioCanvasFrameBounds[];
	available: { width: number; height: number };
	minZoom: number;
	maxZoom: number;
}

/**
 * Pure fit-to-content math.
 *
 * It accounts for the real artboard sizes, the inter-frame gap, the track
 * padding, the floating header band, the floating composer band, and the
 * right-centre toolbar column, so a fit never parks content underneath an
 * overlay. Bounds are clamped to the canonical zoom limits.
 */
export function computeCanvasFit({
	bounds,
	available,
	minZoom,
	maxZoom,
}: StudioCanvasFitInput): { zoom: number; pan: { x: number; y: number } } {
	const count = bounds.length;
	if (!count) return { zoom: minZoom, pan: { x: 0, y: 0 } };
	const trackWidth =
		bounds.reduce((total, frame) => total + frame.width, 0) +
		(count - 1) * STUDIO_CANVAS_FRAME_GAP_PX +
		STUDIO_CANVAS_FIT_PADDING_PX;
	const trackHeight =
		Math.max(...bounds.map((frame) => frame.height)) +
		STUDIO_CANVAS_FRAME_HEADER_PX +
		STUDIO_CANVAS_FIT_PADDING_PX;
	// Overlays consume real viewport area: the header sits above the content
	// band and the composer sits below it, while the toolbar narrows the width.
	const usableWidth = Math.max(
		STUDIO_CANVAS_MIN_VISIBLE_PX,
		available.width - STUDIO_CANVAS_TOOLBAR_INSET_PX * 2,
	);
	const usableHeight = Math.max(
		STUDIO_CANVAS_MIN_VISIBLE_PX,
		available.height -
			STUDIO_CANVAS_HEADER_INSET_PX -
			STUDIO_CANVAS_COMPOSER_INSET_PX,
	);
	const zoom = Math.min(
		maxZoom,
		Math.max(
			minZoom,
			Math.min(usableWidth / trackWidth, usableHeight / trackHeight),
		),
	);
	// The track box carries symmetric padding, so centring the padded box also
	// centres the artboards: the leading padding shifts the content by exactly
	// the same amount that the trailing padding adds to the box.
	return {
		zoom,
		pan: {
			x: (available.width - trackWidth * zoom) / 2,
			y:
				STUDIO_CANVAS_HEADER_INSET_PX + (usableHeight - trackHeight * zoom) / 2,
		},
	};
}
