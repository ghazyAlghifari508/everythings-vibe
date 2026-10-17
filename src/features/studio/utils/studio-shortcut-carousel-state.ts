export interface CarouselScrollMetrics {
	scrollLeft: number;
	scrollWidth: number;
	clientWidth: number;
}

const SCROLL_EDGE_TOLERANCE_PX = 1;
export const SHORTCUT_CAROUSEL_GAP_FALLBACK_PX = 10;
const CAROUSEL_STEP_VIEWPORT_RATIO = 0.8;
const CAROUSEL_STEP_MIN_PX = 200;

export function canScrollPrev(metrics: CarouselScrollMetrics): boolean {
	return metrics.scrollLeft > SCROLL_EDGE_TOLERANCE_PX;
}

export function canScrollNext(metrics: CarouselScrollMetrics): boolean {
	return (
		metrics.scrollLeft + metrics.clientWidth <
		metrics.scrollWidth - SCROLL_EDGE_TOLERANCE_PX
	);
}

export function getCarouselStep(
	cardWidth: number,
	gapWidth: number,
	viewportWidth: number,
): number {
	if (cardWidth > 0) return cardWidth + Math.max(gapWidth, 0);
	return Math.max(
		CAROUSEL_STEP_MIN_PX,
		viewportWidth * CAROUSEL_STEP_VIEWPORT_RATIO,
	);
}
