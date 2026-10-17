import { AlertCircle, Hand, MousePointer2, RotateCcw } from "lucide-react";
import { ZoomControls } from "@/components/ui/zoom-controls";
import { canvasZoomRowBottomCss } from "@/features/studio/utils/studio-canvas-layout";

export type StudioCanvasTool = "select" | "hand";

interface StudioCanvasToolPaletteProps {
	tool: StudioCanvasTool;
	onSelectTool: (tool: StudioCanvasTool) => void;
}

/**
 * Floating tool palette: compact vertical toolbar on the right edge,
 * vertically centred so it never overlaps the composer or the zoom controls at
 * the bottom corner.
 */
export function StudioCanvasToolPalette({
	tool,
	onSelectTool,
}: StudioCanvasToolPaletteProps) {
	return (
		<div
			className="absolute top-1/2 right-3 z-20 flex -translate-y-1/2 flex-col gap-1 rounded-lg border border-iron bg-obsidian p-1"
			onPointerDown={(event) => event.stopPropagation()}
		>
			<button
				type="button"
				title="Cursor (V)"
				aria-label="Cursor"
				aria-pressed={tool === "select"}
				onClick={() => onSelectTool("select")}
				className={`flex size-10 items-center justify-center rounded-md text-snow focus-visible:outline-2 focus-visible:outline-snow ${tool === "select" ? "bg-steel" : "hover:bg-steel"}`}
			>
				<MousePointer2 size={18} aria-hidden />
			</button>
			<button
				type="button"
				title="Hand (H)"
				aria-label="Hand"
				aria-pressed={tool === "hand"}
				onClick={() => onSelectTool("hand")}
				className={`flex size-10 items-center justify-center rounded-md text-snow focus-visible:outline-2 focus-visible:outline-snow ${tool === "hand" ? "bg-steel" : "hover:bg-steel"}`}
			>
				<Hand size={18} aria-hidden />
			</button>
		</div>
	);
}

interface StudioCanvasZoomCornerProps {
	zoom: number;
	onZoomIn: () => void;
	onZoomOut: () => void;
	onFit: () => void;
}

/**
 * Zoom controls live in the bottom-right corner, clear of the right-centre
 * toolbar and the bottom-centre composer. The reset action fits every real
 * artboard into the visible band, so its accessible name describes that
 * behaviour.
 */
export function StudioCanvasZoomCorner({
	zoom,
	onZoomIn,
	onZoomOut,
	onFit,
}: StudioCanvasZoomCornerProps) {
	return (
		<div
			className="absolute right-3 z-20"
			style={{ bottom: canvasZoomRowBottomCss() }}
		>
			<ZoomControls
				zoom={zoom}
				onZoomIn={onZoomIn}
				onZoomOut={onZoomOut}
				onReset={onFit}
				resetLabel="Sesuaikan tampilan"
			/>
		</div>
	);
}

/**
 * Understated, factual state readout: derived only from persisted job status,
 * never from a timer or an invented stage sequence. Kept in the bottom-left
 * corner, clear of the composer and zoom controls.
 */
export function StudioCanvasPlanningStatus() {
	return (
		<p
			className="pointer-events-none absolute left-3 z-20 rounded-full border border-graphite bg-obsidian px-3 py-1 text-xs text-fog"
			style={{ bottom: canvasZoomRowBottomCss() }}
		>
			Menyusun rencana layar
		</p>
	);
}

interface StudioCanvasPlanningFailureProps {
	error?: string | null;
	onRetryPlanning?: () => void;
}

/**
 * Planning failed: the canvas stays clean and the recovery action sits inside
 * the canvas surface itself.
 */
export function StudioCanvasPlanningFailure({
	error,
	onRetryPlanning,
}: StudioCanvasPlanningFailureProps) {
	return (
		<div className="flex w-80 flex-col items-start gap-3 rounded-xl border border-graphite bg-obsidian p-5 text-left">
			<div className="flex items-center gap-2">
				<AlertCircle size={16} className="text-crimson" aria-hidden />
				<p className="text-sm font-semibold text-snow">
					Perencanaan layar gagal
				</p>
			</div>
			<p className="text-xs leading-5 text-fog">
				{error || "AI tidak dapat menyusun rencana layar untuk topik ini."}
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
	);
}
