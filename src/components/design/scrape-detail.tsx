import { Check, Copy, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SCRAPE_DESKTOP_HEIGHT } from "@/lib/constants";

export interface ScrapeDetailProps {
	domain: string;
	previewHtml?: string;
}

type HtmlViewTab = "preview" | "code";

const PREVIEW_WIDTH = 1440;
const MIN_PREVIEW_SCALE = 0.75;
const PREVIEW_HEIGHT_RATIO = 0.75;
const PREVIEW_MAX_HEIGHT = 760;

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

export function ScrapeDetail({ domain, previewHtml = "" }: ScrapeDetailProps) {
	const [htmlViewTab, setHtmlViewTab] = useState<HtmlViewTab>("preview");
	const [notice, setNotice] = useState("");
	const [busy, setBusy] = useState(false);
	const [copied, setCopied] = useState(false);
	const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (copiedTimer.current) clearTimeout(copiedTimer.current);
		};
	}, []);

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
		<section
			aria-label="Hasil HTML"
			className="overflow-hidden rounded-xl border border-graphite bg-charcoal"
		>
			<div className="flex items-center justify-between gap-2 border-b border-graphite px-3 py-2">
				<div
					role="tablist"
					aria-label="Tampilan HTML"
					className="flex gap-1 rounded-lg border border-graphite bg-onyx p-1"
				>
					<button
						type="button"
						role="tab"
						aria-selected={htmlViewTab === "preview"}
						onClick={() => setHtmlViewTab("preview")}
						className={`rounded-md px-3 py-1.5 font-mono text-xs font-semibold transition-colors ${
							htmlViewTab === "preview"
								? "bg-charcoal text-snow"
								: "text-fog hover:text-mist"
						}`}
					>
						Preview
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={htmlViewTab === "code"}
						onClick={() => setHtmlViewTab("code")}
						className={`rounded-md px-3 py-1.5 font-mono text-xs font-semibold transition-colors ${
							htmlViewTab === "code"
								? "bg-charcoal text-snow"
								: "text-fog hover:text-mist"
						}`}
					>
						Source HTML
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

			{htmlViewTab === "preview" ? (
				<div role="tabpanel" aria-label="Preview index.html">
					<DesktopPreview title={`Preview ${domain}`} srcDoc={previewHtml} />
				</div>
			) : (
				<div role="tabpanel" aria-label="Source code index.html">
					<pre className="max-h-[720px] overflow-auto bg-onyx p-5 font-mono text-xs leading-5 text-mist">
						{previewHtml}
					</pre>
				</div>
			)}

			{notice ? (
				<output className="block border-t border-graphite px-3 py-2 text-xs text-fog">
					{notice}
				</output>
			) : null}
		</section>
	);
}

function DesktopPreview({ title, srcDoc }: { title: string; srcDoc: string }) {
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

	return (
		<div
			ref={wrapRef}
			className="w-full overflow-x-auto overflow-y-hidden bg-white"
			style={{ height: Math.max(1, Math.round(frameHeight * scale)) }}
		>
			<iframe
				title={title}
				srcDoc={srcDoc}
				sandbox="allow-scripts"
				referrerPolicy="no-referrer"
				className="border-0"
				style={{
					width: PREVIEW_WIDTH,
					height: frameHeight,
					transform: `scale(${scale})`,
					transformOrigin: "top left",
				}}
			/>
		</div>
	);
}
