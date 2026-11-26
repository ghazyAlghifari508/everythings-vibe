import { memo, useCallback, useMemo, useRef, useState } from "react";
import type { StudioFrameRow } from "@/db/schema";
import { getCanvasDotStyle } from "@/features/greenfield/components/whiteboard/canvas-connectors";
import {
	StudioCanvasPlanningFailure,
	StudioCanvasStatusOverlays,
	type StudioCanvasTool,
	StudioCanvasToolPalette,
	StudioCanvasZoomCorner,
} from "@/features/studio/components/canvas/studio-canvas-controls";
import { StudioCanvasFrameActions } from "@/features/studio/components/canvas/studio-canvas-frame-actions";
import { StudioFrame } from "@/features/studio/components/canvas/studio-frame";
import { useStudioCanvasInput } from "@/features/studio/hooks/use-studio-canvas-input";
import { useStudioCanvasMarquee } from "@/features/studio/hooks/use-studio-canvas-marquee";
import { useStudioCanvasView } from "@/features/studio/hooks/use-studio-canvas-view";
import { useStudioLivePool } from "@/features/studio/hooks/use-studio-live-pool";
import {
	STUDIO_CANVAS_INITIAL_ZOOM,
	STUDIO_CANVAS_MAX_ZOOM,
	STUDIO_CANVAS_MIN_ZOOM,
} from "@/features/studio/types/studio-constants";
import type { StudioPreviewTarget } from "@/features/studio/types/studio-preview-contract";
import type { StudioDevice } from "@/features/studio/types/studio-renderer";
import type {
	StudioVisibleJob,
	StudioVisibleProject,
} from "@/features/studio/types/studio-status";
import { extractCleanHtml } from "@/features/studio/utils/clean-html";
import { isCanvasControlTarget } from "@/features/studio/utils/studio-canvas-gesture";
import {
	deriveStudioLifecycle,
	resolveStudioFrameStatus,
} from "@/features/studio/utils/studio-lifecycle";
import { useCanvasZoom } from "@/hooks/use-canvas-zoom";
import type {
	StudioElementAction,
	StudioElementTarget,
} from "../../types/studio-element";

export interface StudioCanvasProps {
	project: StudioVisibleProject;
	frames: StudioFrameRow[];
	activeJob?: StudioVisibleJob | null;
	selectedFrameId?: string | null;
	selectedFrameIds?: string[];
	onSelectFrame?: (frameId: string | null, additive?: boolean) => void;
	onSelectFrames?: (frameIds: string[]) => void;
	onRetryFrame?: (frameId: string) => void;
	onRetryPlanning?: () => void;
	retryingPlanning?: boolean;
	onRefreshStatus?: () => void;
	retryingFrameIds?: string[];
	frameRetryErrors?: Record<string, string>;
	elementTarget?: StudioElementTarget | null;
	onSelectElement?: (
		target: StudioElementTarget | null,
		frameId?: string,
	) => void;
	onElementAction?: (
		action: StudioElementAction,
		target: StudioElementTarget,
		text?: string,
	) => void;
	elementActionBusy?: boolean;
	onElementError?: (message: string) => void;
	frameDevices?: Readonly<Record<string, StudioDevice>>;
	frameRefreshTokens?: Readonly<Record<string, number>>;
	onFrameDeviceChange?: (frameId: string, device: StudioDevice) => void;
	onRefreshFrame?: (frameId: string) => void;
	onOpenPreview?: (target: StudioPreviewTarget) => void;
	focusRequest?: { frameId: string; nonce: number } | null;
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
	onElementError,
	frameDevices,
	frameRefreshTokens,
	onFrameDeviceChange,
	onRefreshFrame,
	onOpenPreview,
	focusRequest = null,
	leftInsetPx = 0,
	className = "",
}: StudioCanvasProps) {
	const canvasRef = useRef<HTMLElement>(null);

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
		minZoom,
		maxZoom,
	} = useCanvasZoom({
		minZoom: STUDIO_CANVAS_MIN_ZOOM,
		maxZoom: STUDIO_CANVAS_MAX_ZOOM,
		initialZoom: preferredZoom,
	});

	const [tool, setActiveTool] = useState<StudioCanvasTool>("select");
	const [spacePan, setSpacePan] = useState(false);
	const [isPanning, setIsPanning] = useState(false);
	const panMode = tool === "hand" || spacePan;
	const selectedIds = useMemo(() => {
		if (selectedFrameIds.length) return selectedFrameIds;
		return selectedFrameId ? [selectedFrameId] : [];
	}, [selectedFrameId, selectedFrameIds]);
	const selectedIdentity = selectedIds.length === 1 ? selectedIds[0] : null;
	const editableFrameIds = useMemo(() => {
		const ids = new Set<string>();
		for (const frame of frames) {
			if (
				resolveStudioFrameStatus(frame, activeJob) === "ready" &&
				frame.htmlCode &&
				extractCleanHtml(frame.htmlCode)
			) {
				ids.add(frame.id);
			}
		}
		return ids;
	}, [frames, activeJob]);
	const elementTool = tool === "element";

	const { pool: livePool, reportVisibility } = useStudioLivePool({
		frames,
		selectedFrameId: selectedIdentity,
		inspectFrameId: elementTool ? (elementTarget?.frameId ?? null) : null,
		inspectMode: elementTool,
	});

	const { measureFrame, fitAll, bounds, focusFrame, cancelFocusAnimation } =
		useStudioCanvasView({
			projectId: project.id,
			preferredZoom,
			frames,
			leftInsetPx,
			canvasRef,
			selectedFrameId: selectedIdentity,
			zoom,
			pan,
			minZoom,
			maxZoom,
			frameDevices,
			focusRequest,
			setZoom,
			setPan,
			resetZoom,
		});

	const {
		isMarqueeDragging,
		handleCanvasPointerDown,
		handleCanvasPointerMove,
		handleCanvasPointerUp,
		cancelMarquee,
		hasActiveGesture,
	} = useStudioCanvasMarquee({
		canvasRef,
		marqueeRef,
		selectedFrameIds: selectedIds,
		onSelectFrames,
		panMode,
	});

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

	const selectedFrameIndex = useMemo(
		() =>
			selectedIdentity
				? frames.findIndex((frame) => frame.id === selectedIdentity)
				: -1,
		[frames, selectedIdentity],
	);
	const selectedFrame = frames[selectedFrameIndex];
	const showFrameActions =
		selectedFrame &&
		editableFrameIds.has(selectedFrame.id) &&
		!lifecycle.planningFailed &&
		!elementTool &&
		!isMarqueeDragging &&
		!isPanning;

	const selectTool = useCallback(
		(next: StudioCanvasTool) => {
			cancelMarquee();
			if (next !== "element" && elementTarget) onSelectElement?.(null);
			setActiveTool(next);
		},
		[cancelMarquee, elementTarget, onSelectElement],
	);
	useStudioCanvasInput({
		canvasRef,
		setPan,
		cancelFocusAnimation,
		nudgePan,
		endPan,
		setTool: selectTool,
		setSpacePan,
		setIsPanning,
		onSelectFrame,
		cancelMarquee,
		hasActiveGesture,
	});

	return (
		<section
			ref={canvasRef}
			data-testid="studio-canvas"
			aria-label={`Canvas Desain ${project.title}`}
			onPointerDown={(event) => {
				if (elementTool) return;
				if (panMode) {
					if (isCanvasControlTarget(event.target)) return;
					if (startPan(event)) {
						cancelFocusAnimation();
						setIsPanning(true);
					}
					return;
				}
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
			onLostPointerCapture={() => {
				endPan();
				setIsPanning(false);
				cancelMarquee();
			}}
			className={`relative size-full overflow-hidden overscroll-none select-none touch-pinch-zoom bg-charcoal text-snow focus-visible:outline-2 focus-visible:outline-snow ${className}`}
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
							viewportRef={canvasRef}
							initialJobTiming={
								activeJob?.jobType === "initial" ? activeJob : undefined
							}
							onMeasure={measureFrame}
							isSelected={selectedIds.includes(frame.id)}
							onSelect={onSelectFrame}
							onRetry={onRetryFrame}
							isRetryPending={retryingFrameIds.includes(frame.id)}
							retryError={frameRetryErrors?.[frame.id]}
							isCanvasPanning={panMode}
							inspectElement={elementTool && editableFrameIds.has(frame.id)}
							elementTarget={
								elementTarget?.frameId === frame.id ? elementTarget : null
							}
							onSelectElement={onSelectElement}
							onElementAction={onElementAction}
							elementActionBusy={elementActionBusy}
							onElementError={onElementError}
							canvasZoom={zoom}
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
			{showFrameActions && (
				<StudioCanvasFrameActions
					canvasRef={canvasRef}
					frame={selectedFrame}
					frameIndex={selectedFrameIndex}
					bounds={bounds}
					zoom={zoom}
					pan={pan}
					leftInsetPx={leftInsetPx ?? 0}
					device={frameDevices?.[selectedFrame.id]}
					liveReady={liveReadyFrameIds.has(selectedFrame.id)}
					onDeviceChange={onFrameDeviceChange}
					onFocus={focusFrame}
					onRefresh={onRefreshFrame}
					onPreview={onOpenPreview}
				/>
			)}
			<StudioCanvasStatusOverlays
				inconsistent={lifecycle.inconsistent}
				activeJob={activeJob}
				leftInsetPx={leftInsetPx ?? 0}
				onRefreshStatus={onRefreshStatus}
			/>

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
				canSelectElement={editableFrameIds.size > 0 && Boolean(onSelectElement)}
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
