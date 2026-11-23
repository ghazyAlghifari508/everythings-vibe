import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import { StudioFrameToolbar } from "@/features/studio/components/canvas/studio-frame-toolbar";
import { useStudioCanvasInput } from "@/features/studio/hooks/use-studio-canvas-input";
import { useStudioCanvasMarquee } from "@/features/studio/hooks/use-studio-canvas-marquee";
import { useStudioCanvasView } from "@/features/studio/hooks/use-studio-canvas-view";
import { useStudioLivePool } from "@/features/studio/hooks/use-studio-live-pool";
import {
	STUDIO_CANVAS_INITIAL_ZOOM,
	STUDIO_CANVAS_MAX_ZOOM,
	STUDIO_CANVAS_MIN_ZOOM,
	STUDIO_CANVAS_OVERLAY_EDGE_PX,
} from "@/features/studio/types/studio-constants";
import {
	buildStudioPreviewTarget,
	type StudioPreviewTarget,
} from "@/features/studio/types/studio-preview-contract";
import {
	type StudioDevice,
	studioNativeDevice,
} from "@/features/studio/types/studio-renderer";
import { isCanvasControlTarget } from "@/features/studio/utils/studio-canvas-gesture";
import {
	computeFrameToolbarPlacement,
	type StudioFrameToolbarPlacement,
} from "@/features/studio/utils/studio-frame-toolbar";
import { deriveStudioLifecycle } from "@/features/studio/utils/studio-lifecycle";
import { useCanvasZoom } from "@/hooks/use-canvas-zoom";
import type {
	StudioElementAction,
	StudioElementTarget,
} from "../../types/studio-element";

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
	retryingPlanning?: boolean;
	onRefreshStatus?: () => void;
	retryingFrameIds?: string[];
	frameRetryErrors?: Record<string, string>;
	elementTarget?: StudioElementTarget | null;
	onSelectElement?: (target: StudioElementTarget | null) => void;
	onElementAction?: (
		action: StudioElementAction,
		target: StudioElementTarget,
		text?: string,
	) => void;
	elementActionBusy?: boolean;
	/** Presentation-only device per frame id; absent means the native device. */
	frameDevices?: Readonly<Record<string, StudioDevice>>;
	/** Explicit Refresh invalidation per frame; never touches HTML or revision. */
	frameRefreshTokens?: Readonly<Record<string, number>>;
	onFrameDeviceChange?: (frameId: string, device: StudioDevice) => void;
	onRefreshFrame?: (frameId: string) => void;
	onOpenPreview?: (target: StudioPreviewTarget) => void;
	/** False disables the Preview action, e.g. when no viewer handler is wired. */
	previewRouteAvailable?: boolean;
	/** Left band covered by the floating chat panel; `null` until its layout is known. */
	leftInsetPx?: number | null;
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
	retryingPlanning = false,
	onRefreshStatus,
	retryingFrameIds = [],
	frameRetryErrors,
	elementTarget,
	onSelectElement,
	onElementAction,
	elementActionBusy = false,
	frameDevices,
	frameRefreshTokens,
	onFrameDeviceChange,
	onRefreshFrame,
	onOpenPreview,
	previewRouteAvailable = true,
	leftInsetPx = 0,
	className = "",
}: StudioCanvasProps) {
	const canvasRef = useRef<HTMLElement>(null);

	const priorityFrameId = frames.find((frame) => frame.htmlCode)?.id;
	const lifecycle = deriveStudioLifecycle({ project, frames, activeJob });
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
		// The pointer-anchored zoom is expressed in canvas-local space, the same
		// space the surface transform uses.
		containerRef: canvasRef,
	});

	const [tool, setTool] = useState<StudioCanvasTool>("select");
	const [spacePan, setSpacePan] = useState(false);
	const [isPanning, setIsPanning] = useState(false);
	const panMode = tool === "hand" || spacePan;
	const editableFrameIds = useMemo(
		() =>
			frames
				.filter((frame) => frame.htmlCode && frame.status === "ready")
				.map((frame) => frame.id),
		[frames],
	);
	const elementTool = tool === "element";

	const { pool: livePool, reportVisibility } = useStudioLivePool({
		frames,
		selectedFrameId: elementTool ? null : selectedFrameId,
		selectedFrameIds: elementTool ? editableFrameIds : selectedFrameIds,
		inspectFrameId: null,
	});

	const { measureFrame, fitAll, bounds, focusFrame } = useStudioCanvasView({
		projectId: project.id,
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

	// Only the live renderer knows whether a non-native viewport has a prepared
	// surface. Device buttons must not enable before that signal arrives.
	const [liveReadyFrameIds, setLiveReadyFrameIds] = useState<
		ReadonlySet<string>
	>(() => new Set());
	const reportRendererReadiness = useCallback(
		(frameId: string, ready: boolean) => {
			setLiveReadyFrameIds((previous) => {
				if (previous.has(frameId) === ready) return previous;
				const next = new Set(previous);
				if (ready) next.add(frameId);
				else next.delete(frameId);
				return next;
			});
		},
		[],
	);

	const activeElementId = elementTarget?.frameId ?? null;
	const toolbarFrameId =
		frames.length === 1 &&
		frames[0]?.status === "ready" &&
		!elementTool &&
		selectedFrameId === frames[0]?.id &&
		activeElementId === null &&
		!hasActiveGesture &&
		!isPanning
			? (frames[0]?.id ?? null)
			: null;
	const toolbarContext = useMemo(() => {
		if (!toolbarFrameId) return null;
		const frame = frames.find((item) => item.id === toolbarFrameId);
		if (!frame) return null;
		const nativeDevice = studioNativeDevice(frame.viewport);
		const device = frameDevices?.[frame.id] ?? nativeDevice;
		return {
			frame,
			device,
			nativeDevice,
			liveReady: liveReadyFrameIds.has(frame.id),
			previewTarget: buildStudioPreviewTarget({
				projectId: project.id,
				frameId: frame.id,
				device,
				returnTo: `/design/${encodeURIComponent(project.id)}`,
				routeAvailable: previewRouteAvailable && Boolean(onOpenPreview),
			}),
		};
	}, [
		frameDevices,
		frames,
		liveReadyFrameIds,
		previewRouteAvailable,
		onOpenPreview,
		project.id,
		toolbarFrameId,
	]);

	const [viewportTick, setViewportTick] = useState(0);
	useEffect(() => {
		const handleResize = () => setViewportTick((value) => value + 1);
		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, []);
	// viewportTick is a deliberate recompute trigger after a resize.
	// biome-ignore lint/correctness/useExhaustiveDependencies: viewportTick forces placement recalculation
	const toolbarPlacement = useMemo<StudioFrameToolbarPlacement | null>(() => {
		if (!toolbarContext || !canvasRef.current) return null;
		const rect = canvasRef.current.getBoundingClientRect();
		return computeFrameToolbarPlacement({
			bounds,
			frameIndex: frames.findIndex(
				(item) => item.id === toolbarContext.frame.id,
			),
			zoom,
			pan,
			canvas: { width: rect.width, height: rect.height },
			leftInsetPx: leftInsetPx ?? 0,
		});
	}, [
		bounds,
		canvasRef,
		frames,
		leftInsetPx,
		pan,
		toolbarContext,
		viewportTick,
		zoom,
	]);

	const focusedDeviceRef = useRef<StudioDevice | undefined>(undefined);
	useEffect(() => {
		if (!toolbarFrameId || !toolbarContext) return;
		const device = toolbarContext.device;
		if (focusedDeviceRef.current === undefined) {
			focusedDeviceRef.current = device;
			return;
		}
		if (focusedDeviceRef.current === device) return;
		focusedDeviceRef.current = device;
		focusFrame(toolbarFrameId);
	}, [focusFrame, toolbarContext, toolbarFrameId]);

	const handleDeviceChange = useCallback(
		(device: StudioDevice) => {
			if (!toolbarFrameId) return;
			onFrameDeviceChange?.(toolbarFrameId, device);
		},
		[onFrameDeviceChange, toolbarFrameId],
	);
	const handleToolbarPreview = useCallback(
		(target: StudioPreviewTarget) => {
			if (target.routeAvailable) onOpenPreview?.(target);
		},
		[onOpenPreview],
	);

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
				// Element editing happens inside the isolated document. A press on
				// the surrounding canvas must neither marquee-select nor pan.
				if (elementTool) return;
				if (panMode) {
					if (isCanvasControlTarget(event.target)) return;
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
				cursor: elementTool
					? "crosshair"
					: panMode
						? isPanning
							? "grabbing"
							: "grab"
						: "default",
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
				{frames.length > 0 && !lifecycle.planningFailed ? (
					frames.map((frame) => (
						<StudioFrame
							key={frame.id}
							frame={frame}
							job={activeJob}
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
							inspectElement={
								elementTool && editableFrameIds.includes(frame.id)
							}
							elementTarget={
								elementTarget?.frameId === frame.id ? elementTarget : null
							}
							onSelectElement={onSelectElement}
							onElementAction={onElementAction}
							elementActionBusy={elementActionBusy}
							menuLeftInsetPx={leftInsetPx ?? 0}
							liveEnabled={livePool.includes(frame.id)}
							device={frameDevices?.[frame.id]}
							onVisibilityChange={reportVisibility}
							refreshToken={frameRefreshTokens?.[frame.id]}
							onRendererReadinessChange={reportRendererReadiness}
						/>
					))
				) : lifecycle.planningFailed ? (
					<StudioCanvasPlanningFailure
						onRetryPlanning={
							lifecycle.canRetryPlanning ? onRetryPlanning : undefined
						}
						retryingPlanning={retryingPlanning}
					/>
				) : null}
			</div>
			{toolbarContext && toolbarPlacement && (
				<StudioFrameToolbar
					placement={toolbarPlacement}
					frameName={toolbarContext.frame.name}
					device={toolbarContext.device}
					nativeDevice={toolbarContext.nativeDevice}
					liveReady={toolbarContext.liveReady}
					previewTarget={toolbarContext.previewTarget}
					onDeviceChange={handleDeviceChange}
					onFocus={() => focusFrame(toolbarContext.frame.id)}
					onRefresh={() => onRefreshFrame?.(toolbarContext.frame.id)}
					onPreview={handleToolbarPreview}
				/>
			)}
			{lifecycle.inconsistent && (
				<output
					className="absolute top-20 z-20 max-w-md rounded-xl border border-graphite bg-obsidian p-4 text-sm text-fog"
					style={{
						left: `${(leftInsetPx ?? 0) + STUDIO_CANVAS_OVERLAY_EDGE_PX}px`,
					}}
				>
					<p>Proses selesai, tetapi sebagian data desain belum tersedia.</p>
					{onRefreshStatus && (
						<button
							type="button"
							onClick={onRefreshStatus}
							className="mt-2 rounded px-2 py-1 text-snow focus-visible:outline-2 focus-visible:outline-snow"
						>
							Muat ulang status
						</button>
					)}
				</output>
			)}

			{activeJob && (
				<StudioCanvasQueueReadout
					activeJob={activeJob}
					leftInsetPx={leftInsetPx ?? 0}
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

			<StudioCanvasToolPalette
				tool={tool}
				onSelectTool={selectTool}
				canSelectElement={
					editableFrameIds.length > 0 && Boolean(onSelectElement)
				}
			/>

			<StudioCanvasZoomCorner
				zoom={zoom}
				minZoom={minZoom}
				maxZoom={maxZoom}
				onZoomIn={zoomIn}
				onZoomOut={zoomOut}
				onFit={fitAll}
			/>
		</section>
	);
});
