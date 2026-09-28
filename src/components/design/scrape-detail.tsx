import JSZip from "jszip";
import { Copy, Download, FileCode2, Globe } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface ScrapeDetailProps {
	sourceUrl: string;
	domain: string;
	previewHtml: string;
	designMd: string;
	capturedAt?: string;
}

type DetailTab = "preview" | "design";

const PREVIEW_WIDTH = 1440;

function zipFilename(domain: string): string {
	const safe = domain.replace(/[^a-zA-Z0-9.-]/g, "-").toLowerCase();
	return `design-system-${safe || "site"}.zip`;
}

async function copyText(value: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(value);
		return true;
	} catch {
		return false;
	}
}

async function downloadZip(domain: string, previewHtml: string, designMd: string) {
	const zip = new JSZip();
	zip.file("index.html", previewHtml);
	zip.file("design.md", designMd);
	const blob = await zip.generateAsync({ type: "blob" });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = zipFilename(domain);
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ScrapeDetail({
	sourceUrl,
	domain,
	previewHtml,
	designMd,
	capturedAt,
}: ScrapeDetailProps) {
	const [tab, setTab] = useState<DetailTab>("preview");
	const [notice, setNotice] = useState("");
	const [busy, setBusy] = useState<"copy-html" | "copy-md" | "zip" | null>(null);

	async function handleCopy(kind: "copy-html" | "copy-md") {
		setBusy(kind);
		setNotice("");
		const ok = await copyText(kind === "copy-html" ? previewHtml : designMd);
		setNotice(
			ok
				? kind === "copy-html"
					? "HTML tersalin ke clipboard."
					: "DESIGN.md tersalin ke clipboard."
				: "Gagal menyalin. Blokir clipboard oleh browser.",
		);
		setBusy(null);
	}

	async function handleZip() {
		setBusy("zip");
		setNotice("");
		try {
			await downloadZip(domain, previewHtml, designMd);
			setNotice("ZIP berisi 2 file mulai diunduh.");
		} catch {
			setNotice("Gagal membuat ZIP. Coba lagi.");
		}
		setBusy(null);
	}

	return (
		<section className="flex flex-col gap-4">
			<header className="flex flex-col gap-3 rounded-xl border border-graphite bg-charcoal p-5">
				<div className="flex flex-wrap items-center gap-2">
					<span className="inline-flex items-center gap-1.5 rounded-md border border-graphite bg-onyx px-2 py-1 font-mono text-xs text-mist">
						<Globe size={14} aria-hidden />
						{domain}
					</span>
					<span className="truncate font-mono text-xs text-fog">{sourceUrl}</span>
					{capturedAt ? (
						<span className="font-mono text-xs text-fog">{capturedAt}</span>
					) : null}
				</div>
				<div className="flex flex-wrap gap-2">
					<button
						type="button"
						onClick={() => void handleCopy("copy-md")}
						disabled={busy !== null}
						className="inline-flex items-center gap-1.5 rounded-full bg-snow px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-mist disabled:opacity-50"
					>
						<Copy size={14} aria-hidden />
						{busy === "copy-md" ? "Menyalin…" : "Salin DESIGN.md"}
					</button>
					<button
						type="button"
						onClick={() => void handleCopy("copy-html")}
						disabled={busy !== null}
						className="inline-flex items-center gap-1.5 rounded-full border border-graphite px-3 py-1.5 text-xs font-semibold text-snow transition-colors hover:bg-onyx disabled:opacity-50"
					>
						<FileCode2 size={14} aria-hidden />
						{busy === "copy-html" ? "Menyalin…" : "Salin HTML"}
					</button>
					<button
						type="button"
						onClick={() => void handleZip()}
						disabled={busy !== null}
						className="inline-flex items-center gap-1.5 rounded-full border border-graphite px-3 py-1.5 text-xs font-semibold text-snow transition-colors hover:bg-onyx disabled:opacity-50"
					>
						<Download size={14} aria-hidden />
						{busy === "zip" ? "Menyiapkan…" : "Download ZIP (2 File)"}
					</button>
				</div>
				{notice ? (
					<p role="status" className="text-xs text-fog">
						{notice}
					</p>
				) : null}
			</header>

			<div
				role="tablist"
				aria-label="File hasil scrape"
				className="flex gap-1 rounded-lg border border-graphite bg-onyx p-1"
			>
				<button
					type="button"
					role="tab"
					aria-selected={tab === "preview"}
					onClick={() => setTab("preview")}
					className={`flex-1 rounded-md px-3 py-2 font-mono text-xs font-semibold transition-colors ${
						tab === "preview"
							? "bg-charcoal text-snow"
							: "text-fog hover:text-mist"
					}`}
				>
					index.html
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={tab === "design"}
					onClick={() => setTab("design")}
					className={`flex-1 rounded-md px-3 py-2 font-mono text-xs font-semibold transition-colors ${
						tab === "design" ? "bg-charcoal text-snow" : "text-fog hover:text-mist"
					}`}
				>
					design.md
				</button>
			</div>

			{tab === "preview" ? (
				<div role="tabpanel" aria-label="Preview index.html">
					<p className="mb-2 font-mono text-[11px] text-fog">
						Preview index.html (1440px Desktop, skala menyesuaikan layar)
					</p>
					<DesktopPreview title={`Preview ${domain}`} srcDoc={previewHtml} />
				</div>
			) : (
				<div role="tabpanel" aria-label="Isi design.md">
					<p className="mb-2 font-mono text-[11px] text-fog">
						design.md (Tokens &amp; System)
					</p>
					<pre className="max-h-[720px] overflow-auto rounded-xl border border-graphite bg-onyx p-5 font-mono text-xs leading-5 text-mist">
						{designMd}
					</pre>
				</div>
			)}
		</section>
	);
}

function DesktopPreview({ title, srcDoc }: { title: string; srcDoc: string }) {
	const wrapRef = useRef<HTMLDivElement>(null);
	const [scale, setScale] = useState(1);

	useEffect(() => {
		const el = wrapRef.current;
		if (!el || typeof ResizeObserver === "undefined") return;
		const measure = () =>
			setScale(Math.min(1, el.clientWidth / PREVIEW_WIDTH));
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	const frameHeight =
		Math.round(
			(typeof window !== "undefined" ? window.innerHeight : 900) * 0.82,
		) || 738;

	return (
		<div
			ref={wrapRef}
			className="w-full overflow-hidden rounded-xl border border-graphite bg-white"
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
