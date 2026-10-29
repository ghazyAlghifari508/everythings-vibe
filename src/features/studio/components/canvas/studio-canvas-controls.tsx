import {
	AlertCircleIcon,
	Cursor01Icon,
	HandIcon,
	RotateLeft01Icon,
} from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { ZoomControls } from "@/components/ui/zoom-controls";
import type { StudioJobRow } from "@/db/schema";
import { resolveStudioQueueHealth } from "@/features/studio/types/studio-status";
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
				title="Pilih frame (V)"
				aria-label="Pilih frame (V)"
				aria-pressed={tool === "select"}
				onClick={() => onSelectTool("select")}
				className={`flex size-10 items-center justify-center rounded-md text-snow focus-visible:outline-2 focus-visible:outline-snow ${tool === "select" ? "bg-steel" : "hover:bg-steel"}`}
			>
				<Icon icon={Cursor01Icon} size={18} />
			</button>
			<button
				type="button"
				title="Geser canvas (H)"
				aria-label="Geser canvas (H)"
				aria-pressed={tool === "hand"}
				onClick={() => onSelectTool("hand")}
				className={`flex size-10 items-center justify-center rounded-md text-snow focus-visible:outline-2 focus-visible:outline-snow ${tool === "hand" ? "bg-steel" : "hover:bg-steel"}`}
			>
				<Icon icon={HandIcon} size={18} />
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
				resetLabel="Tampilkan semua frame"
			/>
		</div>
	);
}

/**
 * Understated, factual state readout: derived only from persisted job status,
 * never from a timer or an invented stage sequence. Kept in the bottom-left
 * corner, clear of the composer and zoom controls.
 */
function StudioCanvasPlanningStatus({ label }: { label: string }) {
	return (
		<p
			className="pointer-events-none absolute left-3 z-20 max-w-md rounded-full border border-graphite bg-obsidian px-3 py-1 text-xs text-fog"
			style={{ bottom: canvasZoomRowBottomCss() }}
		>
			{label}
		</p>
	);
}

interface StudioCanvasQueueReadoutProps {
	activeJob: StudioJobRow;
	hasFrames: boolean;
}

/**
 * The job readout: names a stalled queue so an empty or late canvas is never
 * mistaken for steady work. Silent while a worker holds a live lease, and while
 * frames already carry their own shimmer.
 */
export function StudioCanvasQueueReadout({
	activeJob,
	hasFrames,
}: StudioCanvasQueueReadoutProps) {
	const queueHealth = resolveStudioQueueHealth(activeJob);
	if (queueHealth) return <StudioCanvasPlanningStatus label={queueHealth} />;
	if (
		hasFrames ||
		(activeJob.status !== "queued" && activeJob.status !== "planning")
	)
		return null;
	return (
		<StudioCanvasPlanningStatus
			label={
				activeJob.status === "queued"
					? "Menunggu antrean generate"
					: "Menyusun rencana layar"
			}
		/>
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
				<Icon icon={AlertCircleIcon} size={16} className="text-crimson" />
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
					<Icon icon={RotateLeft01Icon} size={13} />
					<span>Coba lagi</span>
				</button>
			)}
		</div>
	);
}
