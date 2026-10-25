import { RefreshIcon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import type { ScrapePreviewState } from "../hooks/use-scrape-preview";
import { DesktopPreview } from "./scrape-detail-desktop-preview";
import {
	type FrameReport,
	READINESS_MESSAGE,
} from "./scrape-detail-preview-overlay";
import { PreviewUnavailable } from "./scrape-detail-preview-unavailable";
import { ScreenshotView } from "./scrape-detail-screenshot-view";

/**
 * Visual tab content.
 *
 * Two navigation layers exist at most: the primary Visual / HTML Source tabs
 * above, and one secondary selector that only appears when both a DOM preview
 * and a browser screenshot are genuinely available. When only one visual mode
 * exists it is shown directly, without a one-option selector.
 */
export function ScrapeHtmlPreviewPanel({
	active,
	domain,
	screenshot,
	previewSrcDoc,
	previewState,
	previewError,
	visualSubView,
	onVisualSubView,
	frameSrcDoc,
	frameReport,
	previewAttempt,
	onFrameReport,
	onRetryFrame,
	onRetryPreview,
}: {
	active: boolean;
	domain: string;
	screenshot?: string | null;
	previewSrcDoc: string;
	previewState: ScrapePreviewState;
	previewError?: string | null;
	visualSubView: "dom" | "screenshot";
	onVisualSubView: (view: "dom" | "screenshot") => void;
	frameSrcDoc: string;
	frameReport: FrameReport;
	previewAttempt: number;
	onFrameReport: (report: FrameReport) => void;
	onRetryFrame: () => void;
	onRetryPreview?: () => void;
}) {
	const hasScreenshot = Boolean(screenshot);
	const hasDomDocument = Boolean(previewSrcDoc) && previewState !== "failed";
	const domFailed = previewState === "failed" || frameReport === "failed";
	// A frame that failed cannot be shown again, so the DOM mode stops being
	// available the moment the report turns fatal.
	const domUsable = hasDomDocument && frameReport !== "failed";
	const showModeSelector = domUsable && hasScreenshot;
	const showDom =
		domUsable && (visualSubView !== "screenshot" || !hasScreenshot);

	const retryAction = previewState === "failed" ? onRetryPreview : onRetryFrame;
	const unavailableMessage =
		previewState === "failed"
			? (previewError ?? "Gagal menyiapkan preview scrape.")
			: frameReport === "failed"
				? READINESS_MESSAGE.failed.label
				: "Preview belum tersedia.";

	return (
		<div role="tabpanel" aria-label="Preview index.html" hidden={!active}>
			{showModeSelector ? (
				<div className="flex items-center justify-end border-b border-graphite bg-obsidian px-3 py-1.5">
					<fieldset className="flex gap-0.5 rounded-md border border-graphite bg-charcoal p-0.5">
						<legend className="sr-only">Mode tampilan visual</legend>
						<button
							type="button"
							onClick={() => onVisualSubView("dom")}
							aria-pressed={visualSubView === "dom"}
							aria-label="Tampilan DOM"
							className={`min-h-7 rounded px-2 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo ${
								visualSubView === "dom"
									? "bg-steel/40 text-snow"
									: "text-fog hover:text-snow"
							}`}
						>
							DOM
						</button>
						<button
							type="button"
							onClick={() => onVisualSubView("screenshot")}
							aria-pressed={visualSubView === "screenshot"}
							aria-label="Tangkapan Layar"
							className={`min-h-7 rounded px-2 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo ${
								visualSubView === "screenshot"
									? "bg-steel/40 text-snow"
									: "text-fog hover:text-snow"
							}`}
						>
							Tangkapan Layar
						</button>
					</fieldset>
				</div>
			) : null}

			{showDom ? (
				<DesktopPreview
					key={previewAttempt}
					title={`Preview ${domain}`}
					srcDoc={frameSrcDoc}
					report={frameReport}
					active={active}
					onReport={onFrameReport}
					onRetry={onRetryFrame}
				/>
			) : hasScreenshot && screenshot ? (
				<>
					<ScreenshotView screenshot={screenshot} domain={domain} />
					{domFailed && retryAction ? (
						<div
							data-testid="scrape-visual-recovery"
							className="flex flex-wrap items-center justify-between gap-2 border-t border-graphite bg-obsidian px-3 py-2 text-xs text-fog"
						>
							<span>Preview DOM gagal dimuat.</span>
							<button
								type="button"
								onClick={retryAction}
								className="inline-flex items-center gap-1.5 rounded-md border border-graphite px-2.5 py-1 font-semibold text-snow transition-colors hover:border-steel hover:bg-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
							>
								<Icon icon={RefreshIcon} size={13} aria-hidden />
								Coba lagi
							</button>
						</div>
					) : null}
				</>
			) : (
				<PreviewUnavailable
					message={unavailableMessage}
					isRetryable={domFailed}
					isLoading={previewState === "loading" && frameReport !== "failed"}
					onRetry={retryAction}
				/>
			)}
		</div>
	);
}
