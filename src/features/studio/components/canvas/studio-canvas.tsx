import { memo, useCallback, useEffect, useRef, useState } from "react";
import type {
	StudioFrameRow,
	StudioJobRow,
	StudioProjectRow,
} from "@/db/schema";
import { getCanvasDotStyle } from "@/features/greenfield/components/whiteboard/canvas-connectors";
import {
	StudioCanvasPlanningFailure,
	StudioCanvasQueueReadout,
	type StudioCanvasTool,
	StudioCanvasToolPalette,
	StudioCanvasZoomCorner,
} from "@/features/studio/components/canvas/studio-canvas-controls";
import { StudioFrame } from "@/features/studio/components/canvas/studio-frame";
import { useStudioCanvasInput } from "@/features/studio/hooks/use-studio-canvas-input";
import { useStudioCanvasMarquee } from "@/features/studio/hooks/use-studio-canvas-marquee";
import {
	STUDIO_CANVAS_INITIAL_ZOOM,
	STUDIO_CANVAS_MAX_ZOOM,
	STUDIO_CANVAS_MIN_ZOOM,
	STUDIO_VISUAL_FALLBACK_HEIGHT,
	STUDIO_VISUAL_WIDTH,
} from "@/features/studio/types/studio-constants";
import { computeCanvasFit } from "@/features/studio/utils/studio-canvas-fit";
import { useCanvasZoom } from "@/hooks/use-canvas-zoom";

export type {
	StudioCanvasFitInput,
	StudioCanvasFrameBounds,
} from "@/features/studio/utils/studio-canvas-fit";
export { computeCanvasFit } from "@/features/studio/utils/studio-canvas-fit";

export interface StudioCanvasProps {
	project: StudioProjectRow;
	frames: StudioFrameRow[];
	activeJob?: StudioJobRow | null;
	selectedFrameId?: string | null;
	selectedFrameIds?: string[];
	onSelectFrame?: (frameId: string | null, additive?: boolean) => void;
	/**
	 * Commits a whole selection list at once. Marquee selection owns the full
	 * id set (not a single delta), so the canvas reports the resolved list here
	 * and the route stays the single source of truth for `selectedFrameIds`.
	 */
	onSelectFrames?: (frameIds: string[]) => void;
	onRetryFrame?: (frameId: string) => void;
	onRetryPlanning?: () => void;
	className?: string;
}

export const StudioCanvas = memo(function StudioCanvas({
	project,
	frames,
	activeJob = null,
	selectedFrameId = null,
	selectedFrameIds = [],
	onSelectFrame,
	onSelectFrames,
	onRetryFrame,
	onRetryPlanning,
	className = "",
}: StudioCanvasProps) {
	const canvasRef = useRef<HTMLElement>(null);
	const marqueeRef = useRef<HTMLDivElement>(null);

	const {
		zoom,
		pan,
		setPan,
		setZoom,
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
	} = useCanvasZoom({
		minZoom: STUDIO_CANVAS_MIN_ZOOM,
		maxZoom: STUDIO_CANVAS_MAX_ZOOM,
		initialZoom:
			STUDIO_CANVAS_INITIAL_ZOOM[
				project.designMode === "mobile" ? "mobile" : "web"
			],
	});

	const [tool, setTool] = useState<StudioCanvasTool>("select");
	const [spacePan, setSpacePan] = useState(false);
	const [isPanning, setIsPanning] = useState(false);
	const panMode = tool === "hand" || spacePan;
	// Real artboard measurements are reactive state, not a ref: a fit must run
	// when a preview arrives and its true height is known.
	const [dimensions, setDimensions] = useState<
		ReadonlyMap<string, { width: number; height: number }>
	>(() => new Map());
	// Once the user pans or zooms, the view belongs to them and automatic
	// re-fitting stops.
	const userPositioned = useRef(false);
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
	const fitCanvas = useCallback(() => {
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
		userPositioned.current = false;
		setZoom(nextZoom);
		setPan(nextPan);
	}, [dimensions, frames, maxZoom, minZoom, resetZoom, setPan, setZoom]);
	// An untouched workspace keeps the whole project in view. The signature
	// changes only when a frame slot appears or a real artboard size is
	// measured, so status polls do not repeatedly recentre the view, and a user
	// who already panned or zoomed is never yanked back at all.
	const layoutSignature = frames
		.map((frame) => {
			const measured = dimensions.get(frame.id);
			return measured
				? `${frame.id}:${measured.width}x${measured.height}`
				: frame.id;
		})
		.join("|");
	const fitSignatureRef = useRef("");
	useEffect(() => {
		if (!frames.length) return;
		if (fitSignatureRef.current === layoutSignature) return;
		fitSignatureRef.current = layoutSignature;
		if (userPositioned.current) return;
		fitCanvas();
	}, [layoutSignature, frames.length, fitCanvas]);

	// Every user-driven view change opts out of automatic re-fitting, so a
	// frame that finishes later cannot move the view the user is working in.
	const zoomInByUser = useCallback(() => {
		userPositioned.current = true;
		zoomIn();
	}, [zoomIn]);
	const zoomOutByUser = useCallback(() => {
		userPositioned.current = true;
		zoomOut();
	}, [zoomOut]);

	// Stable frame callbacks keep the memoized artboards from re-rendering on
	// every pan frame; the handlers read the latest values through refs.
	const panModeRef = useRef(panMode);
	panModeRef.current = panMode;
	const selectFrameRef = useRef(onSelectFrame);
	selectFrameRef.current = onSelectFrame;
	const retryFrameRef = useRef(onRetryFrame);
	retryFrameRef.current = onRetryFrame;
	const handleFrameSelect = useCallback((id: string, additive?: boolean) => {
		if (panModeRef.current) return;
		selectFrameRef.current?.(id, additive);
	}, []);
	const handleFrameRetry = useCallback((id: string) => {
		retryFrameRef.current?.(id);
	}, []);

	const {
		handleCanvasPointerDown,
		handleCanvasPointerMove,
		handleCanvasPointerUp,
		cancelMarquee,
		hasActiveGesture,
	} = useStudioCanvasMarquee({
		canvasRef,
		marqueeRef,
		selectedFrameIds,
		onSelectFrames,
		panMode,
	});

	useStudioCanvasInput({
		canvasRef,
		userPositioned,
		onWheel,
		setPan,
		nudgePan,
		endPan,
		setTool,
		setSpacePan,
		setIsPanning,
		onSelectFrame,
		cancelMarquee,
		hasActiveGesture,
	});

	// Switching tools abandons any in-progress marquee so a pan or a fresh
	// selection can never inherit a half-drawn rectangle.
	const selectTool = useCallback(
		(next: StudioCanvasTool) => {
			cancelMarquee();
			setTool(next);
		},
		[cancelMarquee],
	);

	return (
		<section
			ref={canvasRef}
			data-testid="studio-canvas"
			aria-label={`Canvas Desain ${project.title}`}
			onPointerDown={(event) => {
				if (panMode) {
					if (startPan(event)) setIsPanning(true);
					return;
				}
				// Select mode: an empty-canvas press arms a marquee. Frames and
				// floating controls are excluded so their own handlers win.
				handleCanvasPointerDown(event);
			}}
			onPointerMove={(event) => {
				// Any drag also opts out of automatic re-fitting.
				if (panMode) userPositioned.current = true;
				updatePan(event);
				handleCanvasPointerMove(event);
			}}
			onPointerUp={(event) => {
				endPan();
				setIsPanning(false);
				handleCanvasPointerUp(event);
			}}
			onPointerCancel={() => {
				endPan();
				setIsPanning(false);
				cancelMarquee();
			}}
			// Pointer capture can be revoked mid-drag (element removal, OS
			// gesture, focus loss). Without this the canvas would keep panning
			// on the next move and stay stuck in the grabbing cursor, and a
			// marquee would stay painted with a half-committed selection.
			onLostPointerCapture={() => {
				endPan();
				setIsPanning(false);
				cancelMarquee();
			}}
			className={`relative size-full overflow-hidden select-none touch-none bg-charcoal text-snow focus-visible:outline-2 focus-visible:outline-snow ${className}`}
			style={{
				...getCanvasDotStyle(zoom, pan),
				cursor: panMode ? (isPanning ? "grabbing" : "grab") : "default",
			}}
		>
			{/* Transformed Canvas Surface holding frames */}
			<div
				data-testid="studio-canvas-surface"
				className="absolute top-0 left-0 flex items-start gap-14 p-24"
				style={{
					transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
					transformOrigin: "0 0",
				}}
			>
				{frames.length > 0 ? (
					frames.map((frame) => (
						<StudioFrame
							key={frame.id}
							frame={frame}
							onMeasure={measureFrame}
							isSelected={
								selectedFrameIds.length
									? selectedFrameIds.includes(frame.id)
									: selectedFrameId === frame.id
							}
							onSelect={handleFrameSelect}
							onRetry={handleFrameRetry}
							isCanvasPanning={panMode}
						/>
					))
				) : activeJob?.status === "failed" ? (
					<StudioCanvasPlanningFailure
						error={activeJob?.error}
						onRetryPlanning={onRetryPlanning}
					/>
				) : null}
			</div>

			{activeJob && (
				<StudioCanvasQueueReadout
					activeJob={activeJob}
					hasFrames={frames.length > 0}
				/>
			)}

			{/* Selection rectangle. Painted imperatively during a drag so a
			    pointermove never re-renders the canvas; it only appears once the
			    drag passes the threshold and is hidden again on release/cancel.
			    Styling stays restrained: a clear accent outline over a light
			    accent wash, matching the selected-frame border colour. */}
			<div
				ref={marqueeRef}
				data-testid="studio-marquee"
				aria-hidden
				style={{ display: "none" }}
				className="pointer-events-none absolute z-10 rounded-sm border border-blue-600/70 bg-blue-600/10"
			/>

			<StudioCanvasToolPalette tool={tool} onSelectTool={selectTool} />

			<StudioCanvasZoomCorner
				zoom={zoom}
				onZoomIn={zoomInByUser}
				onZoomOut={zoomOutByUser}
				onFit={fitCanvas}
			/>
		</section>
	);
});
