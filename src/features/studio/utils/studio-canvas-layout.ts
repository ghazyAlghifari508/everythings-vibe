import {
	STUDIO_CANVAS_COMPOSER_BOTTOM_PX,
	STUDIO_CANVAS_COMPOSER_MAX_WIDTH_PX,
	STUDIO_CANVAS_COMPOSER_SIDE_CLEARANCE_PX,
	STUDIO_CANVAS_ZOOM_BOTTOM_PX,
} from "@/features/studio/types/studio-constants";

/**
 * Shared geometry for the two floating overlays on the canvas bottom edge.
 *
 * The zoom controls own the bottom-right corner and the composer is
 * bottom-centred, so both the composer's own width and any fit-to-content
 * calculation must read the same clearance rule. Keeping it here stops the
 * canvas and the composer from drifting apart and overlapping.
 */
export function canvasComposerWidthCss(): string {
	return `min(100% - ${STUDIO_CANVAS_COMPOSER_SIDE_CLEARANCE_PX * 2}px, ${STUDIO_CANVAS_COMPOSER_MAX_WIDTH_PX}px)`;
}

/**
 * Distance from the canvas bottom edge to the composer, anchoring it lower in
 * the workspace alongside the bottom-right zoom controls while honouring the
 * device safe area.
 */
export function canvasComposerBottomCss(): string {
	return `calc(${STUDIO_CANVAS_COMPOSER_BOTTOM_PX}px + env(safe-area-inset-bottom))`;
}

/** Distance from the canvas bottom edge to the zoom row. */
export function canvasZoomRowBottomCss(): string {
	return `calc(${STUDIO_CANVAS_ZOOM_BOTTOM_PX}px + env(safe-area-inset-bottom))`;
}
