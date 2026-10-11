import {
	AlertCircle,
	Hand,
	Loader2,
	MousePointer2,
	RotateCcw,
} from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
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
		zoomIn,
		zoomOut,
		resetZoom,
		startPan,
		updatePan,
		endPan,
		nudgePan,
		onWheel,
	} = useCanvasZoom({
		minZoom: 0.25,
		maxZoom: 2.0,
		initialZoom: project.designMode === "mobile" ? 0.9 : 0.65,
	});

	const [tool, setTool] = useState<"select" | "hand">("select");
	const [spacePan, setSpacePan] = useState(false);
	const [isPanning, setIsPanning] = useState(false);
	const panMode = tool === "hand" || spacePan;
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
			onWheel={onWheel}
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
							isSelected={
								selectedFrameIds.includes(frame.id) ||
								selectedFrameId === frame.id
							}
							onSelect={(id, additive) => {
								if (!panMode) onSelectFrame?.(id, additive);
							}}
							onRetry={(id) => onRetryFrame?.(id)}
							isCanvasPanning={panMode}
						/>
					))
				) : activeJob?.status === "failed" ? (
					<div className="flex h-96 w-96 flex-col items-center justify-center rounded-2xl border border-dashed border-red-500/40 bg-charcoal/60 p-8 text-center gap-3">
						<div className="flex size-10 items-center justify-center rounded-full bg-red-500/10 text-red-400">
							<AlertCircle size={20} />
						</div>
						<div className="space-y-1">
							<p className="text-sm font-semibold text-snow">
								Perencanaan Layar Gagal
							</p>
							<p className="text-xs text-fog max-w-xs">
								{activeJob?.error ||
									"AI tidak dapat menyusun rencana layar untuk topik ini."}
							</p>
						</div>
						{onRetryPlanning && (
							<button
								type="button"
								onClick={onRetryPlanning}
								className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-graphite bg-onyx px-4 py-1.5 text-xs font-semibold text-snow hover:bg-charcoal transition-colors cursor-pointer"
							>
								<RotateCcw size={13} />
								<span>Coba Lagi Perencanaan</span>
							</button>
						)}
					</div>
				) : (
					<div className="flex h-96 w-96 flex-col items-center justify-center rounded-2xl border border-dashed border-graphite bg-charcoal/50 p-8 text-center gap-2">
						<Loader2 size={24} className="animate-spin text-indigo-400" />
						<p className="text-sm font-semibold text-snow">
							Menyiapkan Kanvas...
						</p>
						<p className="mt-1 text-xs text-fog">
							Layar sedang direncanakan oleh AI.
						</p>
					</div>
				)}
			</div>

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
					onReset={resetZoom}
				/>
			</div>
		</section>
	);
});
