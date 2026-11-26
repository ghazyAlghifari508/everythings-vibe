import { WHEEL_LINE_HEIGHT_PX } from "@/lib/constants";

export interface WheelPanInput {
	deltaX: number;
	deltaY: number;
	deltaMode: number;
}

export interface WheelPanDelta {
	x: number;
	y: number;
}

function toPixels(delta: number, multiplier: number): number {
	const pixels = delta * multiplier;
	return Number.isFinite(pixels) ? pixels : 0;
}

/**
 * Studio always treats the wheel as a pan on both axes. Hardware heuristics
 * are deliberately absent: the same event can arrive from a mouse notch or a
 * trackpad, and guessing wrong made scrolling jump the zoom level.
 */
export function normalizeWheelPanDelta(
	event: WheelPanInput,
	viewport: Pick<HTMLElement, "clientWidth" | "clientHeight">,
): WheelPanDelta {
	// Read deltaMode before the deltas; browsers can adjust their reported units.
	const mode = event.deltaMode;
	const scale = mode === 1 ? WHEEL_LINE_HEIGHT_PX : 1;
	return {
		x: toPixels(event.deltaX, mode === 2 ? viewport.clientWidth : scale),
		y: toPixels(event.deltaY, mode === 2 ? viewport.clientHeight : scale),
	};
}

/**
 * Canvas-owned gesture surfaces: hits that belong to the canvas itself even
 * though they are wrapped in a `<button>` for pointer and keyboard selection
 * (a frame artboard's hit area). Wheel pan must keep working while the pointer
 * is over them, exactly as it does over the bare background.
 */
export const CANVAS_GESTURE_SURFACE_SELECTOR = "[data-canvas-gesture-surface]";

/**
 * Real overlays that own their own wheel and press: toolbars, zoom controls,
 * the composer, form fields, menus and dialogs. They are the opposite of a
 * gesture surface, so the canvas must leave their events untouched.
 */
export const CANVAS_CONTROL_SELECTOR =
	"button, a, input, textarea, select, [contenteditable=true], [role=menu], [role=menuitem], [role=menuitemradio], [role=option], [role=listbox], [role=dialog], [role=alertdialog], [data-canvas-marquee-ignore]";

/**
 * Whether a target is a real control overlay the canvas must defer to.
 * Canvas-owned gesture surfaces are carved out first, so a hand-tool drag that
 * starts on a frame still pans instead of being treated as a widget press.
 */
export function isCanvasControlTarget(target: EventTarget | null): boolean {
	if (!(target instanceof Element)) return false;
	if (target.closest(CANVAS_GESTURE_SURFACE_SELECTOR) !== null) return false;
	return target.closest(CANVAS_CONTROL_SELECTOR) !== null;
}

/**
 * Detects whether an event target is an interactive or scrollable overlay
 * (e.g. textarea, select, dialog, or scrollable container) where wheel scrolling
 * must not be intercepted by the canvas pan.
 */
export function isScrollableOrEditableTarget(
	target: EventTarget | null,
	rootElement?: Element | null,
): boolean {
	if (!(target instanceof Element)) return false;

	// A frame's selection hit area is a `<button>` only for keyboard and
	// assistive-technology access; the pointer gesture over it belongs to the
	// canvas, so it must neither block pan nor count as a scrollable overlay.
	if (target.closest(CANVAS_GESTURE_SURFACE_SELECTOR) !== null) return false;

	if (target.closest(CANVAS_CONTROL_SELECTOR) !== null) return true;

	let current: Element | null = target;
	while (current && current !== rootElement && current !== document.body) {
		const style = window.getComputedStyle(current);
		const overflowY = style.overflowY;
		const overflowX = style.overflowX;
		const canScrollY =
			(overflowY === "auto" || overflowY === "scroll") &&
			current.scrollHeight > current.clientHeight;
		const canScrollX =
			(overflowX === "auto" || overflowX === "scroll") &&
			current.scrollWidth > current.clientWidth;

		if (canScrollY || canScrollX) return true;
		current = current.parentElement;
	}

	return false;
}
