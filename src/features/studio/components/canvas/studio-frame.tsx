import {
	AlertCircleIcon,
	ComputerIcon,
	Loading03Icon,
	SmartPhone01Icon,
} from "@hugeicons/core-free-icons";
import { memo, useRef } from "react";
import { Icon } from "@/components/ui/icon";
import type { StudioFrameRow } from "@/db/schema";
import {
	StudioFrameErrorPanel,
	StudioFrameStatusStrip,
} from "@/features/studio/components/canvas/studio-frame-error";
import { StudioFrameShimmer } from "@/features/studio/components/canvas/studio-frame-shimmer";
import { useStudioFrameVisual } from "@/features/studio/hooks/use-studio-frame-visual";
import { studioJobTiming } from "@/features/studio/services/studio-timing";
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
	initialJobTiming?: { id: string; createdAt: Date };
	priorityPreview?: boolean;
	isSelected?: boolean;
	onSelect?: (frameId: string, additive?: boolean) => void;
	onRetry?: (frameId: string) => void;
	/** A retry request for this frame is in flight; the button is disabled. */
	isRetryPending?: boolean;
	/** The last retry request was rejected; shown inside this frame only. */
	retryError?: string;
	isCanvasPanning?: boolean;
	className?: string;
	onMeasure?: (id: string, width: number, height: number) => void;
}

function frameStatusMessage(status: string, retryError?: string): string {
	if (status === "failed")
		return retryError || "Perubahan belum berhasil diterapkan.";
	if (status === "queued") return "Menunggu antrean pembaruan.";
	return "Sedang menerapkan perubahan.";
}

/**
 * The frame header carries the screen name, a small platform icon and at most
 * one restrained status affordance: a spinner while the frame is actively
 * generating, a quiet static dot while it waits in the queue, and a small
 * error affordance when generation failed. Queued and generating stay
 * distinguishable for assistive technology through their text alternatives.
 *
 * Recovery lives inside the failed artboard instead of the header, so the frame
 * keeps exactly one retry control. A frame that already has HTML keeps that
 * preview while a new version is built or after it failed.
 *
 * Memoized: status polling replaces the frame array every tick, so without a
 * stable render boundary every artboard would re-render (and re-run its HTML
 * extraction) on each poll and on every pan frame.
 */
export const StudioFrame = memo(function StudioFrame({
	frame,
	initialJobTiming,
	priorityPreview = false,
	isSelected = false,
	onSelect,
	onRetry,
	isRetryPending = false,
	retryError,
	isCanvasPanning = false,
	className = "",
	onMeasure,
}: StudioFrameProps) {
	const visibleUrl = useRef<string | null>(null);
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
	} = useStudioFrameVisual({ frame, isMobile, onMeasure, priorityPreview });

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
	const retry = onRetry ? () => onRetry(frame.id) : undefined;
	const showsPreview =
		(artboardMode === "preview" || artboardMode === "last-good") &&
		visual !== null;

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
							<Icon icon={SmartPhone01Icon} size={13} className="text-fog" />
						) : (
							<Icon icon={ComputerIcon} size={13} className="text-fog" />
						)}
						<span className="truncate">{frame.name}</span>
					</button>

					{frame.status === "generating" ? (
						<Icon
							icon={Loading03Icon}
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
						<Icon
							icon={AlertCircleIcon}
							size={13}
							role="img"
							aria-label="Generate gagal"
							className="shrink-0 text-crimson"
						/>
					) : null}
				</div>
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
				{showsPreview && visual ? (
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
							onLoad={() => {
								if (visibleUrl.current === visual.url) return;
								visibleUrl.current = visual.url;
								studioJobTiming("preview-image-loaded", Date.now(), {
									projectId: frame.projectId,
									frameId: frame.id,
								});
								studioJobTiming(
									"frame-visible",
									(initialJobTiming?.createdAt ?? frame.createdAt).getTime(),
									{
										projectId: frame.projectId,
										frameId: frame.id,
										jobId: initialJobTiming?.id,
									},
								);
							}}
							onError={() => setVisualError("Gambar frame gagal dimuat.")}
						/>
					</button>
				) : artboardMode === "visual-error" ? (
					<StudioFrameErrorPanel
						title="Pratinjau belum muncul"
						description={visualError}
						actionLabel="Muat ulang pratinjau"
						onAction={retryVisual}
					/>
				) : artboardMode === "generation-failed" ? (
					<StudioFrameErrorPanel
						title="Halaman belum berhasil dibuat"
						description={
							retryError ||
							frame.error ||
							"Ada kendala saat membuat halaman ini."
						}
						actionLabel="Coba lagi"
						onAction={retry}
						actionPending={isRetryPending}
					/>
				) : artboardMode === "preview-unavailable" ? (
					// Ready but no renderable HTML: a real terminal failure, never
					// an endless shimmer.
					<StudioFrameErrorPanel
						title="Pratinjau tidak tersedia"
						description={
							retryError ||
							"HTML layar ini tidak tersimpan, jadi pratinjau tidak bisa ditampilkan."
						}
						actionLabel="Generate ulang"
						onAction={retry}
						actionPending={isRetryPending}
					/>
				) : (
					<StudioFrameShimmer viewport={frame.viewport} status={frame.status} />
				)}

				{artboardMode === "last-good" ? (
					<StudioFrameStatusStrip
						message={
							frame.status === "ready"
								? visualError
								: frameStatusMessage(frame.status, retryError)
						}
						tone={
							frame.status === "failed" || frame.status === "ready"
								? "danger"
								: "progress"
						}
						actionLabel={
							frame.status === "ready"
								? "Muat ulang pratinjau"
								: frame.status === "failed"
									? "Coba lagi"
									: undefined
						}
						onAction={
							frame.status === "ready"
								? retryVisual
								: frame.status === "failed"
									? retry
									: undefined
						}
						actionPending={isRetryPending}
					/>
				) : null}
			</div>
		</article>
	);
});
