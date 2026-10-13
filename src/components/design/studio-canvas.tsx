import { AlertCircle, Hand, MousePointer2, RotateCcw } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { getCanvasDotStyle } from "@/components/task/whiteboard-canvas";
import { ZoomControls } from "@/components/task/zoom-controls";
import type {
	StudioFrameRow,
	StudioJobRow,
	StudioProjectRow,
} from "@/db/schema";
import { normalizeWheelDelta, useCanvasZoom } from "@/hooks/use-canvas-zoom";
import {
	STUDIO_CANVAS_COMPOSER_INSET_PX,
	STUDIO_CANVAS_FIT_PADDING_PX,
	STUDIO_CANVAS_FRAME_GAP_PX,
	STUDIO_CANVAS_FRAME_HEADER_PX,
	STUDIO_CANVAS_HEADER_INSET_PX,
	STUDIO_CANVAS_INITIAL_ZOOM,
	STUDIO_CANVAS_MAX_ZOOM,
	STUDIO_CANVAS_MIN_VISIBLE_PX,
	STUDIO_CANVAS_MIN_ZOOM,
	STUDIO_CANVAS_TOOLBAR_INSET_PX,
	STUDIO_VISUAL_FALLBACK_HEIGHT,
	STUDIO_VISUAL_WIDTH,
} from "@/lib/constants";
import { StudioFrame } from "./studio-frame";

export interface StudioCanvasProps {
	project: StudioProjectRow;
	frames: StudioFrameRow[];
	activeJob?: StudioJobRow | null;
	selectedFrameId?: string | null;
	selectedFrameIds?: string[];
	onSelectFrame?: (frameId: string | null, additive?: boolean) => void;
	onRetryFrame?: (frameId: string) => void;
	onRetryPlanning?: () => void;
	className?: string;
}

export interface StudioCanvasFrameBounds {
	width: number;
	height: number;
}

export interface StudioCanvasFitInput {
	bounds: StudioCanvasFrameBounds[];
	available: { width: number; height: number };
	minZoom: number;
	maxZoom: number;
}

/**
 * Pure fit-to-content math.
 *
 * It accounts for the real artboard sizes, the inter-frame gap, the track
 * padding, the floating header band, the floating composer band, and the
 * right-centre toolbar column, so a fit never parks content underneath an
 * overlay. Bounds are clamped to the canonical zoom limits.
 */
export function computeCanvasFit({
	bounds,
	available,
	minZoom,
	maxZoom,
}: StudioCanvasFitInput): { zoom: number; pan: { x: number; y: number } } {
	const count = bounds.length;
	if (!count) return { zoom: minZoom, pan: { x: 0, y: 0 } };
	const trackWidth =
		bounds.reduce((total, frame) => total + frame.width, 0) +
		(count - 1) * STUDIO_CANVAS_FRAME_GAP_PX +
		STUDIO_CANVAS_FIT_PADDING_PX;
	const trackHeight =
		Math.max(...bounds.map((frame) => frame.height)) +
		STUDIO_CANVAS_FRAME_HEADER_PX +
		STUDIO_CANVAS_FIT_PADDING_PX;
	// Overlays consume real viewport area: the header sits above the content
	// band and the composer sits below it, while the toolbar narrows the width.
	const usableWidth = Math.max(
		STUDIO_CANVAS_MIN_VISIBLE_PX,
		available.width - STUDIO_CANVAS_TOOLBAR_INSET_PX * 2,
	);
	const usableHeight = Math.max(
		STUDIO_CANVAS_MIN_VISIBLE_PX,
		available.height -
			STUDIO_CANVAS_HEADER_INSET_PX -
			STUDIO_CANVAS_COMPOSER_INSET_PX,
	);
	const zoom = Math.min(
		maxZoom,
		Math.max(
			minZoom,
			Math.min(usableWidth / trackWidth, usableHeight / trackHeight),
		),
	);
	// The track box carries symmetric padding, so centring the padded box also
	// centres the artboards: the leading padding shifts the content by exactly
	// the same amount that the trailing padding adds to the box.
	return {
		zoom,
		pan: {
			x: (available.width - trackWidth * zoom) / 2,
			y:
				STUDIO_CANVAS_HEADER_INSET_PX + (usableHeight - trackHeight * zoom) / 2,
		},
	};
}

export const StudioCanvas = memo(function StudioCanvas({
	project,
	frames,
	activeJob = null,
	selectedFrameId = null,
	selectedFrameIds = [],
	onSelectFrame,
	onRetryFrame,
	onRetryPlanning,
	className = "",
}: StudioCanvasProps) {
	const canvasRef = useRef<HTMLElement>(null);

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

	const [tool, setTool] = useState<"select" | "hand">("select");
	const [spacePan, setSpacePan] = useState(false);
	const [isPanning, setIsPanning] = useState(false);
	const panMode = tool === "hand" || spacePan;
	const dimensions = useRef(
		new Map<string, { width: number; height: number }>(),
	);
	const measureFrame = useCallback(
		(id: string, width: number, height: number) => {
			dimensions.current.set(id, { width, height });
		},
		[],
	);
	function fitCanvas() {
		if (!canvasRef.current || !frames.length) {
			resetZoom();
			return;
		}
		const bounds = frames.map(
			(frame) =>
				dimensions.current.get(frame.id) ?? {
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
			available: canvasRef.current.getBoundingClientRect(),
			minZoom,
			maxZoom,
		});
		setZoom(nextZoom);
		setPan(nextPan);
	}
	useEffect(() => {
		// Arrow-key panning is a window-level affordance because the canvas
		// surface is a non-interactive landmark and must not enter the tab
		// order. It stays inert while focus is inside a control or editable
		// field, so it never steals arrows from a menu, dialog or textarea.
		function isEditableTarget(target: EventTarget | null) {
			return (
				target instanceof Element &&
				target.closest(
					"input,textarea,select,button,a,[contenteditable=true],[role=menu],[role=menuitem],[role=dialog]",
				) !== null
			);
		}
		function keydown(event: KeyboardEvent) {
			if (isEditableTarget(event.target)) return;
			if (event.ctrlKey || event.metaKey || event.altKey) return;
			if (event.key.toLowerCase() === "v") setTool("select");
			if (event.key.toLowerCase() === "h") setTool("hand");
			if (event.key.startsWith("Arrow")) nudgePan(event.key);
			if (event.code === "Space") {
				event.preventDefault();
				setSpacePan(true);
			}
			if (event.key === "Escape") onSelectFrame?.(null);
		}
		function release(event: KeyboardEvent) {
			if (event.code === "Space") setSpacePan(false);
		}
		function blur() {
			setSpacePan(false);
			setIsPanning(false);
			endPan();
		}
		window.addEventListener("keydown", keydown);
		window.addEventListener("keyup", release);
		window.addEventListener("blur", blur);
		return () => {
			window.removeEventListener("keydown", keydown);
			window.removeEventListener("keyup", release);
			window.removeEventListener("blur", blur);
		};
	}, [onSelectFrame, endPan, nudgePan]);

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
				// Pressing empty canvas clears the selection. Frames and
				// floating controls are excluded so their own handlers win.
				if (
					event.target instanceof Element &&
					!event.target.closest("article,button")
				) {
					onSelectFrame?.(null);
				}
			}}
			onPointerMove={updatePan}
			onPointerUp={() => {
				endPan();
				setIsPanning(false);
			}}
			onPointerCancel={() => {
				endPan();
				setIsPanning(false);
			}}
			// Pointer capture can be revoked mid-drag (element removal, OS
			// gesture, focus loss). Without this the canvas would keep panning
			// on the next move and stay stuck in the grabbing cursor.
			onLostPointerCapture={() => {
				endPan();
				setIsPanning(false);
			}}
			onWheel={(event) => {
				if (event.ctrlKey || event.metaKey) onWheel(event);
				else
					setPan((previous) => {
						const deltaX = normalizeWheelDelta({
							deltaY: event.deltaX,
							deltaMode: event.deltaMode,
						});
						const deltaY = normalizeWheelDelta(event);
						// Two-axis trackpad scrolling pans the board; it must not
						// change the scale, which is reserved for ctrl/pinch.
						return { x: previous.x - deltaX, y: previous.y - deltaY };
					});
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
							onSelect={(id, additive) => {
								if (!panMode) onSelectFrame?.(id, additive);
							}}
							onRetry={(id) => onRetryFrame?.(id)}
							isCanvasPanning={panMode}
						/>
					))
				) : activeJob?.status === "failed" ? (
					// Planning failed: the canvas stays clean and the recovery
					// action sits inside the canvas surface itself.
					<div className="flex w-80 flex-col items-start gap-3 rounded-xl border border-graphite bg-obsidian p-5 text-left">
						<div className="flex items-center gap-2">
							<AlertCircle size={16} className="text-crimson" aria-hidden />
							<p className="text-sm font-semibold text-snow">
								Perencanaan layar gagal
							</p>
						</div>
						<p className="text-xs leading-5 text-fog">
							{activeJob?.error ||
								"AI tidak dapat menyusun rencana layar untuk topik ini."}
						</p>
						{onRetryPlanning && (
							<button
								type="button"
								onClick={onRetryPlanning}
								className="inline-flex items-center gap-1.5 rounded-lg border border-graphite bg-charcoal px-3 py-1.5 text-xs font-semibold text-snow transition-colors hover:bg-steel"
							>
								<RotateCcw size={13} aria-hidden />
								<span>Coba lagi</span>
							</button>
						)}
					</div>
				) : null}
			</div>

			{/* Understated, factual state readout: derived only from persisted job
			    status, never from a timer or an invented stage sequence. Kept in
			    the bottom-left corner, clear of the composer and zoom controls. */}
			{frames.length === 0 && activeJob?.status === "planning" && (
				<p className="pointer-events-none absolute bottom-3 left-3 z-20 rounded-full border border-graphite bg-obsidian px-3 py-1 text-[11px] text-fog">
					Menyusun rencana layar
				</p>
			)}

			{/* Floating tool palette: compact vertical toolbar on the right edge,
			    vertically centred so it never overlaps the composer or the zoom
			    controls at the bottom corner. */}
			<div
				className="absolute top-1/2 right-3 z-20 flex -translate-y-1/2 flex-col gap-1 rounded-lg border border-iron bg-obsidian p-1"
				onPointerDown={(event) => event.stopPropagation()}
			>
				<button
					type="button"
					title="Cursor (V)"
					aria-label="Cursor"
					aria-pressed={tool === "select"}
					onClick={() => setTool("select")}
					className={`flex size-10 items-center justify-center rounded-md text-snow focus-visible:outline-2 focus-visible:outline-snow ${tool === "select" ? "bg-steel" : "hover:bg-steel"}`}
				>
					<MousePointer2 size={18} aria-hidden />
				</button>
				<button
					type="button"
					title="Hand (H)"
					aria-label="Hand"
					aria-pressed={tool === "hand"}
					onClick={() => setTool("hand")}
					className={`flex size-10 items-center justify-center rounded-md text-snow focus-visible:outline-2 focus-visible:outline-snow ${tool === "hand" ? "bg-steel" : "hover:bg-steel"}`}
				>
					<Hand size={18} aria-hidden />
				</button>
			</div>

			{/* Zoom controls live in the bottom-right corner, clear of the
			    right-centre toolbar and the bottom-centre composer. The reset
			    action fits every real artboard into the visible band, so its
			    accessible name describes that behaviour. */}
			<div className="absolute right-3 bottom-3 z-20">
				<ZoomControls
					zoom={zoom}
					onZoomIn={zoomIn}
					onZoomOut={zoomOut}
					onReset={fitCanvas}
					resetLabel="Sesuaikan tampilan"
				/>
			</div>
		</section>
	);
});
