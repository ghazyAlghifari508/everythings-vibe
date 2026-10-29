import { useCallback, useEffect, useRef, useState } from "react";
import type { StudioFrameRow } from "@/db/schema";
import {
	isStudioCanvasViewVisible,
	readStudioCanvasView,
	writeStudioCanvasView,
} from "@/features/studio/services/studio-canvas-view";
import {
	STUDIO_CANVAS_VIEW_SAVE_DELAY_MS,
	STUDIO_VISUAL_FALLBACK_HEIGHT,
	STUDIO_VISUAL_WIDTH,
} from "@/features/studio/types/studio-constants";
import {
	computeCanvasFit,
	computeCanvasInitialView,
	type StudioCanvasView,
} from "@/features/studio/utils/studio-canvas-fit";
import { useIsomorphicLayoutEffect } from "@/hooks/use-isomorphic-layout-effect";

interface UseStudioCanvasViewInput {
	projectId: string;
	/** Comfortable scale for this project's viewport class. */
	preferredZoom: number;
	frames: StudioFrameRow[];
	canvasRef: React.RefObject<HTMLElement | null>;
	selectedFrameId: string | null;
	zoom: number;
	pan: { x: number; y: number };
	minZoom: number;
	maxZoom: number;
	setZoom: (value: number | ((prev: number) => number)) => void;
	setPan: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
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
	canvasRef,
	selectedFrameId,
	zoom,
	pan,
	minZoom,
	maxZoom,
	setZoom,
	setPan,
	resetZoom,
}: UseStudioCanvasViewInput): {
	measureFrame: (id: string, width: number, height: number) => void;
	fitAll: () => void;
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

	const fitAll = useCallback(() => {
		const canvas = canvasRef.current;
		if (!canvas || !frames.length) {
			resetZoom();
			return;
		}
		const bounds = frames.map(
			(frame) =>
				dimensions.get(frame.id) ?? {
					width:
						frame.viewport === "mobile"
							? STUDIO_VISUAL_WIDTH.mobile
							: STUDIO_VISUAL_WIDTH.web,
					height:
						frame.viewport === "mobile"
							? STUDIO_VISUAL_FALLBACK_HEIGHT.mobile
							: STUDIO_VISUAL_FALLBACK_HEIGHT.web,
				},
		);
		const { zoom: nextZoom, pan: nextPan } = computeCanvasFit({
			bounds,
			available: canvas.getBoundingClientRect(),
			minZoom,
			maxZoom,
		});
		setZoom(nextZoom);
		setPan(nextPan);
	}, [
		canvasRef,
		dimensions,
		frames,
		maxZoom,
		minZoom,
		resetZoom,
		setPan,
		setZoom,
	]);

	// Restored or computed before paint: the canvas never shows the throwaway
	// preset scale first, and no later frame update may override it.
	const initializedProjectRef = useRef<string | null>(null);
	useIsomorphicLayoutEffect(() => {
		if (initializedProjectRef.current === projectId) return;
		if (!frames.length) return;
		const canvas = canvasRef.current;
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		const available = { width: rect.width, height: rect.height };
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

	return { measureFrame, fitAll };
}
