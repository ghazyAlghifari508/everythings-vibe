import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CodebaseSourcePreview } from "@/features/codebase/components/explorer/codebase-source-preview";
import {
	SCRAPE_SOURCE_PREVIEW_MAX_HEIGHT,
	SCRAPE_SOURCE_PREVIEW_MAX_LINES,
} from "@/features/scrape/types/scrape-constants";
import type { ScrapePreviewState } from "../hooks/use-scrape-preview";
import { safeScrapeFilename } from "../utils/filename";
import type { FrameReport } from "./scrape-detail-preview-overlay";
import { ScrapeHtmlPreviewPanel } from "./scrape-detail-preview-panel";
import { type HtmlViewTab, ScrapeHtmlToolbar } from "./scrape-detail-toolbar";
import { copyText, downloadFile } from "./scrape-file-actions";

export interface ScrapeDetailProps {
	domain: string;
	sourceUrl?: string;
	title?: string | null;
	previewHtml?: string;
	previewSrcDoc?: string;
	previewState?: ScrapePreviewState;
	previewError?: string | null;
	screenshot?: string | null;
	onRetryPreview?: () => void;
}

function safeFilename(
	domain: string,
	ext: string,
	sourceUrl?: string,
	suffix?: string,
): string {
	return safeScrapeFilename(domain, ext, sourceUrl, suffix);
}

export function ScrapeDetail({
	domain,
	sourceUrl,
	title,
	previewHtml = "",
	previewSrcDoc = "",
	previewState = "ready",
	previewError = null,
	screenshot = null,
	onRetryPreview,
}: ScrapeDetailProps) {
	const [htmlViewTab, setHtmlViewTab] = useState<HtmlViewTab>("preview");
	// The source viewer is mounted the first time the source tab is opened, so
	// a visitor who never reads the source never pays for rendering it.
	const [hasOpenedSource, setHasOpenedSource] = useState(false);
	const [visualSubView, setVisualSubView] = useState<"dom" | "screenshot">(
		"dom",
	);
	const [notice, setNotice] = useState("");
	const [busy, setBusy] = useState(false);
	const [copied, setCopied] = useState(false);
	const [frameReport, setFrameReport] = useState<FrameReport>("preparing");
	const [previewAttempt, setPreviewAttempt] = useState(0);
	const sourceSizeBytes = useMemo(
		() =>
			previewHtml.length > 0
				? new TextEncoder().encode(previewHtml).length
				: null,
		[previewHtml],
	);
	const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (copiedTimer.current) clearTimeout(copiedTimer.current);
		};
	}, []);

	const handleFrameReport = useCallback((next: FrameReport) => {
		setFrameReport(next);
	}, []);

	const [frameSrcDoc, setFrameSrcDoc] = useState(previewSrcDoc);
	const prevSrcDocRef = useRef(previewSrcDoc);
	useEffect(() => {
		if (prevSrcDocRef.current !== previewSrcDoc) {
			prevSrcDocRef.current = previewSrcDoc;
			setFrameSrcDoc(previewSrcDoc);
			setFrameReport("preparing");
		}
	}, [previewSrcDoc]);

	async function handleCopy(text: string) {
		setBusy(true);
		setNotice("");
		const ok = await copyText(text);
		if (!ok) {
			setNotice("Gagal menyalin. Blokir clipboard oleh browser.");
		}
		setBusy(false);
		if (ok) {
			setCopied(true);
			if (copiedTimer.current) clearTimeout(copiedTimer.current);
			copiedTimer.current = setTimeout(() => setCopied(false), 2000);
		}
	}

	const filename = safeFilename(domain, "html", sourceUrl);
	const screenshotFilename = safeFilename(
		domain,
		"jpg",
		sourceUrl,
		"screenshot",
	);

	function handleDownload() {
		setBusy(true);
		setNotice("");
		try {
			downloadFile(filename, previewHtml, "text/html;charset=utf-8");
		} catch {
			setNotice("Gagal mengunduh file. Coba lagi.");
		} finally {
			setBusy(false);
		}
	}

	function handleDownloadScreenshot() {
		if (!screenshot) return;
		setBusy(true);
		setNotice("");
		try {
			const anchor = document.createElement("a");
			anchor.href = screenshot;
			anchor.download = screenshotFilename;
			document.body.appendChild(anchor);
			anchor.click();
			anchor.remove();
		} catch {
			setNotice("Gagal mengunduh tangkapan layar. Coba lagi.");
		} finally {
			setBusy(false);
		}
	}

	function selectTab(tab: HtmlViewTab) {
		setHtmlViewTab(tab);
		if (tab === "code") setHasOpenedSource(true);
	}

	function focusHtmlTab(tab: HtmlViewTab) {
		selectTab(tab);
		document
			.getElementById(tab === "code" ? "html-code-tab" : "html-preview-tab")
			?.focus();
	}

	return (
		<div className="space-y-5">
			{sourceUrl && (
				<header>
					<h1 className="text-2xl font-semibold text-snow">
						{title || domain}
					</h1>
					<a
						href={sourceUrl}
						target="_blank"
						rel="noreferrer noopener"
						className="mt-2 block break-all text-sm text-fog"
					>
						{sourceUrl}
					</a>
				</header>
			)}
			<section
				aria-label="Hasil HTML"
				className="overflow-hidden rounded-xl border border-graphite bg-charcoal"
			>
				<ScrapeHtmlToolbar
					activeTab={htmlViewTab}
					onSelectTab={selectTab}
					onFocusTab={focusHtmlTab}
					screenshot={screenshot}
					screenshotFilename={screenshotFilename}
					fileName={filename}
					busy={busy}
					copied={copied}
					onDownloadScreenshot={handleDownloadScreenshot}
					onCopy={() => void handleCopy(previewHtml)}
					onDownload={handleDownload}
				/>

				<ScrapeHtmlPreviewPanel
					active={htmlViewTab === "preview"}
					domain={domain}
					screenshot={screenshot}
					previewSrcDoc={previewSrcDoc}
					previewState={previewState}
					previewError={previewError}
					visualSubView={visualSubView}
					onVisualSubView={setVisualSubView}
					frameSrcDoc={frameSrcDoc}
					frameReport={frameReport}
					previewAttempt={previewAttempt}
					onFrameReport={handleFrameReport}
					onRetryFrame={() => {
						setFrameReport("preparing");
						setPreviewAttempt((attempt) => attempt + 1);
						onRetryPreview?.();
					}}
					onRetryPreview={onRetryPreview}
				/>

				<div
					role="tabpanel"
					aria-label="Source code index.html"
					hidden={htmlViewTab === "preview"}
				>
					<div className="bg-onyx p-3">
						{hasOpenedSource ? (
							<CodebaseSourcePreview
								path="index.html"
								content={previewHtml}
								truncated={false}
								sizeBytes={sourceSizeBytes}
								maxLines={SCRAPE_SOURCE_PREVIEW_MAX_LINES}
								maxBodyHeight={SCRAPE_SOURCE_PREVIEW_MAX_HEIGHT}
								truncationHint="Unduh file HTML untuk melihat seluruh isi."
							/>
						) : null}
					</div>
				</div>

				{notice ? (
					<output className="block border-t border-graphite px-3 py-2 text-xs text-fog">
						{notice}
					</output>
				) : null}
			</section>
		</div>
	);
}
