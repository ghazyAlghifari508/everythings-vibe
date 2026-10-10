import { memo, useRef } from "react";
import { ZoomControls } from "@/components/task/zoom-controls";
import { getCanvasDotStyle } from "@/components/task/whiteboard-canvas";
import type { StudioFrameRow, StudioProjectRow } from "@/db/schema";
import { useCanvasZoom } from "@/hooks/use-canvas-zoom";
import { StudioFrame } from "./studio-frame";

export interface StudioCanvasProps {
	project: StudioProjectRow;
	frames: StudioFrameRow[];
	selectedFrameId?: string | null;
	onSelectFrame?: (frameId: string | null) => void;
	onRetryFrame?: (frameId: string) => void;
	className?: string;
}

export const StudioCanvas = memo(function StudioCanvas({
	project,
	frames,
	selectedFrameId = null,
	onSelectFrame,
	onRetryFrame,
	className = "",
}: StudioCanvasProps) {
	const canvasRef = useRef<HTMLDivElement>(null);

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

	const isPanning = false; // Transient pointer tracking in hook

	return (
		<div
			ref={canvasRef}
			data-testid="studio-canvas"
			tabIndex={0}
			role="region"
			aria-label={`Canvas Desain ${project.title}`}
			onPointerDown={startPan}
			onPointerMove={updatePan}
			onPointerUp={endPan}
			onPointerCancel={endPan}
			onWheel={onWheel}
			onKeyDown={(e) => nudgePan(e.key)}
			onClick={(e) => {
				if (e.target === e.currentTarget) {
					onSelectFrame?.(null);
				}
			}}
			className={`relative size-full overflow-hidden select-none touch-none bg-[#0a0a0c] text-snow focus:outline-none ${className}`}
			style={getCanvasDotStyle(zoom, pan)}
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
							isSelected={selectedFrameId === frame.id}
							onSelect={(id) => onSelectFrame?.(id)}
							onRetry={(id) => onRetryFrame?.(id)}
							isCanvasPanning={isPanning}
						/>
					))
				) : (
					<div className="flex h-96 w-96 flex-col items-center justify-center rounded-2xl border border-dashed border-graphite bg-charcoal/50 p-8 text-center">
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
			<div className="fixed bottom-6 right-6 z-20">
				<ZoomControls
					zoom={zoom}
					onZoomIn={zoomIn}
					onZoomOut={zoomOut}
					onReset={resetZoom}
				/>
			</div>
		</div>
	);
});
