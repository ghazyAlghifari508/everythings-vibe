import {
	AlertTriangle,
	Check,
	Code,
	Copy,
	Download,
	Eye,
	Loader2,
	RotateCw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CodebaseSourcePreview } from "@/components/codebase/codebase-source-preview";
import type { ScrapePreviewState } from "@/hooks/use-scrape-preview";
import {
	SCRAPE_DESKTOP_HEIGHT,
	SCRAPE_PREVIEW_READY_PING_INTERVAL_MS,
} from "@/lib/constants";
import {
	INITIAL_PREVIEW_READINESS,
	type PreviewFrameReport,
	type PreviewReadinessState,
	previewDisplayReport,
	previewFrameResponded,
	previewShouldKeepPolling,
	reducePreviewReport,
} from "@/lib/preview-readiness";

export interface ScrapeDetailProps {
	domain: string;
	sourceUrl?: string;
	title?: string | null;
	previewHtml?: string;
	previewSrcDoc?: string;
	previewState?: ScrapePreviewState;
	previewError?: string | null;
	onRetryPreview?: () => void;
}

type HtmlViewTab = "preview" | "code";
type FrameReport = PreviewFrameReport;

const PREVIEW_WIDTH = 1440;
const MIN_PREVIEW_SCALE = 0.75;
const PREVIEW_HEIGHT_RATIO = 0.75;
const PREVIEW_MAX_HEIGHT = 760;

const READINESS_MESSAGE: Record<
	FrameReport,
	{ label: string; tone: "pending" | "ok" | "warn"; detail: string }
> = {
	failed: {
		label: "Preview gagal ditampilkan",
		tone: "warn",
		detail:
			"Tampilan website tidak berhasil dimuat. Coba lagi atau buka Source HTML.",
	},
	preparing: {
		label: "Menyiapkan preview website",
		tone: "pending",
		detail: "Memuat tampilan dan resource halaman.",
	},
	ready: {
		label: "Preview siap dimuat",
		tone: "ok",
		detail: "Dokumen dan resource website berhasil dimuat.",
	},
	empty: {
		label: "Preview tidak berisi konten",
		tone: "warn",
		detail:
			"Dokumen hasil capture tidak memuat teks, media, atau latar yang bisa ditampilkan.",
	},
	degraded: {
		label: "Preview dimuat sebagian",
		tone: "warn",
		detail:
			"Sebagian resource website gagal dimuat, tampilan bisa tidak lengkap.",
	},
};

function safeFilename(domain: string, ext: string): string {
	const safe = domain.replace(/[^a-zA-Z0-9.-]/g, "-").toLowerCase();
	return `${safe || "site"}.${ext}`;
}

async function copyText(value: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(value);
		return true;
	} catch {
		return false;
	}
}

function downloadFile(filename: string, content: string, mimeType: string) {
	const blob = new Blob([content], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const ICON_BUTTON_CLASS =
	"inline-flex size-8 items-center justify-center rounded-md border border-transparent text-fog transition-colors hover:border-graphite hover:bg-onyx hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo disabled:opacity-50";

export function ScrapeDetail({
	domain,
	sourceUrl,
	title,
	previewHtml = "",
	previewSrcDoc = "",
	previewState = "ready",
	previewError = null,
	onRetryPreview,
}: ScrapeDetailProps) {
	const [htmlViewTab, setHtmlViewTab] = useState<HtmlViewTab>("preview");
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

	async function handleCopy(text: string, successMessage: string) {
		setBusy(true);
		setNotice("");
		const ok = await copyText(text);
		setNotice(
			ok ? successMessage : "Gagal menyalin. Blokir clipboard oleh browser.",
		);
		setBusy(false);
		if (ok) {
			setCopied(true);
			if (copiedTimer.current) clearTimeout(copiedTimer.current);
			copiedTimer.current = setTimeout(() => setCopied(false), 2000);
		}
	}

	function handleDownload() {
		setBusy(true);
		setNotice("");
		try {
			downloadFile(
				safeFilename(domain, "html"),
				previewHtml,
				"text/html;charset=utf-8",
			);
			setNotice("index.html mulai diunduh.");
		} catch {
			setNotice("Gagal mengunduh file. Coba lagi.");
		} finally {
			setBusy(false);
		}
	}

	const copyLabel = "Salin HTML";
	const downloadLabel = "Download index.html";
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
						rel="noreferrer"
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
				<div className="flex flex-wrap items-center justify-between gap-2 border-b border-graphite px-3 py-2">
					<div
						role="tablist"
						aria-label="Tampilan HTML"
						className="flex gap-1 rounded-lg border border-graphite bg-onyx p-1"
					>
						<button
							aria-label="Preview"
							title="Preview"
							tabIndex={htmlViewTab === "preview" ? 0 : -1}
							onKeyDown={(event) => {
								if (["ArrowRight", "ArrowLeft", "End"].includes(event.key)) {
									event.preventDefault();
									setHtmlViewTab("code");
									document.getElementById("html-code-tab")?.focus();
								}
							}}
							id="html-preview-tab"
							type="button"
							role="tab"
							aria-selected={htmlViewTab === "preview"}
							onClick={() => setHtmlViewTab("preview")}
							className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo ${
								htmlViewTab === "preview"
									? "bg-charcoal text-snow"
									: "text-fog hover:text-mist"
							}`}
						>
							<Eye size={16} aria-hidden />
							<span>Preview</span>
						</button>
						<button
							aria-label="Source HTML"
							title="Source HTML"
							tabIndex={htmlViewTab === "code" ? 0 : -1}
							onKeyDown={(event) => {
								if (["ArrowRight", "ArrowLeft", "Home"].includes(event.key)) {
									event.preventDefault();
									setHtmlViewTab("preview");
									document.getElementById("html-preview-tab")?.focus();
								}
							}}
							id="html-code-tab"
							type="button"
							role="tab"
							aria-selected={htmlViewTab === "code"}
							onClick={() => setHtmlViewTab("code")}
							className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo ${
								htmlViewTab === "code"
									? "bg-charcoal text-snow"
									: "text-fog hover:text-mist"
							}`}
						>
							<Code size={16} aria-hidden />
							<span className="hidden sm:inline">Source HTML</span>
							<span className="sm:hidden">HTML</span>
						</button>
					</div>
					<div className="flex shrink-0 items-center gap-1">
						<button
							type="button"
							onClick={() =>
								void handleCopy(previewHtml, "HTML tersalin ke clipboard.")
							}
							disabled={busy}
							aria-label={copyLabel}
							title={copyLabel}
							className={ICON_BUTTON_CLASS}
						>
							{copied ? (
								<Check size={15} aria-hidden className="text-emerald-400" />
							) : (
								<Copy size={15} aria-hidden />
							)}
						</button>
						<button
							type="button"
							onClick={handleDownload}
							disabled={busy}
							aria-label={downloadLabel}
							title={downloadLabel}
							className={ICON_BUTTON_CLASS}
						>
							<Download size={15} aria-hidden />
						</button>
					</div>
				</div>

				<div
					role="tabpanel"
					aria-label="Preview index.html"
					hidden={htmlViewTab !== "preview"}
				>
					{previewState === "failed" || !previewSrcDoc ? (
						<PreviewUnavailable
							message={
								previewState === "failed"
									? (previewError ?? "Gagal menyiapkan preview scrape.")
									: "Preview belum tersedia."
							}
							isRetryable={previewState === "failed"}
							isLoading={previewState === "loading"}
							onRetry={onRetryPreview}
							onOpenSource={() => setHtmlViewTab("code")}
						/>
					) : (
						<DesktopPreview
							key={previewAttempt}
							title={`Preview ${domain}`}
							srcDoc={frameSrcDoc}
							report={frameReport}
							active={htmlViewTab === "preview"}
							onReport={handleFrameReport}
							onRetry={() => {
								setFrameReport("preparing");
								setPreviewAttempt((attempt) => attempt + 1);
								onRetryPreview?.();
							}}
							onOpenSource={() => setHtmlViewTab("code")}
						/>
					)}
				</div>
				<div
					role="tabpanel"
					aria-label="Source code index.html"
					hidden={htmlViewTab === "preview"}
				>
					<div className="max-h-[720px] bg-onyx p-3">
						<CodebaseSourcePreview
							path="index.html"
							content={previewHtml}
							truncated={false}
							sizeBytes={sourceSizeBytes}
						/>
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

function PreviewUnavailable({
	message,
	isRetryable,
	isLoading = false,
	onRetry,
	onOpenSource,
}: {
	message: string;
	isRetryable: boolean;
	isLoading?: boolean;
	onRetry?: () => void;
	onOpenSource?: () => void;
}) {
	return (
		<div className="flex min-h-[280px] flex-col items-center justify-center gap-3 bg-onyx px-6 py-12 text-center">
			{isLoading ? (
				<Loader2
					size={20}
					aria-hidden
					className="text-fog motion-safe:animate-spin motion-reduce:animate-none"
				/>
			) : (
				<AlertTriangle size={20} aria-hidden className="text-amber-400" />
			)}
			<output className="text-sm font-semibold text-snow">{message}</output>
			<p className="max-w-md text-xs leading-5 text-fog">
				Source HTML asli tetap tersedia di tab Source HTML.
			</p>
			{isRetryable && onRetry ? (
				<div className="mt-1 flex flex-wrap items-center justify-center gap-2">
					<button
						type="button"
						onClick={onRetry}
						className="inline-flex items-center gap-1.5 rounded-md border border-graphite px-3 py-1.5 text-xs font-semibold text-snow transition-colors hover:border-steel hover:bg-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
					>
						<RotateCw size={14} aria-hidden />
						Coba lagi
					</button>
					{onOpenSource ? (
						<button
							type="button"
							onClick={onOpenSource}
							className="inline-flex items-center gap-1.5 rounded-md border border-graphite px-3 py-1.5 text-xs font-semibold text-snow transition-colors hover:border-steel hover:bg-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
						>
							<Code size={14} aria-hidden />
							Buka Source HTML
						</button>
					) : null}
				</div>
			) : null}
		</div>
	);
}

function PreviewCanvasOverlay({
	report,
	onRetry,
	onOpenSource,
}: {
	report: FrameReport;
	onRetry?: () => void;
	onOpenSource?: () => void;
}) {
	const { label, detail } = READINESS_MESSAGE[report];
	if (report === "ready") return null;
	if (report === "degraded") {
		return (
			<div className="pointer-events-none absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-md border border-graphite bg-obsidian/95 px-2.5 py-1.5 text-xs">
				<AlertTriangle
					size={14}
					aria-hidden
					className="shrink-0 text-amber-400"
				/>
				<output className="truncate font-semibold text-snow">
					{label}
					<span className="font-normal text-fog"> {detail}</span>
				</output>
			</div>
		);
	}
	return (
		<div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-onyx px-6 py-12 text-center">
			{report === "preparing" ? (
				<Loader2
					size={20}
					aria-hidden
					className="text-fog motion-safe:animate-spin motion-reduce:animate-none"
				/>
			) : (
				<AlertTriangle size={20} aria-hidden className="text-amber-400" />
			)}
			<output className="text-sm font-semibold text-snow">{label}</output>
			<p className="max-w-md text-xs leading-5 text-fog">{detail}</p>
			{(report === "failed" || report === "empty") && onRetry ? (
				<div className="flex flex-wrap items-center justify-center gap-2">
					<button
						type="button"
						onClick={onRetry}
						className="rounded-md border border-graphite px-3 py-2 text-sm text-snow focus-visible:ring-2 focus-visible:ring-indigo"
					>
						Coba lagi
					</button>
					{onOpenSource ? (
						<button
							type="button"
							onClick={onOpenSource}
							className="rounded-md border border-graphite px-3 py-2 text-sm text-snow focus-visible:ring-2 focus-visible:ring-indigo"
						>
							Buka Source HTML
						</button>
					) : null}
				</div>
			) : null}
		</div>
	);
}

function DesktopPreview({
	title,
	srcDoc,
	report,
	active = true,
	onReport,
	onRetry,
	onOpenSource,
}: {
	title: string;
	srcDoc: string;
	report: FrameReport;
	active?: boolean;
	onReport?: (report: FrameReport) => void;
	onRetry?: () => void;
	onOpenSource?: () => void;
}) {
	const wrapRef = useRef<HTMLDivElement>(null);
	const [scale, setScale] = useState(1);
	const [frameHeight, setFrameHeight] = useState(() =>
		Math.min(
			PREVIEW_MAX_HEIGHT,
			Math.round(SCRAPE_DESKTOP_HEIGHT * PREVIEW_HEIGHT_RATIO),
		),
	);

	useEffect(() => {
		const el = wrapRef.current;
		if (!el) return;

		const measure = () =>
			setScale(
				Math.min(
					1,
					Math.max(MIN_PREVIEW_SCALE, el.clientWidth / PREVIEW_WIDTH),
				),
			);
		const resizeFrame = () =>
			setFrameHeight(
				Math.min(
					PREVIEW_MAX_HEIGHT,
					Math.round(window.innerHeight * PREVIEW_HEIGHT_RATIO),
				),
			);
		const observer =
			typeof ResizeObserver === "undefined"
				? null
				: new ResizeObserver(measure);

		measure();
		resizeFrame();
		observer?.observe(el);
		window.addEventListener("resize", resizeFrame);
		return () => {
			observer?.disconnect();
			window.removeEventListener("resize", resizeFrame);
		};
	}, []);

	const frameRef = useRef<HTMLIFrameElement>(null);
	const pingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	// Every frame report is folded through one reducer, so a provisional empty
	// verdict can be upgraded by a later ready report instead of sticking.
	const readinessRef = useRef<PreviewReadinessState>(INITIAL_PREVIEW_READINESS);

	const stopPinging = useCallback(() => {
		if (pingTimer.current) {
			clearTimeout(pingTimer.current);
			pingTimer.current = null;
		}
	}, []);

	const applyReport = useCallback(
		(incoming: FrameReport) => {
			const next = reducePreviewReport(readinessRef.current, incoming);
			readinessRef.current = next;
			onReport?.(previewDisplayReport(next));
			if (!previewShouldKeepPolling(next)) stopPinging();
		},
		[onReport, stopPinging],
	);

	useEffect(() => {
		if (!onReport) return;
		const handleMessage = (event: MessageEvent) => {
			if (event.source !== frameRef.current?.contentWindow) return;
			const data: unknown = event.data;
			if (typeof data !== "object" || data === null) return;
			const payload = data as { type?: unknown; state?: unknown };
			if (payload.type !== "vibedesign-preview") return;
			const state = payload.state;
			if (
				state === "ready" ||
				state === "empty" ||
				state === "degraded" ||
				state === "failed" ||
				state === "preparing"
			) {
				applyReport(state);
			}
		};
		window.addEventListener("message", handleMessage);
		return () => window.removeEventListener("message", handleMessage);
	}, [onReport, applyReport]);

	useEffect(() => {
		return () => {
			if (pingTimer.current) clearTimeout(pingTimer.current);
		};
	}, []);

	const handleFrameLoad = useCallback(() => {
		if (!active) return;
		const frame = frameRef.current?.contentWindow;
		if (!frame) return;
		try {
			frame.postMessage({ type: "vibedesign-preview-ping" }, "*");
		} catch {
			// Frame navigated away or is not reachable; readiness stays preparing.
		}
	}, [active]);

	// The framed document reports on its own load, but that can land before the
	// listener above is attached, so keep asking until a verdict settles.
	useEffect(() => {
		if (!onReport || !srcDoc || !active) {
			if (pingTimer.current) clearTimeout(pingTimer.current);
			return;
		}
		readinessRef.current = INITIAL_PREVIEW_READINESS;
		onReport("preparing");
		const ask = () => {
			if (!previewShouldKeepPolling(readinessRef.current)) {
				pingTimer.current = null;
				// The budget ran out with no verdict. A frame that answered at least
				// once is alive and slow, so its last report stands; a frame that
				// never answered at all is a real failure to report.
				if (
					readinessRef.current.report === "preparing" &&
					!previewFrameResponded(readinessRef.current)
				)
					onReport("failed");
				return;
			}
			const frame = frameRef.current?.contentWindow;
			if (frame) {
				try {
					frame.postMessage({ type: "vibedesign-preview-ping" }, "*");
				} catch {
					// Unreachable frame keeps the open verdict; the budget bounds it.
				}
			}
			pingTimer.current = setTimeout(
				ask,
				SCRAPE_PREVIEW_READY_PING_INTERVAL_MS,
			);
		};
		ask();
		return () => {
			if (pingTimer.current) clearTimeout(pingTimer.current);
		};
	}, [onReport, srcDoc, active]);

	const canvasWidth = Math.max(1, Math.round(PREVIEW_WIDTH * scale));
	const canvasHeight = Math.max(1, Math.round(frameHeight * scale));

	return (
		<div className="flex flex-col">
			<div ref={wrapRef} className="relative w-full overflow-x-auto bg-white">
				<div
					className="min-h-[280px]"
					style={{
						position: "relative",
						width: canvasWidth,
						height: canvasHeight,
					}}
				>
					<iframe
						ref={frameRef}
						title={title}
						srcDoc={active ? srcDoc : ""}
						onLoad={handleFrameLoad}
						sandbox="allow-scripts"
						referrerPolicy="no-referrer"
						className="border-0"
						style={{
							position: "absolute",
							top: 0,
							left: 0,
							width: PREVIEW_WIDTH,
							height: frameHeight,
							transform: `scale(${scale})`,
							transformOrigin: "top left",
						}}
					/>
					<PreviewCanvasOverlay
						report={report}
						onRetry={onRetry}
						onOpenSource={onOpenSource}
					/>
				</div>
			</div>
		</div>
	);
}
