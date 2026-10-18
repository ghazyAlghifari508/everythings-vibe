import {
	AlertCircle,
	Loader2,
	Monitor,
	RotateCcw,
	Smartphone,
} from "lucide-react";
import { memo } from "react";
import type { StudioFrameRow } from "@/db/schema";
import { StudioFrameShimmer } from "@/features/studio/components/canvas/studio-frame-shimmer";
import { useStudioFrameVisual } from "@/features/studio/hooks/use-studio-frame-visual";
import { STUDIO_VISUAL_WIDTH } from "@/features/studio/types/studio-constants";
import { extractCleanHtml } from "@/features/studio/utils/clean-html";
import { resolveFrameArtboardMode } from "@/features/studio/utils/studio-frame-artboard";

export type { StudioFrameArtboardMode } from "@/features/studio/utils/studio-frame-artboard";
export {
	isFrameVisualPending,
	resolveFrameArtboardMode,
} from "@/features/studio/utils/studio-frame-artboard";

export interface StudioFrameProps {
	frame: StudioFrameRow;
	isSelected?: boolean;
	onSelect?: (frameId: string, additive?: boolean) => void;
	onRetry?: (frameId: string) => void;
	isCanvasPanning?: boolean;
	className?: string;
	onMeasure?: (id: string, width: number, height: number) => void;
}

/**
 * The frame header carries the screen name, a small platform icon and at most
 * one restrained status affordance: a spinner while the frame is actively
 * generating, a quiet static dot while it waits in the queue, and a small
 * error affordance when generation failed. Queued and generating stay
 * distinguishable for assistive technology through their text alternatives.
 *
 * Memoized: status polling replaces the frame array every tick, so without a
 * stable render boundary every artboard would re-render (and re-run its HTML
 * extraction) on each poll and on every pan frame.
 */
export const StudioFrame = memo(function StudioFrame({
	frame,
	isSelected = false,
	onSelect,
	onRetry,
	isCanvasPanning = false,
	className = "",
	onMeasure,
}: StudioFrameProps) {
	const isMobile = frame.viewport === "mobile";
	const frameWidth = isMobile
		? STUDIO_VISUAL_WIDTH.mobile
		: STUDIO_VISUAL_WIDTH.web;
	const {
		visual,
		visualError,
		setVisualError,
		retryVisual,
		artboardRef,
		frameHeight,
	} = useStudioFrameVisual({ frame, isMobile, onMeasure });

	const cleanHtml = frame.htmlCode ? extractCleanHtml(frame.htmlCode) : "";
	// A ready frame whose HTML is missing or empty cannot produce a preview.
	// Reporting that state is what keeps the artboard from shimmering forever
	// with no explanation and no recovery action.
	const hasRenderableHtml = cleanHtml.length > 0;
	const artboardMode = resolveFrameArtboardMode({
		status: frame.status,
		hasRenderableHtml,
		hasVisual: visual !== null,
		hasVisualError: Boolean(visualError),
	});

	return (
		<article
			ref={artboardRef}
			data-frame-id={frame.id}
			aria-label={`Frame ${frame.name}`}
			className={`flex flex-col gap-2 select-none ${className}`}
		>
			{/* Frame Title Bar */}
			<div className="flex items-center justify-between gap-2 px-1">
				<div className="flex min-w-0 items-center gap-2">
					<button
						type="button"
						onClick={(event) => {
							if (!isCanvasPanning) onSelect?.(frame.id, event.shiftKey);
						}}
						className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-snow hover:text-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-snow"
					>
						{isMobile ? (
							<Smartphone size={13} className="text-fog" aria-hidden />
						) : (
							<Monitor size={13} className="text-fog" aria-hidden />
						)}
						<span className="truncate">{frame.name}</span>
					</button>

					{frame.status === "generating" ? (
						<Loader2
							size={13}
							role="status"
							aria-label="Sedang digenerate"
							className="shrink-0 text-fog motion-safe:animate-spin"
						/>
					) : null}
					{frame.status === "queued" ? (
						<output
							aria-label="Menunggu antrean"
							className="block size-1.5 shrink-0 rounded-full bg-fog"
						/>
					) : null}
					{frame.status === "failed" ? (
						<AlertCircle
							size={13}
							role="img"
							aria-label="Generate gagal"
							className="shrink-0 text-crimson"
						/>
					) : null}
				</div>

				{frame.status === "failed" && onRetry ? (
					<button
						type="button"
						onClick={(event) => {
							event.stopPropagation();
							onRetry(frame.id);
						}}
						aria-label={`Coba lagi generate ${frame.name}`}
						title={`Coba lagi generate ${frame.name}`}
						className="inline-flex shrink-0 items-center gap-1 rounded-md border border-crimson/40 px-1.5 py-0.5 text-xs font-medium text-crimson transition-colors hover:bg-crimson/10"
					>
						<RotateCcw size={11} aria-hidden />
						<span>Coba lagi</span>
					</button>
				) : null}
			</div>

			{/* Frame Content Box */}
			<div
				className={`relative overflow-hidden ${
					isMobile ? "rounded-lg" : "rounded-xl"
				} border ${
					isSelected
						? "border-blue-600 outline-2 outline-offset-2 outline-blue-600"
						: "border-graphite hover:border-steel"
				} bg-obsidian`}
				style={{ width: visual?.width ?? frameWidth, height: frameHeight }}
			>
				{artboardMode === "preview" && visual ? (
					<button
						type="button"
						aria-label={`Pilih frame ${frame.name}`}
						aria-pressed={isSelected}
						onClick={(event) => {
							if (!isCanvasPanning) onSelect?.(frame.id, event.shiftKey);
						}}
						className="block size-full focus-visible:outline-2 focus-visible:outline-snow"
					>
						<img
							src={visual.url}
							width={visual.width}
							height={visual.height}
							alt={`Desain ${frame.name}`}
							draggable={false}
							decoding="async"
							className="size-full object-contain pointer-events-none"
							onError={() => setVisualError("Gambar frame gagal dimuat.")}
						/>
					</button>
				) : artboardMode === "visual-error" ? (
					<div className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-fog">
						<p role="alert">{visualError}</p>
						<button
							type="button"
							onClick={retryVisual}
							className="rounded-lg border border-iron px-3 py-2 text-snow"
						>
							Coba lagi visual
						</button>
					</div>
				) : artboardMode === "generation-failed" ? (
					<div className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center">
						<AlertCircle size={20} className="text-crimson" aria-hidden />
						<div className="space-y-1">
							<p className="text-sm font-semibold text-snow">
								Gagal menggenerate layar
							</p>
							<p className="max-w-xs text-xs text-fog">
								{frame.error || "Terjadi kesalahan saat memproses prompt."}
							</p>
						</div>
						{onRetry ? (
							<button
								type="button"
								onClick={(event) => {
									event.stopPropagation();
									onRetry(frame.id);
								}}
								className="inline-flex items-center gap-1.5 rounded-lg border border-graphite bg-charcoal px-4 py-1.5 text-xs font-semibold text-snow hover:bg-onyx"
							>
								<RotateCcw size={13} aria-hidden />
								<span>Coba lagi</span>
							</button>
						) : null}
					</div>
				) : artboardMode === "preview-unavailable" ? (
					// Ready but no renderable HTML: a real terminal failure, never
					// an endless shimmer.
					<div className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center">
						<AlertCircle size={20} className="text-crimson" aria-hidden />
						<div className="space-y-1">
							<p className="text-sm font-semibold text-snow">
								Pratinjau tidak tersedia
							</p>
							<p className="max-w-xs text-xs text-fog">
								HTML layar ini tidak tersimpan, jadi pratinjau tidak bisa
								ditampilkan.
							</p>
						</div>
						{onRetry ? (
							<button
								type="button"
								onClick={(event) => {
									event.stopPropagation();
									onRetry(frame.id);
								}}
								className="inline-flex items-center gap-1.5 rounded-lg border border-graphite bg-charcoal px-4 py-1.5 text-xs font-semibold text-snow hover:bg-onyx"
							>
								<RotateCcw size={13} aria-hidden />
								<span>Generate ulang</span>
							</button>
						) : null}
					</div>
				) : (
					<StudioFrameShimmer viewport={frame.viewport} status={frame.status} />
				)}
			</div>
		</article>
	);
});
