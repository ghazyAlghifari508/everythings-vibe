import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StudioFrameRow } from "@/db/schema";
import {
	isStudioCanvasViewVisible,
	readStudioCanvasView,
	writeStudioCanvasView,
} from "@/features/studio/services/studio-canvas-view";
import {
	STUDIO_CANVAS_FOCUS_TRANSITION_MS,
	STUDIO_CANVAS_VIEW_SAVE_DELAY_MS,
	STUDIO_VISUAL_FALLBACK_HEIGHT,
	STUDIO_VISUAL_WIDTH,
} from "@/features/studio/types/studio-constants";
import {
	computeCanvasFit,
	computeCanvasInitialView,
	computeFrameFocus,
	type StudioCanvasFrameBounds,
	type StudioCanvasView,
} from "@/features/studio/utils/studio-canvas-fit";
import { useIsomorphicLayoutEffect } from "@/hooks/use-isomorphic-layout-effect";
import type { StudioDevice } from "../types/studio-renderer";
import {
	STUDIO_DEVICE_PRESETS,
	studioNativeDevice,
} from "../types/studio-renderer";

interface UseStudioCanvasViewInput {
	projectId: string;
	/** Comfortable scale for this project's viewport class. */
	preferredZoom: number;
	frames: StudioFrameRow[];
	/**
	 * Width a floating overlay covers on the left. `null` while the layout is not
	 * known yet, so the opening view is never computed against a guessed width.
	 */
	leftInsetPx: number | null;
	canvasRef: React.RefObject<HTMLElement | null>;
	selectedFrameId: string | null;
	zoom: number;
	pan: { x: number; y: number };
	minZoom: number;
	maxZoom: number;
	/** Presentation-only viewport choice per frame; never part of generated HTML. */
	frameDevices?: Readonly<Record<string, StudioDevice>>;
	setZoom: (value: number) => void;
	setPan: (value: { x: number; y: number }) => void;
	resetZoom: () => void;
}

/**
 * Opening view, explicit Fit All, and per-project view persistence.
 *
 * The opening view is computed once per project from the frame list and the
 * canvas rect alone: it deliberately ignores measured artboard heights, so a
 * preview arriving or a tall screen finishing can never rescale or recentre a
 * board the user is already working in.
 */
export function useStudioCanvasView({
	projectId,
	preferredZoom,
	frames,
	leftInsetPx,
	canvasRef,
	selectedFrameId,
	zoom,
	pan,
	minZoom,
	maxZoom,
	frameDevices,
	setZoom,
	setPan,
	resetZoom,
}: UseStudioCanvasViewInput): {
	measureFrame: (id: string, width: number, height: number) => void;
	fitAll: () => void;
	bounds: StudioCanvasFrameBounds[];
	focusFrame: (frameId: string) => void;
	cancelFocusAnimation: () => void;
} {
	// Real artboard measurements only feed Fit All, where the true rendered
	// heights are exactly what the user asked to see.
	const [dimensions, setDimensions] = useState<
		ReadonlyMap<string, { width: number; height: number }>
	>(() => new Map());
	const measureFrame = useCallback(
		(id: string, width: number, height: number) => {
			setDimensions((previous) => {
				const existing = previous.get(id);
				if (existing?.width === width && existing?.height === height) {
					return previous;
				}
				const next = new Map(previous);
				next.set(id, { width, height });
				return next;
			});
		},
		[],
	);
	// Measured artboards win; before measurement the real device preset is the
	// best available geometry, so a device switch never waits for a screenshot.
	const frameDevicesKey = frameDevices
		? Object.entries(frameDevices)
				.map(([id, value]) => `${id}:${value}`)
				.join("|")
		: "";
	// biome-ignore lint/correctness/useExhaustiveDependencies: frameDevicesKey is the stable identity of frameDevices
	const bounds = useMemo<StudioCanvasFrameBounds[]>(
		() =>
			frames.map((frame) => {
				const measured = dimensions.get(frame.id);
				if (measured) return measured;
				const device =
					frameDevices?.[frame.id] ?? studioNativeDevice(frame.viewport);
				const preset = STUDIO_DEVICE_PRESETS[device];
				return { width: preset.width, height: preset.height };
			}),
		[dimensions, frameDevicesKey, frames],
	);

	const fitAll = useCallback(() => {
		const canvas = canvasRef.current;
		if (!canvas || !frames.length) {
			resetZoom();
			return;
		}
		// `bounds` already prefers measured artboards and current device presets.
		const { zoom: nextZoom, pan: nextPan } = computeCanvasFit({
			bounds,
			available: {
				width: canvas.getBoundingClientRect().width,
				height: canvas.getBoundingClientRect().height,
				insetLeft: leftInsetPx ?? 0,
			},
			minZoom,
			maxZoom,
		});
		setZoom(nextZoom);
		setPan(nextPan);
	}, [
		bounds,
		canvasRef,
		frames.length,
		leftInsetPx,
		maxZoom,
		minZoom,
		resetZoom,
		setPan,
		setZoom,
	]);
	const focusAnimationRef = useRef<number | null>(null);
	const cancelFocusAnimation = useCallback(() => {
		if (focusAnimationRef.current === null) return;
		cancelAnimationFrame(focusAnimationRef.current);
		focusAnimationRef.current = null;
	}, []);
	useEffect(() => () => cancelFocusAnimation(), [cancelFocusAnimation]);
	const liveViewRef = useRef({ zoom, pan });
	liveViewRef.current = { zoom, pan };
	const focusFrame = useCallback(
		(frameId: string) => {
			const canvas = canvasRef.current;
			const index = frames.findIndex((frame) => frame.id === frameId);
			if (!canvas || index < 0) return;
			cancelFocusAnimation();
			const rect = canvas.getBoundingClientRect();
			const { zoom: targetZoom, pan: targetPan } = computeFrameFocus({
				bounds,
				available: {
					width: rect.width,
					height: rect.height,
					insetLeft: leftInsetPx ?? 0,
				},
				minZoom,
				maxZoom,
				frameIndex: index,
			});
			const reduceMotion =
				typeof window !== "undefined" &&
				typeof window.matchMedia === "function" &&
				window.matchMedia("(prefers-reduced-motion: reduce)").matches;
			if (reduceMotion) {
				setZoom(targetZoom);
				setPan(targetPan);
				return;
			}
			const from = liveViewRef.current;
			const start = performance.now();
			const tick = (now: number) => {
				const progress = Math.min(
					1,
					(now - start) / STUDIO_CANVAS_FOCUS_TRANSITION_MS,
				);
				const eased = 1 - (1 - progress) ** 3;
				setZoom(from.zoom + (targetZoom - from.zoom) * eased);
				setPan({
					x: from.pan.x + (targetPan.x - from.pan.x) * eased,
					y: from.pan.y + (targetPan.y - from.pan.y) * eased,
				});
				if (progress < 1)
					focusAnimationRef.current = requestAnimationFrame(tick);
				else focusAnimationRef.current = null;
			};
			focusAnimationRef.current = requestAnimationFrame(tick);
		},
		[
			bounds,
			cancelFocusAnimation,
			canvasRef,
			frames,
			leftInsetPx,
			maxZoom,
			minZoom,
			setPan,
			setZoom,
		],
	);

	// Restored or computed before paint: the canvas never shows the throwaway
	// preset scale first, and no later frame update may override it.
	const initializedProjectRef = useRef<string | null>(null);
	useIsomorphicLayoutEffect(() => {
		if (initializedProjectRef.current === projectId) return;
		if (!frames.length || leftInsetPx === null) return;
		const canvas = canvasRef.current;
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		const available = {
			width: rect.width,
			height: rect.height,
			insetLeft: leftInsetPx,
		};
		// A zero-sized canvas (hidden tab, server render, test DOM) has no
		// geometry to frame yet.
		if (available.width <= 0 || available.height <= 0) return;
		initializedProjectRef.current = projectId;
		const bounds = frames.map((frame) => ({
			width:
				frame.viewport === "mobile"
					? STUDIO_VISUAL_WIDTH.mobile
					: STUDIO_VISUAL_WIDTH.web,
			height:
				frame.viewport === "mobile"
					? STUDIO_VISUAL_FALLBACK_HEIGHT.mobile
					: STUDIO_VISUAL_FALLBACK_HEIGHT.web,
		}));
		const stored = readStudioCanvasView(projectId, { minZoom, maxZoom });
		const view =
			stored && isStudioCanvasViewVisible(stored, bounds, available)
				? stored
				: computeCanvasInitialView({
						bounds,
						available,
						minZoom,
						maxZoom,
						preferredZoom,
						anchorIndex: selectedFrameId
							? frames.findIndex((frame) => frame.id === selectedFrameId)
							: 0,
					});
		setZoom(view.zoom);
		setPan(view.pan);
	}, [
		canvasRef,
		frames,
		leftInsetPx,
		maxZoom,
		minZoom,
		preferredZoom,
		projectId,
		selectedFrameId,
		setPan,
		setZoom,
	]);

	// Persist the working view per project. Debounced, so a wheel burst writes
	// once at rest instead of on every event, and flushed on unmount so a quick
	// project switch keeps the last position.
	const latestViewRef = useRef<{ projectId: string; view: StudioCanvasView }>({
		projectId,
		view: { zoom, pan },
	});
	latestViewRef.current = { projectId, view: { zoom, pan } };
	useEffect(() => {
		if (initializedProjectRef.current !== projectId) return;
		const timer = setTimeout(
			() => writeStudioCanvasView(projectId, { zoom, pan }),
			STUDIO_CANVAS_VIEW_SAVE_DELAY_MS,
		);
		return () => clearTimeout(timer);
	}, [pan, projectId, zoom]);
	useEffect(
		() => () => {
			const latest = latestViewRef.current;
			// Never persist the pre-initialization preset as a user preference.
			if (initializedProjectRef.current === latest.projectId)
				writeStudioCanvasView(latest.projectId, latest.view);
		},
		[],
	);

	return {
		measureFrame,
		fitAll,
		bounds,
		focusFrame,
		cancelFocusAnimation,
	};
}
