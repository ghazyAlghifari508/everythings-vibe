import {
	AlertCircleIcon,
	ComputerIcon,
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
import { useStudioFrameRenderer } from "@/features/studio/hooks/use-studio-frame-renderer";
import type { StudioVisibleJob } from "@/features/studio/types/studio-status";
import { extractCleanHtml } from "@/features/studio/utils/clean-html";
import { resolveFrameArtboardMode } from "@/features/studio/utils/studio-frame-artboard";
import { resolveStudioFrameStatus } from "@/features/studio/utils/studio-lifecycle";
import { studioFailureCopy } from "@/features/studio/utils/studio-renderer";
import type { StudioVisibilityReporter } from "../../hooks/use-studio-live-pool";
import type {
	StudioElementAction,
	StudioElementTarget,
} from "../../types/studio-element";
import type { StudioDevice } from "../../types/studio-renderer";
import { StudioLiveSurface } from "./studio-live-surface";

export type { StudioFrameArtboardMode } from "@/features/studio/utils/studio-frame-artboard";
export { resolveFrameArtboardMode } from "@/features/studio/utils/studio-frame-artboard";

export interface StudioFrameProps {
	frame: StudioFrameRow;
	job?: StudioVisibleJob | null;
	initialJobTiming?: { id: string; createdAt: Date };
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
	/** Element inspection is active for this frame. */
	inspectElement?: boolean;
	/** The frame may hold a live document (visible/selected/inspected pool). */
	liveEnabled?: boolean;
	/** Presentation-only device preset; never part of the design revision. */
	device?: StudioDevice;
	/** The canvas viewport, so visibility follows the transformed artboards. */
	viewportRef?: React.RefObject<HTMLElement | null>;
	/** Reports whether the artboard is near the viewport. */
	onVisibilityChange?: StudioVisibilityReporter;
	elementTarget?: StudioElementTarget | null;
	onSelectElement?: (
		target: StudioElementTarget | null,
		frameId: string,
	) => void;
	onElementAction?: (
		action: StudioElementAction,
		target: StudioElementTarget,
		text?: string,
	) => void;
	elementActionBusy?: boolean;
	/** Explicit Refresh invalidation; never part of the design revision. */
	refreshToken?: number;
	/** Reports whether the committed revision is rendered and ready. */
	onRendererReadinessChange?: (frameId: string, ready: boolean) => void;
	menuLeftInsetPx?: number;
	canvasZoom?: number;
	onElementError?: (message: string) => void;
}

function frameStatusMessage(status: string, retryError?: string): string {
	if (retryError) return retryError;
	if (status === "failed") return "Perubahan belum berhasil diterapkan.";
	if (status === "queued") return "Menunggu antrean pembaruan.";
	return "Sedang menerapkan perubahan.";
}

/**
 * The frame header carries the screen name, a small platform icon, and an
 * error affordance when generation failed. Actively generating frames rely on
 * the single artboard shimmer below without redundant header spinners. Queued
 * and generating stay distinguishable for assistive technology through their
 * sr-only text alternatives.
 * Recovery lives inside the failed artboard instead of the header, so the frame
 * keeps exactly one retry control. A frame that already has HTML keeps that
 * document while a new version is built or after it failed.
 *
 * Memoized: status polling replaces the frame array every tick, so without a
 * stable render boundary every artboard would re-render (and re-run its HTML
 * extraction) on each poll and on every pan frame.
 */
export const StudioFrame = memo(function StudioFrame({
	frame,
	job = null,
	initialJobTiming,
	isSelected = false,
	onSelect,
	onRetry,
	isRetryPending = false,
	retryError,
	isCanvasPanning = false,
	className = "",
	onMeasure,
	inspectElement = false,
	liveEnabled = false,
	device,
	viewportRef,
	onVisibilityChange,
	elementTarget,
	onElementAction,
	elementActionBusy = false,
	menuLeftInsetPx = 0,
	canvasZoom = 1,
	onElementError,
	onSelectElement,
	refreshToken,
	onRendererReadinessChange,
}: StudioFrameProps) {
	const artboardRef = useRef<HTMLElement>(null);
	const status = resolveStudioFrameStatus(frame, job);
	const isMobile = frame.viewport === "mobile";
	const cleanHtml = frame.htmlCode ? extractCleanHtml(frame.htmlCode) : "";
	const hasRenderableHtml = cleanHtml.length > 0;
	const { live, presentation, liveNotice, isCurrent } = useStudioFrameRenderer({
		frame,
		hasRenderableHtml,
		cleanHtml,
		artboardRef,
		viewportRef,
		liveEnabled,
		device,
		refreshToken,
		initialJobTiming,
		onMeasure,
		onVisibilityChange,
		onReadinessChange: onRendererReadinessChange,
	});
	const rendererFailure =
		live.readiness.phase === "failed" ? live.readiness.failure : null;
	const artboardMode = resolveFrameArtboardMode({
		status,
		hasRenderableHtml,
		rendererFailure,
		hasActiveDocument: presentation.showLive,
	});
	const retry = onRetry ? () => onRetry(frame.id) : undefined;
	const passive = !inspectElement;

	const rendererStrip = liveNotice
		? {
				message: liveNotice.message,
				tone: liveNotice.tone,
				actionLabel: liveNotice.retry ? "Muat ulang dokumen" : undefined,
				onAction: liveNotice.retry ? live.retry : undefined,
			}
		: null;
	const generationStrip =
		status !== "ready" || retryError
			? {
					message: frameStatusMessage(status, retryError),
					tone:
						status === "failed" || retryError
							? ("danger" as const)
							: ("progress" as const),
					actionLabel: status === "failed" ? "Coba lagi" : undefined,
					onAction: status === "failed" ? retry : undefined,
				}
			: null;
	// Exactly one status disclosure: a retryable renderer failure wins, then
	// generation progress, then passive renderer notes. No duplicate strips.
	const strip = rendererStrip?.onAction
		? rendererStrip
		: (generationStrip ?? rendererStrip);

	return (
		<article
			ref={artboardRef}
			data-frame-id={frame.id}
			aria-label={`Frame ${frame.name}`}
			className={`flex flex-col gap-2 select-none ${className}`}
		>
			<div className="flex items-center justify-between gap-2 px-1">
				<div className="flex min-w-0 items-center gap-2">
					<button
						type="button"
						data-canvas-gesture-surface=""
						aria-pressed={isSelected}
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

					{status === "generating" ? (
						<output aria-label="Sedang digenerate" className="sr-only" />
					) : null}
					{status === "queued" ? (
						<output aria-label="Menunggu antrean" className="sr-only" />
					) : null}
					{status === "failed" ? (
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

			<div
				className={`relative overflow-hidden ${
					isMobile ? "rounded-lg" : "rounded-xl"
				} border ${
					isSelected
						? "border-blue-600 outline-2 outline-offset-2 outline-blue-600"
						: "border-graphite hover:border-steel"
				} bg-obsidian`}
				style={{ width: presentation.width, height: presentation.height }}
			>
				{artboardMode === "shimmer" ? (
					<StudioFrameShimmer viewport={frame.viewport} status={status} />
				) : null}

				{artboardMode === "generation-failed" ? (
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
				) : null}

				{artboardMode === "html-unavailable" ? (
					<StudioFrameErrorPanel
						title="Dokumen tidak tersedia"
						description={
							retryError ||
							"HTML layar ini tidak tersimpan, jadi dokumen tidak bisa ditampilkan."
						}
						actionLabel="Generate ulang"
						onAction={retry}
						actionPending={isRetryPending}
					/>
				) : null}

				{artboardMode === "renderer-failed" ? (
					<StudioFrameErrorPanel
						title="Dokumen tidak dapat ditampilkan"
						description={
							live.readiness.phase === "failed"
								? live.readiness.message ||
									studioFailureCopy(live.readiness.failure)
								: rendererFailure
									? studioFailureCopy(rendererFailure)
									: "Dokumen HTML gagal disiapkan."
						}
						actionLabel="Muat ulang dokumen"
						onAction={live.retry}
					/>
				) : null}

				{artboardMode === "html" ? (
					<>
						{presentation.showLive ? null : (
							<div className="pointer-events-none absolute inset-0 z-[6]">
								<StudioFrameShimmer
									viewport={frame.viewport}
									status="preparing"
								/>
							</div>
						)}
						<StudioLiveSurface
							state={live.state}
							dispatch={live.dispatch}
							title={`Dokumen: ${frame.name}`}
							width={presentation.width}
							height={presentation.height}
							visible={presentation.showLive}
							interactive={inspectElement && liveEnabled && isCurrent}
							suspended={isCanvasPanning}
							target={elementTarget}
							onSelect={onSelectElement}
							onAction={onElementAction}
							actionBusy={elementActionBusy}
							leftInsetPx={menuLeftInsetPx}
							viewport={viewportRef?.current}
							zoom={canvasZoom}
							onError={onElementError}
						/>
					</>
				) : null}

				{passive && hasRenderableHtml ? (
					<button
						type="button"
						data-canvas-gesture-surface=""
						aria-label={`Pilih frame ${frame.name}`}
						aria-pressed={isSelected}
						onClick={(event) => {
							if (!isCanvasPanning) onSelect?.(frame.id, event.shiftKey);
						}}
						className="absolute inset-0 z-[5] size-full focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-snow"
					/>
				) : null}

				{strip && artboardMode === "html" ? (
					<StudioFrameStatusStrip
						message={strip.message}
						tone={strip.tone}
						actionLabel={strip.actionLabel}
						onAction={strip.onAction}
						actionPending={isRetryPending}
					/>
				) : null}
			</div>
		</article>
	);
});
