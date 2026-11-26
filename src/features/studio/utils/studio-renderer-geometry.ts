/**
 * Explicit coordinate spaces for the renderer:
 *
 *  - document: CSS pixels inside the live iframe viewport (bridge bounds).
 *  - artboard: the frame's content box. The iframe is laid out at scale 1 and
 *    pinned to the artboard origin, so document -> artboard is a clamp, not a
 *    rescale. Internal scrolling is already reflected in bridge bounds.
 *  - screen: viewport pixels after canvas pan and zoom.
 */
export interface StudioRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export function clampStudioRectToArtboard(
	rect: StudioRect,
	artboard: { width: number; height: number },
): StudioRect | null {
	const left = Math.max(0, rect.x);
	const top = Math.max(0, rect.y);
	const right = Math.min(artboard.width, rect.x + rect.width);
	const bottom = Math.min(artboard.height, rect.y + rect.height);
	if (right <= left || bottom <= top) return null;
	return { x: left, y: top, width: right - left, height: bottom - top };
}

/** `artboardScreen` is the artboard's measured on-screen rectangle. */
export function artboardRectToScreen(
	rect: StudioRect,
	artboardScreen: { left: number; top: number },
	zoom: number,
): StudioRect {
	return {
		x: artboardScreen.left + rect.x * zoom,
		y: artboardScreen.top + rect.y * zoom,
		width: rect.width * zoom,
		height: rect.height * zoom,
	};
}

export function screenPointToArtboard(
	point: { x: number; y: number },
	artboardScreen: { left: number; top: number },
	zoom: number,
): { x: number; y: number } {
	return {
		x: (point.x - artboardScreen.left) / zoom,
		y: (point.y - artboardScreen.top) / zoom,
	};
}
