import {
	STUDIO_CANVAS_COMPOSER_INSET_PX,
	STUDIO_CANVAS_FIT_PADDING_PX,
	STUDIO_CANVAS_FRAME_GAP_PX,
	STUDIO_CANVAS_FRAME_HEADER_PX,
	STUDIO_CANVAS_FRAME_PADDING_PX,
	STUDIO_CANVAS_HEADER_INSET_PX,
	STUDIO_CANVAS_INITIAL_FRAME_WINDOW,
	STUDIO_CANVAS_INITIAL_MIN_ZOOM,
	STUDIO_CANVAS_MIN_VISIBLE_PX,
	STUDIO_CANVAS_TOOLBAR_INSET_PX,
} from "@/features/studio/types/studio-constants";

export interface StudioCanvasFrameBounds {
	width: number;
	height: number;
}

export interface StudioCanvasAvailable {
	width: number;
	height: number;
}

export interface StudioCanvasFitInput {
	bounds: StudioCanvasFrameBounds[];
	available: StudioCanvasAvailable;
	minZoom: number;
	maxZoom: number;
}

export interface StudioCanvasInitialViewInput extends StudioCanvasFitInput {
	/** Comfortable scale for this viewport class, before the space clamp. */
	preferredZoom: number;
	/** Frame the opening view starts on; defaults to the first frame. */
	anchorIndex?: number;
}

export interface StudioCanvasView {
	zoom: number;
	pan: { x: number; y: number };
}

/** The untransformed footprint of every artboard row plus its track padding. */
export function computeCanvasTrack(bounds: StudioCanvasFrameBounds[]): {
	width: number;
	height: number;
} {
	const count = bounds.length;
	if (!count) return { width: STUDIO_CANVAS_FIT_PADDING_PX, height: 0 };
	return {
		width:
			bounds.reduce((total, frame) => total + frame.width, 0) +
			(count - 1) * STUDIO_CANVAS_FRAME_GAP_PX +
			STUDIO_CANVAS_FIT_PADDING_PX,
		height:
			Math.max(...bounds.map((frame) => frame.height)) +
			STUDIO_CANVAS_FRAME_HEADER_PX +
			STUDIO_CANVAS_FIT_PADDING_PX,
	};
}

/**
 * The band of the canvas the floating overlays leave free: the header sits
 * above it, the composer below it, and the right-centre toolbar narrows it.
 */
export function computeCanvasUsableBand(available: StudioCanvasAvailable): {
	width: number;
	height: number;
} {
	return {
		width: Math.max(
			STUDIO_CANVAS_MIN_VISIBLE_PX,
			available.width - STUDIO_CANVAS_TOOLBAR_INSET_PX * 2,
		),
		height: Math.max(
			STUDIO_CANVAS_MIN_VISIBLE_PX,
			available.height -
				STUDIO_CANVAS_HEADER_INSET_PX -
				STUDIO_CANVAS_COMPOSER_INSET_PX,
		),
	};
}

function clampZoom(value: number, minZoom: number, maxZoom: number): number {
	return Math.min(maxZoom, Math.max(minZoom, value));
}

function frameOffset(bounds: StudioCanvasFrameBounds[], index: number): number {
	return (
		bounds.slice(0, index).reduce((total, frame) => total + frame.width, 0) +
		index * STUDIO_CANVAS_FRAME_GAP_PX
	);
}

/**
 * Pure fit-to-content math for the explicit "show every frame" action.
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
}: StudioCanvasFitInput): StudioCanvasView {
	if (!bounds.length) return { zoom: minZoom, pan: { x: 0, y: 0 } };
	const track = computeCanvasTrack(bounds);
	const usable = computeCanvasUsableBand(available);
	const zoom = clampZoom(
		Math.min(usable.width / track.width, usable.height / track.height),
		minZoom,
		maxZoom,
	);
	// The track box carries symmetric padding, so centring the padded box also
	// centres the artboards: the leading padding shifts the content by exactly
	// the same amount that the trailing padding adds to the box.
	return {
		zoom,
		pan: {
			x: (available.width - track.width * zoom) / 2,
			y:
				STUDIO_CANVAS_HEADER_INSET_PX +
				(usable.height - track.height * zoom) / 2,
		},
	};
}

/**
 * Pure opening-view math. Distinct from {@link computeCanvasFit} on purpose:
 * fitting the whole project is an explicit user action, not a good default.
 *
 * The opening view measures a bounded window of leading frames and never
 * scales below {@link STUDIO_CANVAS_INITIAL_MIN_ZOOM}, so a tall artboard or a
 * long frame list cannot shrink the board into an unreadable overview. Content
 * is anchored top-left under the floating header, and the user pans from there.
 */
export function computeCanvasInitialView({
	bounds,
	available,
	minZoom,
	maxZoom,
	preferredZoom,
	anchorIndex = 0,
}: StudioCanvasInitialViewInput): StudioCanvasView {
	const usable = computeCanvasUsableBand(available);
	if (!bounds.length)
		return {
			zoom: clampZoom(preferredZoom, minZoom, maxZoom),
			pan: { x: 0, y: 0 },
		};
	const anchor = Math.min(
		bounds.length - 1,
		Math.max(0, Number.isFinite(anchorIndex) ? Math.trunc(anchorIndex) : 0),
	);
	const windowBounds = bounds.slice(
		anchor,
		anchor + STUDIO_CANVAS_INITIAL_FRAME_WINDOW,
	);
	const windowWidth =
		windowBounds.reduce((total, frame) => total + frame.width, 0) +
		(windowBounds.length - 1) * STUDIO_CANVAS_FRAME_GAP_PX +
		STUDIO_CANVAS_FIT_PADDING_PX;
	// Height is deliberately capped by the readability floor rather than by a
	// full-project fit: only one viewport-tall slice needs to be comfortable.
	const windowHeight =
		Math.max(...windowBounds.map((frame) => frame.height)) +
		STUDIO_CANVAS_FRAME_HEADER_PX +
		STUDIO_CANVAS_FIT_PADDING_PX;
	const zoom = clampZoom(
		Math.max(
			STUDIO_CANVAS_INITIAL_MIN_ZOOM,
			Math.min(
				preferredZoom,
				usable.width / windowWidth,
				usable.height / windowHeight,
			),
		),
		minZoom,
		maxZoom,
	);
	// Put the anchored frame's track position at the top-left inset, so the
	// frame title line lands just under the floating header.
	const contentOffset = frameOffset(bounds, anchor);
	return {
		zoom,
		pan: {
			x:
				STUDIO_CANVAS_HEADER_INSET_PX -
				(STUDIO_CANVAS_FRAME_PADDING_PX + contentOffset) * zoom,
			y: STUDIO_CANVAS_HEADER_INSET_PX - STUDIO_CANVAS_FRAME_PADDING_PX * zoom,
		},
	};
}
