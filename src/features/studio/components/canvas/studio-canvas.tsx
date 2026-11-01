import { memo, useCallback, useRef, useState } from "react";
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
import { useStudioCanvasView } from "@/features/studio/hooks/use-studio-canvas-view";
import {
	STUDIO_CANVAS_INITIAL_ZOOM,
	STUDIO_CANVAS_MAX_ZOOM,
	STUDIO_CANVAS_MIN_ZOOM,
} from "@/features/studio/types/studio-constants";
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
	retryingFrameIds?: string[];
	frameRetryErrors?: Record<string, string>;
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
	retryingFrameIds = [],
	frameRetryErrors,
	className = "",
}: StudioCanvasProps) {
	const canvasRef = useRef<HTMLElement>(null);
	const priorityFrameId = frames.find((frame) => frame.htmlCode)?.id;
	const marqueeRef = useRef<HTMLDivElement>(null);
	const preferredZoom =
		STUDIO_CANVAS_INITIAL_ZOOM[
			project.designMode === "mobile" ? "mobile" : "web"
		];

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
		initialZoom: preferredZoom,
	});

	const [tool, setTool] = useState<StudioCanvasTool>("select");
	const [spacePan, setSpacePan] = useState(false);
	const [isPanning, setIsPanning] = useState(false);
	const panMode = tool === "hand" || spacePan;

	const { measureFrame, fitAll } = useStudioCanvasView({
		projectId: project.id,
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
	});

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
							priorityPreview={frame.id === priorityFrameId}
							initialJobTiming={
								activeJob?.jobType === "initial" ? activeJob : undefined
							}
							onMeasure={measureFrame}
							isSelected={
								selectedFrameIds.length
									? selectedFrameIds.includes(frame.id)
									: selectedFrameId === frame.id
							}
							onSelect={handleFrameSelect}
							onRetry={handleFrameRetry}
							isRetryPending={retryingFrameIds.includes(frame.id)}
							retryError={frameRetryErrors?.[frame.id]}
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
				onZoomIn={zoomIn}
				onZoomOut={zoomOut}
				onFit={fitAll}
			/>
		</section>
	);
});
