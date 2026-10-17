import type { ScrapePreviewState } from "../hooks/use-scrape-preview";
import { DesktopPreview } from "./scrape-detail-desktop-preview";
import type { FrameReport } from "./scrape-detail-preview-overlay";
import { PreviewUnavailable } from "./scrape-detail-preview-unavailable";
import { ScreenshotView } from "./scrape-detail-screenshot-view";

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
	onOpenSource,
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
	onOpenSource: () => void;
}) {
	return (
		<div role="tabpanel" aria-label="Preview index.html" hidden={!active}>
			{screenshot && previewSrcDoc && previewState !== "failed" ? (
				<div className="flex items-center justify-between border-b border-graphite bg-obsidian px-3 py-1.5 text-xs text-fog">
					<span className="font-mono text-[11px] text-snow">
						Mode Tampilan Visual
					</span>
					<div className="flex gap-1 rounded border border-graphite bg-charcoal p-0.5">
						<button
							type="button"
							onClick={() => onVisualSubView("dom")}
							aria-pressed={visualSubView === "dom"}
							className={`rounded px-2 py-0.5 text-[11px] font-medium transition ${
								visualSubView === "dom"
									? "bg-steel/40 text-snow"
									: "text-fog hover:text-snow"
							}`}
						>
							Tampilan DOM
						</button>
						<button
							type="button"
							onClick={() => onVisualSubView("screenshot")}
							aria-pressed={visualSubView === "screenshot"}
							className={`rounded px-2 py-0.5 text-[11px] font-medium transition ${
								visualSubView === "screenshot"
									? "bg-steel/40 text-snow"
									: "text-fog hover:text-snow"
							}`}
						>
							Tangkapan Layar
						</button>
					</div>
				</div>
			) : null}

			{visualSubView === "screenshot" && screenshot ? (
				<ScreenshotView
					screenshot={screenshot}
					domain={domain}
					onOpenSource={onOpenSource}
					onRetry={onRetryPreview}
				/>
			) : previewState === "failed" || !previewSrcDoc ? (
				screenshot ? (
					<ScreenshotView
						screenshot={screenshot}
						domain={domain}
						onOpenSource={onOpenSource}
						onRetry={onRetryPreview}
					/>
				) : (
					<PreviewUnavailable
						message={
							previewState === "failed"
								? (previewError ?? "Gagal menyiapkan preview scrape.")
								: "Preview belum tersedia."
						}
						isRetryable={previewState === "failed"}
						isLoading={previewState === "loading"}
						onRetry={onRetryPreview}
						onOpenSource={onOpenSource}
					/>
				)
			) : (
				<DesktopPreview
					key={previewAttempt}
					title={`Preview ${domain}`}
					domain={domain}
					screenshot={screenshot}
					srcDoc={frameSrcDoc}
					report={frameReport}
					active={active}
					onReport={onFrameReport}
					onRetry={onRetryFrame}
					onOpenSource={onOpenSource}
				/>
			)}
		</div>
	);
}
