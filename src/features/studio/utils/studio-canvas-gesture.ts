export interface WheelGestureLike {
	deltaX: number;
	deltaY: number;
	deltaMode: number;
	ctrlKey?: boolean;
	metaKey?: boolean;
}

export type WheelGestureType = "zoom" | "pan";

/**
 * Minimum vertical pixel delta characteristic of a physical mouse wheel click notch.
 * Standard Windows/Linux/macOS mouse wheels emit notches of ~100-120px in pixel mode,
 * or line/page mode (deltaMode 1/2). Trackpad continuous scroll generates micro-deltas (1-15px)
 * or fractional sub-pixel values.
 */
export const WHEEL_DISCRETE_NOTCH_THRESHOLD_PX = 40;

/**
 * Classifies whether a wheel event represents an intentional zoom gesture or a pan.
 *
 * Policy:
 * 1. Ctrl / Cmd key pressed: Trackpad pinch-to-zoom or Ctrl+wheel -> "zoom".
 * 2. Non-zero deltaMode (DOM_DELTA_LINE or DOM_DELTA_PAGE): Physical mouse wheel
 *    notches reporting line or page steps -> "zoom" (unless purely horizontal, which pans).
 * 3. Horizontal component present (Math.abs(deltaX) > 0): Trackpad 2-finger scroll
 *    or horizontal pan -> "pan".
 * 4. Sub-pixel fractional delta (deltaY % 1 !== 0): High-precision continuous trackpad
 *    scrolling -> "pan".
 * 5. Discrete integer notch (deltaX === 0, Number.isInteger(deltaY), Math.abs(deltaY) >= 40):
 *    Physical mouse wheel click -> "zoom".
 * 6. Ambiguous micro-step (deltaX === 0, Math.abs(deltaY) < 40): Trackpad slow vertical
 *    scroll fallback -> "pan".
 */
export function classifyWheelGesture(
	event: WheelGestureLike,
): WheelGestureType {
	if (event.ctrlKey || event.metaKey) {
		return "zoom";
	}

	// Line- or page-based delta mode is characteristic of physical mouse wheels.
	if (event.deltaMode !== 0) {
		if (event.deltaY !== 0) return "zoom";
		if (event.deltaX !== 0) return "pan";
		return "pan";
	}

	// Horizontal motion represents 2D trackpad scrolling or horizontal wheel pan.
	if (Math.abs(event.deltaX) > 0) {
		return "pan";
	}

	// Zero delta has no action.
	if (event.deltaY === 0) {
		return "pan";
	}

	// Sub-pixel fractional deltas are produced by continuous trackpads (macOS/Windows Precision).
	if (!Number.isInteger(event.deltaY)) {
		return "pan";
	}

	// Discrete integer steps characteristic of mouse wheel notches (e.g., 100, 120, -100).
	if (Math.abs(event.deltaY) >= WHEEL_DISCRETE_NOTCH_THRESHOLD_PX) {
		return "zoom";
	}

	// Ambiguous small integer micro-steps: fallback to pan to avoid jarring accidental zooms.
	return "pan";
}

/**
 * Canvas-owned gesture surfaces: hits that belong to the canvas itself even
 * though they are wrapped in a `<button>` for pointer and keyboard selection
 * (a frame artboard's hit area). Wheel zoom and pan must keep working while the
 * pointer is over them, exactly as they do over the bare background.
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
 * must not be intercepted by the canvas zoom/pan.
 */
export function isScrollableOrEditableTarget(
	target: EventTarget | null,
	rootElement?: Element | null,
): boolean {
	if (!(target instanceof Element)) return false;

	// A frame's selection hit area is a `<button>` only for keyboard and
	// assistive-technology access; the pointer gesture over it belongs to the
	// canvas, so it must neither block zoom nor count as a scrollable overlay.
	if (target.closest(CANVAS_GESTURE_SURFACE_SELECTOR) !== null) {
		return false;
	}

	if (target.closest(CANVAS_CONTROL_SELECTOR) !== null) {
		return true;
	}

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

		if (canScrollY || canScrollX) {
			return true;
		}
		current = current.parentElement;
	}

	return false;
}
