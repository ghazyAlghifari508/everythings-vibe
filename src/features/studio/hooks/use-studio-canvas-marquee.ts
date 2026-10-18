import { type RefObject, useCallback, useEffect, useRef } from "react";
import { STUDIO_CANVAS_MARQUEE_DRAG_THRESHOLD_PX } from "@/features/studio/types/studio-constants";
import {
	exceedsDragThreshold,
	isMarqueeIgnoredTarget,
	type MarqueeFrameBounds,
	normalizeRect,
	type Point,
	type Rect,
	resolveMarqueeSelection,
} from "@/features/studio/utils/studio-canvas-marquee";

interface UseStudioCanvasMarqueeInput {
	canvasRef: RefObject<HTMLElement | null>;
	marqueeRef: RefObject<HTMLDivElement | null>;
	selectedFrameIds: string[];
	onSelectFrames?: (frameIds: string[]) => void;
	/** True while the hand tool or space-pan owns the pointer. */
	panMode: boolean;
}

interface StudioCanvasMarqueeGesture {
	handleCanvasPointerDown: (event: React.PointerEvent) => void;
	handleCanvasPointerMove: (event: React.PointerEvent) => void;
	handleCanvasPointerUp: (event: React.PointerEvent) => void;
	/** Restores the selection captured at press time and hides the rectangle. */
	cancelMarquee: () => void;
	/** True while a marquee drag is armed; used by the Escape shortcut. */
	hasActiveGesture: () => boolean;
}

/**
 * Marquee (rubber-band) selection for the Studio canvas.
 *
 * The rectangle is painted by mutating one absolutely positioned node's style
 * directly, so a drag produces at most one React render (when the intersected
 * frame set actually changes) instead of one per pointermove. The gesture
 * captures the selection at press time so additive and cancel both have a
 * stable origin.
 */
export function useStudioCanvasMarquee({
	canvasRef,
	marqueeRef,
	selectedFrameIds,
	onSelectFrames,
	panMode,
}: UseStudioCanvasMarqueeInput): StudioCanvasMarqueeGesture {
	// Latest selection and commit handler for the marquee gesture, read through
	// refs so the pointer handlers stay stable and never re-render the frames.
	const selectedFrameIdsRef = useRef(selectedFrameIds);
	selectedFrameIdsRef.current = selectedFrameIds;
	const selectFramesRef = useRef(onSelectFrames);
	selectFramesRef.current = onSelectFrames;

	/**
	 * Transient marquee gesture state.
	 *
	 * `active` flips true once the drag passes the threshold; `base` is the
	 * selection captured at press time so additive and cancel both have a stable
	 * origin.
	 */
	const gestureRef = useRef<{
		pointerId: number;
		start: Point;
		base: string[];
		additive: boolean;
		active: boolean;
		previewKey: string;
	} | null>(null);

	const paintMarquee = useCallback(
		(rect: Rect | null) => {
			const node = marqueeRef.current;
			if (!node) return;
			if (!rect) {
				node.style.display = "none";
				return;
			}
			node.style.display = "block";
			node.style.left = `${rect.x}px`;
			node.style.top = `${rect.y}px`;
			node.style.width = `${rect.width}px`;
			node.style.height = `${rect.height}px`;
		},
		[marqueeRef],
	);

	/** Reads every frame artboard's rectangle in shared canvas-local space. */
	const measureFrameBounds = useCallback((): MarqueeFrameBounds[] => {
		const canvas = canvasRef.current;
		if (!canvas) return [];
		const canvasRect = canvas.getBoundingClientRect();
		const measured: MarqueeFrameBounds[] = [];
		for (const node of canvas.querySelectorAll("[data-frame-id]")) {
			const id = node.getAttribute("data-frame-id");
			if (!id) continue;
			const rect = node.getBoundingClientRect();
			measured.push({
				id,
				rect: {
					x: rect.left - canvasRect.left,
					y: rect.top - canvasRect.top,
					width: rect.width,
					height: rect.height,
				},
			});
		}
		return measured;
	}, [canvasRef]);

	/**
	 * Cancels an in-progress marquee and restores the selection captured at
	 * press time. Used by Escape, window blur, pointer cancel, lost capture,
	 * tool switching and unmount so the rectangle never sticks and a preview is
	 * never left half-committed.
	 */
	const cancelMarquee = useCallback(() => {
		const gesture = gestureRef.current;
		gestureRef.current = null;
		paintMarquee(null);
		if (gesture?.active) {
			selectFramesRef.current?.(gesture.base);
		}
	}, [paintMarquee]);

	/** Drops the gesture and rectangle without touching the route selection. */
	const abortMarquee = useCallback(() => {
		gestureRef.current = null;
		paintMarquee(null);
	}, [paintMarquee]);

	/** Commits the current preview selection and hides the rectangle. */
	const commitMarquee = useCallback(() => {
		gestureRef.current = null;
		paintMarquee(null);
	}, [paintMarquee]);

	const handleCanvasPointerDown = useCallback(
		(event: React.PointerEvent) => {
			const canvas = canvasRef.current;
			if (!canvas || event.button !== 0) return;
			// A frame, control, field, menu or dialog owns its own gesture.
			if (isMarqueeIgnoredTarget(event.target)) return;
			const rect = canvas.getBoundingClientRect();
			const start: Point = {
				x: event.clientX - rect.left,
				y: event.clientY - rect.top,
			};
			gestureRef.current = {
				pointerId: event.pointerId,
				start,
				base: selectedFrameIdsRef.current,
				additive: event.shiftKey,
				active: false,
				previewKey: "",
			};
			event.currentTarget.setPointerCapture?.(event.pointerId);
		},
		[canvasRef],
	);

	const handleCanvasPointerMove = useCallback(
		(event: React.PointerEvent) => {
			const gesture = gestureRef.current;
			const canvas = canvasRef.current;
			if (!gesture || !canvas || gesture.pointerId !== event.pointerId) return;
			const canvasRect = canvas.getBoundingClientRect();
			const current: Point = {
				x: event.clientX - canvasRect.left,
				y: event.clientY - canvasRect.top,
			};
			if (
				!gesture.active &&
				!exceedsDragThreshold(
					gesture.start,
					current,
					STUDIO_CANVAS_MARQUEE_DRAG_THRESHOLD_PX,
				)
			) {
				return;
			}
			gesture.active = true;
			const marquee = normalizeRect(gesture.start, current);
			paintMarquee(marquee);
			const resolved = resolveMarqueeSelection(marquee, measureFrameBounds(), {
				additive: gesture.additive,
				base: gesture.base,
			});
			// Only commit a selection change when the intersected set actually
			// changed, so a smooth drag does not re-render the composer per move.
			const key = resolved.join("|");
			if (key === gesture.previewKey) return;
			gesture.previewKey = key;
			selectFramesRef.current?.(resolved);
		},
		[canvasRef, measureFrameBounds, paintMarquee],
	);

	const handleCanvasPointerUp = useCallback(
		(event: React.PointerEvent) => {
			const gesture = gestureRef.current;
			if (!gesture || gesture.pointerId !== event.pointerId) return;
			if (gesture.active) {
				// The preview already equals the committed set; keep it.
				commitMarquee();
				return;
			}
			// A press with no drag is a click: on empty canvas it clears the
			// selection, while shift keeps the current selection intact.
			gestureRef.current = null;
			if (!gesture.additive) selectFramesRef.current?.([]);
		},
		[commitMarquee],
	);

	const hasActiveGesture = useCallback(() => gestureRef.current !== null, []);

	// Leaving select mode (hand tool or space-pan) abandons any in-progress
	// marquee so a pan can never inherit a half-drawn selection rectangle.
	useEffect(() => {
		if (!panMode) return;
		cancelMarquee();
	}, [panMode, cancelMarquee]);

	// Unmount must drop the gesture and its rectangle: a removed canvas can
	// neither paint nor commit a selection afterwards.
	useEffect(() => abortMarquee, [abortMarquee]);

	return {
		handleCanvasPointerDown,
		handleCanvasPointerMove,
		handleCanvasPointerUp,
		cancelMarquee,
		hasActiveGesture,
	};
}
