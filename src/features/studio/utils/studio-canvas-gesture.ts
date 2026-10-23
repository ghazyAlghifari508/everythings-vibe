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
 * Detects whether an event target is an interactive or scrollable overlay
 * (e.g. textarea, select, dialog, or scrollable container) where wheel scrolling
 * must not be intercepted by the canvas zoom/pan.
 */
export function isScrollableOrEditableTarget(
	target: EventTarget | null,
	rootElement?: Element | null,
): boolean {
	if (!(target instanceof Element)) return false;

	if (
		target.closest(
			"textarea, input, select, button, [contenteditable=true], [role=menu], [role=menuitem], [role=listbox], [role=dialog], [role=alertdialog]",
		) !== null
	) {
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
