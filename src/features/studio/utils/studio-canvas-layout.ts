import { STUDIO_CANVAS_ZOOM_BOTTOM_PX } from "@/features/studio/types/studio-constants";

/** Distance from the canvas bottom edge to the zoom row. */
export function canvasZoomRowBottomCss(): string {
	return `calc(${STUDIO_CANVAS_ZOOM_BOTTOM_PX}px + env(safe-area-inset-bottom))`;
}
