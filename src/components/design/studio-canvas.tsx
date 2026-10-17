import { AlertCircle, Hand, MousePointer2, RotateCcw } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { getCanvasDotStyle } from "@/components/task/whiteboard-canvas";
import { ZoomControls } from "@/components/ui/zoom-controls";
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
	STUDIO_CANVAS_MARQUEE_DRAG_THRESHOLD_PX,
	STUDIO_CANVAS_MAX_ZOOM,
	STUDIO_CANVAS_MIN_VISIBLE_PX,
	STUDIO_CANVAS_MIN_ZOOM,
	STUDIO_CANVAS_TOOLBAR_INSET_PX,
	STUDIO_VISUAL_FALLBACK_HEIGHT,
	STUDIO_VISUAL_WIDTH,
} from "@/lib/constants";
import { canvasZoomRowBottomCss } from "./studio-canvas-layout";
import {
	exceedsDragThreshold,
	isMarqueeIgnoredTarget,
	type MarqueeFrameBounds,
	normalizeRect,
	type Point,
	type Rect,
	resolveMarqueeSelection,
} from "./studio-canvas-marquee";
import { StudioFrame } from "./studio-frame";

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

	const [tool, setTool] = useState<"select" | "hand">("select");
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

	// Latest selection and commit handler for the marquee gesture, read through
	// refs so the pointer handlers stay stable and never re-render the frames.
	const selectedFrameIdsRef = useRef(selectedFrameIds);
	selectedFrameIdsRef.current = selectedFrameIds;
	const selectFramesRef = useRef(onSelectFrames);
	selectFramesRef.current = onSelectFrames;

	/**
	 * Transient marquee gesture state.
	 *
	 * The rectangle is painted by mutating one absolutely positioned node's
	 * style directly, so a drag produces at most one React render (when the
	 * intersected frame set actually changes) instead of one per pointermove.
	 * `active` flips true once the drag passes the threshold; `base` is the
	 * selection captured at press time so additive and cancel both have a stable
	 * origin.
	 */
	const marqueeGestureRef = useRef<{
		pointerId: number;
		start: Point;
		base: string[];
		additive: boolean;
		active: boolean;
		previewKey: string;
	} | null>(null);

	const paintMarquee = useCallback((rect: Rect | null) => {
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
	}, []);

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
	}, []);

	/**
	 * Cancels an in-progress marquee and restores the selection captured at
	 * press time. Used by Escape, window blur, pointer cancel, lost capture,
	 * tool switching and unmount so the rectangle never sticks and a preview is
	 * never left half-committed.
	 */
	const cancelMarquee = useCallback(() => {
		const gesture = marqueeGestureRef.current;
		marqueeGestureRef.current = null;
		paintMarquee(null);
		if (gesture?.active) {
			const base = gesture.base;
			selectFramesRef.current?.(base);
		}
	}, [paintMarquee]);

	/** Drops the gesture and rectangle without touching the route selection. */
	const abortMarquee = useCallback(() => {
		marqueeGestureRef.current = null;
		paintMarquee(null);
	}, [paintMarquee]);

	/** Commits the current preview selection and hides the rectangle. */
	const commitMarquee = useCallback(() => {
		marqueeGestureRef.current = null;
		paintMarquee(null);
	}, [paintMarquee]);

	const handleCanvasPointerDown = useCallback((event: React.PointerEvent) => {
		const canvas = canvasRef.current;
		if (!canvas || event.button !== 0) return;
		// A frame, control, field, menu or dialog owns its own gesture.
		if (isMarqueeIgnoredTarget(event.target)) return;
		const rect = canvas.getBoundingClientRect();
		const start: Point = {
			x: event.clientX - rect.left,
			y: event.clientY - rect.top,
		};
		marqueeGestureRef.current = {
			pointerId: event.pointerId,
			start,
			base: selectedFrameIdsRef.current,
			additive: event.shiftKey,
			active: false,
			previewKey: "",
		};
		event.currentTarget.setPointerCapture?.(event.pointerId);
	}, []);

	const handleCanvasPointerMove = useCallback(
		(event: React.PointerEvent) => {
			const gesture = marqueeGestureRef.current;
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
		[measureFrameBounds, paintMarquee],
	);

	const handleCanvasPointerUp = useCallback(
		(event: React.PointerEvent) => {
			const gesture = marqueeGestureRef.current;
			if (!gesture || gesture.pointerId !== event.pointerId) return;
			if (gesture.active) {
				// The preview already equals the committed set; keep it.
				commitMarquee();
				return;
			}
			// A press with no drag is a click: on empty canvas it clears the
			// selection, while shift keeps the current selection intact.
			marqueeGestureRef.current = null;
			if (!gesture.additive) selectFramesRef.current?.([]);
		},
		[commitMarquee],
	);

	// Leaving select mode (hand tool or space-pan) abandons any in-progress
	// marquee so a pan can never inherit a half-drawn selection rectangle.
	useEffect(() => {
		if (!panMode) return;
		cancelMarquee();
	}, [panMode, cancelMarquee]);

	// Unmount must drop the gesture and its rectangle: a removed canvas can
	// neither paint nor commit a selection afterwards.
	useEffect(() => abortMarquee, [abortMarquee]);

	/**
	 * Wheel handling must be a non-passive native listener.
	 *
	 * React attaches `wheel` passively, so a Ctrl/Cmd + wheel gesture cannot be
	 * prevented and the browser applies its own page zoom on top of the canvas
	 * zoom. Registering the listener with `{ passive: false }` keeps the
	 * gesture inside the canvas and lets the pointer-anchored zoom work as
	 * intended, while plain two-axis scrolling still pans.
	 */
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		function handleWheel(event: WheelEvent) {
			userPositioned.current = true;
			if (event.ctrlKey || event.metaKey) {
				event.preventDefault();
				onWheel(event);
				return;
			}
			event.preventDefault();
			const deltaX = normalizeWheelDelta({
				deltaY: event.deltaX,
				deltaMode: event.deltaMode,
			});
			const deltaY = normalizeWheelDelta(event);
			// Two-axis trackpad scrolling pans the board; it must not change
			// the scale, which is reserved for ctrl/pinch.
			setPan((previous) => ({
				x: previous.x - deltaX,
				y: previous.y - deltaY,
			}));
		}
		canvas.addEventListener("wheel", handleWheel, { passive: false });
		return () => canvas.removeEventListener("wheel", handleWheel);
	}, [onWheel, setPan]);
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
			if (event.key.toLowerCase() === "v") {
				cancelMarquee();
				setTool("select");
			}
			if (event.key.toLowerCase() === "h") {
				cancelMarquee();
				setTool("hand");
			}
			if (event.key.startsWith("Arrow")) nudgePan(event.key);
			if (event.code === "Space") {
				event.preventDefault();
				setSpacePan(true);
			}
			if (event.key === "Escape") {
				// Escape first cancels an in-progress marquee (restoring the
				// selection it started from); otherwise it clears the selection.
				if (marqueeGestureRef.current) cancelMarquee();
				else onSelectFrame?.(null);
			}
		}
		function release(event: KeyboardEvent) {
			if (event.code === "Space") setSpacePan(false);
		}
		function blur() {
			setSpacePan(false);
			setIsPanning(false);
			endPan();
			// A lost window focus must not leave a drag preview half-committed.
			cancelMarquee();
		}
		window.addEventListener("keydown", keydown);
		window.addEventListener("keyup", release);
		window.addEventListener("blur", blur);
		return () => {
			window.removeEventListener("keydown", keydown);
			window.removeEventListener("keyup", release);
			window.removeEventListener("blur", blur);
		};
	}, [onSelectFrame, endPan, nudgePan, cancelMarquee]);

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
				<p
					className="pointer-events-none absolute left-3 z-20 rounded-full border border-graphite bg-obsidian px-3 py-1 text-xs text-fog"
					style={{ bottom: canvasZoomRowBottomCss() }}
				>
					Menyusun rencana layar
				</p>
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
					onClick={() => {
						cancelMarquee();
						setTool("select");
					}}
					className={`flex size-10 items-center justify-center rounded-md text-snow focus-visible:outline-2 focus-visible:outline-snow ${tool === "select" ? "bg-steel" : "hover:bg-steel"}`}
				>
					<MousePointer2 size={18} aria-hidden />
				</button>
				<button
					type="button"
					title="Hand (H)"
					aria-label="Hand"
					aria-pressed={tool === "hand"}
					onClick={() => {
						cancelMarquee();
						setTool("hand");
					}}
					className={`flex size-10 items-center justify-center rounded-md text-snow focus-visible:outline-2 focus-visible:outline-snow ${tool === "hand" ? "bg-steel" : "hover:bg-steel"}`}
				>
					<Hand size={18} aria-hidden />
				</button>
			</div>

			{/* Zoom controls live in the bottom-right corner, clear of the
			    right-centre toolbar and the bottom-centre composer. The reset
			    action fits every real artboard into the visible band, so its
			    accessible name describes that behaviour. */}
			<div
				className="absolute right-3 z-20"
				style={{ bottom: canvasZoomRowBottomCss() }}
			>
				<ZoomControls
					zoom={zoom}
					onZoomIn={zoomInByUser}
					onZoomOut={zoomOutByUser}
					onReset={fitCanvas}
					resetLabel="Sesuaikan tampilan"
				/>
			</div>
		</section>
	);
});
