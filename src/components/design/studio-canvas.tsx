import { AlertCircle, Hand, MousePointer2, RotateCcw } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { getCanvasDotStyle } from "@/components/task/whiteboard-canvas";
import { ZoomControls } from "@/components/task/zoom-controls";
import type {
	StudioFrameRow,
	StudioJobRow,
	StudioProjectRow,
} from "@/db/schema";
import { useCanvasZoom } from "@/hooks/use-canvas-zoom";
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
	} = useCanvasZoom({
		minZoom: 0.05,
		maxZoom: 2.0,
		initialZoom: project.designMode === "mobile" ? 0.9 : 0.65,
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
					width: frame.viewport === "mobile" ? 390 : 1440,
					height: 750,
				},
		);
		const width =
			bounds.reduce((total, frame) => total + frame.width, 0) +
			(bounds.length - 1) * 56 +
			192;
		const height = Math.max(...bounds.map((frame) => frame.height)) + 192;
		const available = canvasRef.current.getBoundingClientRect();
		const nextZoom = Math.max(
			0.05,
			Math.min(
				2,
				Math.min(
					available.width / width,
					Math.max(100, available.height - 220) / height,
				),
			),
		);
		setZoom(nextZoom);
		setPan({ x: (available.width - width * nextZoom) / 2, y: 60 });
	}
	useEffect(() => {
		function keydown(event: KeyboardEvent) {
			if (
				event.target instanceof Element &&
				event.target.closest(
					"input,textarea,select,[contenteditable=true],[role=menu],[role=dialog]",
				)
			)
				return;
			if (event.ctrlKey || event.metaKey || event.altKey) return;
			if (event.key.toLowerCase() === "v") setTool("select");
			if (event.key.toLowerCase() === "h") setTool("hand");
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
	}, [onSelectFrame, endPan]);

	return (
		<section
			ref={canvasRef}
			data-testid="studio-canvas"
			aria-label={`Canvas Desain ${project.title}`}
			onPointerDown={(event) => {
				if (panMode) {
					startPan(event);
					setIsPanning(true);
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
			onWheel={(event) => {
				if (event.ctrlKey || event.metaKey) onWheel(event);
				else
					setPan((previous) => ({
						x: previous.x - event.deltaX,
						y: previous.y - event.deltaY,
					}));
			}}
			onKeyDown={(e) => nudgePan(e.key)}
			onClick={(e) => {
				if (
					!panMode &&
					e.target instanceof Element &&
					!e.target.closest("article,button")
				) {
					onSelectFrame?.(null);
				}
			}}
			className={`relative size-full overflow-hidden select-none touch-none bg-charcoal text-snow focus-visible:outline-2 focus-visible:outline-snow ${className}`}
			style={{
				...getCanvasDotStyle(zoom, pan),
				cursor: panMode ? (isPanning ? "grabbing" : "grab") : "default",
			}}
		>
			{/* Transformed Canvas Surface holding frames */}
			<div
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
			    status, never from a timer or an invented stage sequence. */}
			{frames.length === 0 && activeJob?.status === "planning" && (
				<p className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full border border-graphite bg-obsidian px-3 py-1 text-[11px] text-fog">
					Menyusun rencana layar
				</p>
			)}

			{/* Floating Canvas Zoom Controls (Bottom Right) */}
			<div
				className="absolute top-4 left-3 z-20 flex gap-1 rounded-lg border border-iron bg-obsidian p-1"
				onPointerDown={(event) => event.stopPropagation()}
			>
				<button
					type="button"
					title="Cursor (V)"
					aria-label="Cursor"
					aria-pressed={tool === "select"}
					onClick={() => setTool("select")}
					className={`flex size-10 items-center justify-center rounded-md text-snow focus-visible:outline-2 ${tool === "select" ? "bg-steel" : "hover:bg-steel"}`}
				>
					<MousePointer2 size={18} />
				</button>
				<button
					type="button"
					title="Hand (H)"
					aria-label="Hand"
					aria-pressed={tool === "hand"}
					onClick={() => setTool("hand")}
					className={`flex size-10 items-center justify-center rounded-md text-snow focus-visible:outline-2 ${tool === "hand" ? "bg-steel" : "hover:bg-steel"}`}
				>
					<Hand size={18} />
				</button>
			</div>
			<div className="absolute top-4 right-3 z-20">
				<ZoomControls
					zoom={zoom}
					onZoomIn={zoomIn}
					onZoomOut={zoomOut}
					onReset={fitCanvas}
				/>
			</div>
		</section>
	);
});
