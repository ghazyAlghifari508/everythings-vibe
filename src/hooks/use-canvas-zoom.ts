/**
 * Canvas zoom and pan hook.
 * Provides zoom level, pan position, and control functions.
 *
 * Zoom is clamped at this single state-update boundary, so every entry point
 * (toolbar buttons, wheel, pinch, reset, fit-to-content) is bounded by the same
 * limits and no code path can produce an unusable or non-finite scale.
 *
 * ponytail: pointermove/wheel can fire more often than the display refreshes.
 * Gesture values are transient, so they live in refs and are committed via
 * requestAnimationFrame - at most one React render per frame instead of one
 * per input event (see vercel-react-best-practices rerender-use-ref-transient-values).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
	CANVAS_MAX_ZOOM,
	CANVAS_MIN_ZOOM,
	WHEEL_LINE_HEIGHT_PX,
	WHEEL_PAGE_HEIGHT_PX,
	WHEEL_ZOOM_MAX_FRAME_FACTOR,
	WHEEL_ZOOM_SENSITIVITY_PX,
} from "@/lib/constants";

interface UseCanvasZoomOptions {
	minZoom?: number;
	maxZoom?: number;
	initialZoom?: number;
}

/** The subset of a wheel event that zoom/pan math actually reads. */
export interface WheelDeltaLike {
	deltaY: number;
	deltaMode: number;
}

export interface WheelLike extends WheelDeltaLike {
	clientX: number;
	clientY: number;
}

/**
 * Normalizes a wheel event to pixels.
 *
 * deltaMode is honoured because a line- or page-based device reports tiny
 * deltaY values that would otherwise be read as a near-zero gesture, and the
 * raw magnitude is used instead of only its sign so the zoom tracks how far
 * the user actually scrolled.
 */
export function normalizeWheelDelta(event: WheelDeltaLike): number {
	if (!Number.isFinite(event.deltaY)) return 0;
	const scale =
		event.deltaMode === 1
			? WHEEL_LINE_HEIGHT_PX
			: event.deltaMode === 2
				? WHEEL_PAGE_HEIGHT_PX
				: 1;
	return event.deltaY * scale;
}

/**
 * Converts normalized wheel pixels into a zoom factor.
 *
 * The factor is exponential in the delta so repeated small gestures feel
 * smooth, and it is bounded per frame so one burst can never jump the whole
 * range.
 */
export function wheelDeltaToZoomFactor(deltaPixels: number): number {
	if (!Number.isFinite(deltaPixels) || deltaPixels === 0) return 1;
	const raw = Math.exp(-deltaPixels / WHEEL_ZOOM_SENSITIVITY_PX);
	if (!Number.isFinite(raw)) return 1;
	return Math.min(
		WHEEL_ZOOM_MAX_FRAME_FACTOR,
		Math.max(1 / WHEEL_ZOOM_MAX_FRAME_FACTOR, raw),
	);
}

export function useCanvasZoom({
	minZoom = CANVAS_MIN_ZOOM,
	maxZoom = CANVAS_MAX_ZOOM,
	initialZoom = 1,
}: UseCanvasZoomOptions = {}) {
	const clampZoom = useCallback(
		(value: number) =>
			// A non-finite candidate must never reach the transform: NaN would
			// poison every later calculation, so it falls back to the previous
			// scale instead of propagating.
			Number.isFinite(value)
				? Math.min(maxZoom, Math.max(minZoom, value))
				: minZoom,
		[minZoom, maxZoom],
	);
	const [zoom, setZoomState] = useState(() => clampZoom(initialZoom));
	const [pan, setPan] = useState({ x: 0, y: 0 });
	const isPanningRef = useRef(false);
	// Mirror of the committed zoom so gesture handlers can compute the next
	// value without reading state inside an updater (updaters must stay pure).
	const zoomRef = useRef(zoom);

	const setZoom = useCallback(
		(value: number | ((prev: number) => number)) => {
			setZoomState((prev) => {
				const next = clampZoom(
					typeof value === "function" ? value(prev) : value,
				);
				zoomRef.current = next;
				return next;
			});
		},
		[clampZoom],
	);

	// Latest pointer position not yet committed + baseline of last applied move.
	const pendingPointerRef = useRef<{ x: number; y: number } | null>(null);
	const lastAppliedRef = useRef({ x: 0, y: 0 });
	// Multiplicative wheel factors accumulated since last commit.
	const pendingZoomFactorRef = useRef(1);
	// Zoom anchor: the point that must stay under the pointer while zooming.
	const zoomAnchorRef = useRef<{ x: number; y: number } | null>(null);
	const panRafRef = useRef<number | null>(null);
	const zoomRafRef = useRef<number | null>(null);

	useEffect(
		() => () => {
			if (panRafRef.current !== null) cancelAnimationFrame(panRafRef.current);
			if (zoomRafRef.current !== null) cancelAnimationFrame(zoomRafRef.current);
		},
		[],
	);

	const flushPan = useCallback(() => {
		panRafRef.current = null;
		const pending = pendingPointerRef.current;
		if (!pending) return;
		pendingPointerRef.current = null;
		const deltaX = pending.x - lastAppliedRef.current.x;
		const deltaY = pending.y - lastAppliedRef.current.y;
		if (deltaX === 0 && deltaY === 0) return;
		lastAppliedRef.current = { x: pending.x, y: pending.y };
		setPan((prev) => ({ x: prev.x + deltaX, y: prev.y + deltaY }));
	}, []);

	const flushZoom = useCallback(() => {
		zoomRafRef.current = null;
		const factor = pendingZoomFactorRef.current;
		pendingZoomFactorRef.current = 1;
		if (!Number.isFinite(factor) || factor === 1) return;
		const anchor = zoomAnchorRef.current;
		zoomAnchorRef.current = null;
		const previous = zoomRef.current;
		const next = clampZoom(previous * factor);
		zoomRef.current = next;
		// Keep the anchored content point under the cursor so the board does not
		// fly away while zooming.
		if (anchor && next !== previous) {
			const ratio = next / previous;
			setPan((panPrev) => ({
				x: anchor.x - (anchor.x - panPrev.x) * ratio,
				y: anchor.y - (anchor.y - panPrev.y) * ratio,
			}));
		}
		setZoomState(next);
	}, [clampZoom]);

	const zoomIn = useCallback(() => {
		setZoom((prev) => prev * 1.2);
	}, [setZoom]);

	const zoomOut = useCallback(() => {
		setZoom((prev) => prev / 1.2);
	}, [setZoom]);

	const resetZoom = useCallback(() => {
		if (panRafRef.current !== null) {
			cancelAnimationFrame(panRafRef.current);
			panRafRef.current = null;
		}
		if (zoomRafRef.current !== null) {
			cancelAnimationFrame(zoomRafRef.current);
			zoomRafRef.current = null;
		}
		pendingPointerRef.current = null;
		pendingZoomFactorRef.current = 1;
		zoomAnchorRef.current = null;
		isPanningRef.current = false;
		zoomRef.current = clampZoom(initialZoom);
		setZoom(initialZoom);
		setPan({ x: 0, y: 0 });
	}, [initialZoom, setZoom, clampZoom]);

	const startPan = useCallback((e: React.PointerEvent) => {
		// Only react to primary button / touch / pen contact.
		if (e.pointerType === "mouse" && e.buttons !== 1) return false;
		isPanningRef.current = true;
		pendingPointerRef.current = null;
		if (panRafRef.current !== null) {
			cancelAnimationFrame(panRafRef.current);
			panRafRef.current = null;
		}
		// Deltas are measured against this baseline until the next commit.
		lastAppliedRef.current = { x: e.clientX, y: e.clientY };
		// ponytail: capture so we keep receiving move events outside the element.
		(e.currentTarget as Element | null)?.setPointerCapture?.(e.pointerId);
		return true;
	}, []);

	const updatePan = useCallback(
		(e: React.PointerEvent) => {
			if (!isPanningRef.current) return;
			pendingPointerRef.current = { x: e.clientX, y: e.clientY };
			if (panRafRef.current === null) {
				panRafRef.current = requestAnimationFrame(flushPan);
			}
		},
		[flushPan],
	);

	const endPan = useCallback(() => {
		isPanningRef.current = false;
		// Commit any movement captured since the last frame so the board
		// lands exactly under the pointer instead of snapping back a delta.
		if (panRafRef.current !== null) {
			cancelAnimationFrame(panRafRef.current);
			panRafRef.current = null;
		}
		flushPan();
	}, [flushPan]);

	// ponytail: no e.preventDefault(), causes passive listener warning.
	// Canvas div uses touch-action: none + overflow-hidden to block native scroll.
	// Typed against the fields it reads so a real WheelEvent and a test double
	// are both accepted without a cast.
	const onWheel = useCallback(
		(e: WheelLike) => {
			const deltaPixels = normalizeWheelDelta(e);
			const factor = wheelDeltaToZoomFactor(deltaPixels);
			if (factor === 1) return;
			pendingZoomFactorRef.current *= factor;
			if (!Number.isFinite(pendingZoomFactorRef.current)) {
				pendingZoomFactorRef.current = 1;
				return;
			}
			// Anchor at the pointer position when the event carries one.
			if (Number.isFinite(e.clientX) && Number.isFinite(e.clientY)) {
				zoomAnchorRef.current = { x: e.clientX, y: e.clientY };
			}
			if (zoomRafRef.current === null) {
				zoomRafRef.current = requestAnimationFrame(flushZoom);
			}
		},
		[flushZoom],
	);

	/**
	 * Keyboard pan nudge for arrow-key navigation (a11y).
	 * ponytail: fixed 40px step; add acceleration if needed.
	 */
	const nudgePan = useCallback((key: string, step = 40) => {
		setPan((prev) => {
			switch (key) {
				case "ArrowUp":
					return { ...prev, y: prev.y + step };
				case "ArrowDown":
					return { ...prev, y: prev.y - step };
				case "ArrowLeft":
					return { ...prev, x: prev.x + step };
				case "ArrowRight":
					return { ...prev, x: prev.x - step };
				default:
					return prev;
			}
		});
	}, []);

	return {
		zoom,
		pan,
		setZoom,
		setPan,
		zoomIn,
		zoomOut,
		resetZoom,
		startPan,
		updatePan,
		endPan,
		nudgePan,
		onWheel,
		minZoom,
		maxZoom,
	};
}
