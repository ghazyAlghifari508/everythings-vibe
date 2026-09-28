import JSZip from "jszip";
import { Code2, Copy, Download, Eye } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { extractCleanHtml } from "@/lib/clean-html";

export type StudioViewport = "desktop" | "tablet" | "mobile";

const VIEWPORT_WIDTH: Record<StudioViewport, number> = {
	desktop: 1440,
	tablet: 768,
	mobile: 375,
};

const VIEWPORT_LABEL: Record<StudioViewport, string> = {
	desktop: "Desktop 1440px",
	tablet: "Tablet 768px",
	mobile: "Mobile 375px",
};

type CanvasTab = "preview" | "code";

async function copyText(value: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(value);
		return true;
	} catch {
		return false;
	}
}

export function StudioCanvas({
	title,
	htmlCode,
	version,
}: {
	title: string;
	htmlCode: string;
	version: number;
}) {
	const [viewport, setViewport] = useState<StudioViewport>("desktop");
	const [tab, setTab] = useState<CanvasTab>("preview");
	const [scale, setScale] = useState(1);
	const [notice, setNotice] = useState("");
	const [busy, setBusy] = useState<"copy" | "download" | null>(null);
	const wrapRef = useRef<HTMLDivElement>(null);

	const cleanHtml = extractCleanHtml(htmlCode);
	const frameWidth = VIEWPORT_WIDTH[viewport];

	useEffect(() => {
		const el = wrapRef.current;
		if (!el || typeof ResizeObserver === "undefined") return;
		const measure = () => setScale(Math.min(1, el.clientWidth / frameWidth));
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(el);
		return () => observer.disconnect();
	}, [frameWidth]);

	async function handleCopy() {
		setBusy("copy");
		setNotice("");
		const ok = await copyText(cleanHtml);
		setNotice(ok ? "HTML tersalin ke clipboard." : "Gagal menyalin HTML.");
		setBusy(null);
	}

	async function handleDownload() {
		setBusy("download");
		setNotice("");
		try {
			const zip = new JSZip();
			zip.file("index.html", cleanHtml);
			const blob = await zip.generateAsync({ type: "blob" });
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = "studio-index-html.zip";
			document.body.appendChild(anchor);
			anchor.click();
			anchor.remove();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
			setNotice("File HTML mulai diunduh.");
		} catch {
			setNotice("Gagal menyiapkan unduhan.");
		}
		setBusy(null);
	}

	const frameHeight = 720;

	return (
		<section className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center gap-2 rounded-xl border border-graphite bg-charcoal p-3">
				<fieldset
					aria-label="Pilih viewport"
					className="m-0 flex gap-1 rounded-lg border border-graphite bg-onyx p-1"
				>
					{(Object.keys(VIEWPORT_WIDTH) as StudioViewport[]).map((key) => (
						<button
							key={key}
							type="button"
							aria-pressed={viewport === key}
							onClick={() => setViewport(key)}
							className={`rounded-md px-3 py-1.5 font-mono text-[11px] font-semibold transition-colors ${
								viewport === key
									? "bg-charcoal text-snow"
									: "text-fog hover:text-mist"
							}`}
						>
							{VIEWPORT_LABEL[key]}
						</button>
					))}
				</fieldset>
				<div
					role="tablist"
					aria-label="Mode canvas"
					className="flex gap-1 rounded-lg border border-graphite bg-onyx p-1"
				>
					<button
						type="button"
						role="tab"
						aria-selected={tab === "preview"}
						onClick={() => setTab("preview")}
						className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 font-mono text-[11px] font-semibold transition-colors ${
							tab === "preview"
								? "bg-charcoal text-snow"
								: "text-fog hover:text-mist"
						}`}
					>
						<Eye size={13} aria-hidden />
						Canvas Preview
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={tab === "code"}
						onClick={() => setTab("code")}
						className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 font-mono text-[11px] font-semibold transition-colors ${
							tab === "code"
								? "bg-charcoal text-snow"
								: "text-fog hover:text-mist"
						}`}
					>
						<Code2 size={13} aria-hidden />
						Inspect Code
					</button>
				</div>
				<div className="ml-auto flex gap-2">
					<button
						type="button"
						onClick={() => void handleCopy()}
						disabled={busy !== null}
						className="inline-flex items-center gap-1.5 rounded-full border border-graphite px-3 py-1.5 text-xs font-semibold text-snow transition-colors hover:bg-onyx disabled:opacity-50"
					>
						<Copy size={14} aria-hidden />
						{busy === "copy" ? "Menyalin…" : "Salin HTML"}
					</button>
					<button
						type="button"
						onClick={() => void handleDownload()}
						disabled={busy !== null}
						className="inline-flex items-center gap-1.5 rounded-full bg-snow px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-mist disabled:opacity-50"
					>
						<Download size={14} aria-hidden />
						{busy === "download" ? "Menyiapkan…" : "Download HTML"}
					</button>
				</div>
			</div>
			{notice ? (
				<output className="block text-xs text-fog">{notice}</output>
			) : null}

			{tab === "preview" ? (
				<div role="tabpanel" aria-label={`Preview ${title} v${version}`}>
					<div
						ref={wrapRef}
						className="w-full overflow-hidden rounded-xl border border-graphite bg-white"
						style={{ height: Math.max(1, Math.round(frameHeight * scale)) }}
					>
						<iframe
							title={`${title} v${version} (${VIEWPORT_LABEL[viewport]})`}
							srcDoc={cleanHtml}
							sandbox="allow-scripts"
							className="border-0"
							style={{
								width: frameWidth,
								height: frameHeight,
								transform: `scale(${scale})`,
								transformOrigin: "top left",
							}}
						/>
					</div>
				</div>
			) : (
				<div role="tabpanel" aria-label="Kode HTML studio">
					<pre className="max-h-[720px] overflow-auto rounded-xl border border-graphite bg-onyx p-5 font-mono text-xs leading-5 text-mist">
						{cleanHtml}
					</pre>
				</div>
			)}
		</section>
	);
}
