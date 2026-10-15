/**
 * Pure geometry and selection helpers for the Studio canvas marquee
 * (rubber-band) selection.
 *
 * Everything here is deliberately free of React and DOM APIs so the
 * coordinate-space contract and the intersection rule can be unit tested
 * deterministically. The canvas component only feeds it measured rectangles.
 *
 * Coordinate spaces used by the canvas:
 * - Client/viewport space: raw `clientX`/`clientY` from a pointer event.
 * - Canvas-local screen space: client coordinates minus the canvas element's
 *   bounding rect. The marquee rectangle AND every measured frame rectangle are
 *   both expressed here, so intersection never mixes transformed and
 *   untransformed positions. Pan/zoom are already baked into a frame's
 *   `getBoundingClientRect()`, so screen-space comparison is exact at any zoom,
 *   pan, padding, or gap.
 * - World space: the untransformed surface layout (before the CSS
 *   `translate(pan) scale(zoom)`). `screenToWorld`/`worldToScreen` implement the
 *   inverse transform for callers that need layout-space geometry.
 */

export interface Point {
	x: number;
	y: number;
}

export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** The subset of the surface transform that coordinate conversion needs. */
export interface CanvasTransform {
	pan: Point;
	zoom: number;
}

/** A frame paired with its measured rectangle in the shared selection space. */
export interface MarqueeFrameBounds {
	id: string;
	rect: Rect;
}

/**
 * Normalizes two drag corners into a positive-size rectangle, so a marquee
 * drawn up-left, up-right, down-left or down-right all describe the same
 * geometry.
 */
export function normalizeRect(start: Point, end: Point): Rect {
	const x = Math.min(start.x, end.x);
	const y = Math.min(start.y, end.y);
	return {
		x,
		y,
		width: Math.abs(end.x - start.x),
		height: Math.abs(end.y - start.y),
	};
}

/**
 * Whether two rectangles overlap with a positive area.
 *
 * Selection intersection is intersection-based: a frame is selected when any
 * part of it overlaps the marquee, not only when its center lies inside. A pure
 * edge touch (zero-area overlap) does not count, which keeps the rule stable
 * while dragging along a frame boundary.
 */
export function rectsIntersect(a: Rect, b: Rect): boolean {
	return (
		a.x < b.x + b.width &&
		a.x + a.width > b.x &&
		a.y < b.y + b.height &&
		a.y + a.height > b.y
	);
}

/**
 * Resolves the selected frame ids for a marquee.
 *
 * Order is stable and follows the frame list (canvas order), never the order in
 * which frames happen to intersect. In additive mode the ids present before the
 * drag are preserved and the newly intersected ids are appended, so a
 * shift+drag only ever adds to the existing selection.
 */
export function resolveMarqueeSelection(
	marquee: Rect,
	frames: readonly MarqueeFrameBounds[],
	options: { additive: boolean; base: readonly string[] },
): string[] {
	const intersected = frames
		.filter((frame) => rectsIntersect(marquee, frame.rect))
		.map((frame) => frame.id);
	if (!options.additive) return intersected;
	const selected: string[] = [];
	const seen = new Set<string>();
	// The pre-existing selection keeps its own order first...
	for (const id of options.base) {
		if (seen.has(id)) continue;
		seen.add(id);
		selected.push(id);
	}
	// ...then each newly intersected frame is added once, in canvas order.
	for (const id of intersected) {
		if (seen.has(id)) continue;
		seen.add(id);
		selected.push(id);
	}
	return selected;
}

/** Maps a canvas-local screen point to the untransformed surface (world) space. */
export function screenToWorld(point: Point, transform: CanvasTransform): Point {
	return {
		x: (point.x - transform.pan.x) / transform.zoom,
		y: (point.y - transform.pan.y) / transform.zoom,
	};
}

/** Maps an untransformed surface (world) point to canvas-local screen space. */
export function worldToScreen(point: Point, transform: CanvasTransform): Point {
	return {
		x: point.x * transform.zoom + transform.pan.x,
		y: point.y * transform.zoom + transform.pan.y,
	};
}

/**
 * Whether a drag has travelled far enough to be a marquee instead of a click.
 * The comparison is Euclidean so the threshold is direction independent, with
 * each axis checked as a cheap early exit.
 */
export function exceedsDragThreshold(
	start: Point,
	current: Point,
	threshold: number,
): boolean {
	const dx = current.x - start.x;
	const dy = current.y - start.y;
	if (Math.abs(dx) >= threshold || Math.abs(dy) >= threshold) return true;
	return Math.hypot(dx, dy) >= threshold;
}

/**
 * Elements that own their own pointer gestures. A marquee must never begin when
 * the press lands on a frame, a control, a form field, a menu or a dialog, so
 * the canvas can defer to those handlers instead of hijacking the gesture.
 */
export const MARQUEE_IGNORE_SELECTOR =
	"article,button,a,input,textarea,select,[contenteditable=true],[role=menu],[role=menuitem],[role=menuitemradio],[role=option],[role=dialog],[data-canvas-marquee-ignore]";

/** Whether a pointer target should be left to its own interaction handler. */
export function isMarqueeIgnoredTarget(target: EventTarget | null): boolean {
	return (
		target instanceof Element &&
		target.closest(MARQUEE_IGNORE_SELECTOR) !== null
	);
}
