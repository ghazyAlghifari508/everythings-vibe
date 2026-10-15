"use client";

import { Bot, Check, Code, Copy, Download, Eye } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { Components } from "react-markdown";
import Markdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface DesignMdSourcePanelProps {
	designMd: string;
	domain: string;
	onImplementAgent: () => void;
	// Mirrors the inspector: an archived document is still available, but it is
	// labelled as an archive instead of capture-verified output.
	inspectorSource?: "observed" | "unverified";
	// Explicit AI enrichment status: full narrative vs measurement-only fallback.
	enrichment?: "applied" | "unavailable";
	enrichmentDetail?: string;
	className?: string;
}

type SourceViewTab = "rendered" | "source";

const ICON_BUTTON_CLASS =
	"inline-flex size-8 items-center justify-center rounded-md border border-transparent text-fog transition-colors hover:border-graphite hover:bg-onyx hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo disabled:opacity-50";

const markdownComponents: Components = {
	a: ({ children, ...props }) => (
		<a
			{...props}
			target="_blank"
			rel="noreferrer noopener"
			className="text-indigo underline underline-offset-2"
		>
			{children}
		</a>
	),
	h1: ({ children, ...props }) => (
		<h1 {...props} className="mt-2 text-xl font-bold tracking-tight text-snow">
			{children}
		</h1>
	),
	h2: ({ children, ...props }) => (
		<h2
			{...props}
			className="mt-6 border-b border-graphite pb-2 text-lg font-bold tracking-tight text-snow"
		>
			{children}
		</h2>
	),
	h3: ({ children, ...props }) => (
		<h3 {...props} className="mt-5 text-base font-semibold text-snow">
			{children}
		</h3>
	),
	h4: ({ children, ...props }) => (
		<h4 {...props} className="mt-4 text-sm font-semibold text-mist">
			{children}
		</h4>
	),
	p: ({ children, ...props }) => (
		<p {...props} className="mt-2 text-sm leading-6 text-mist">
			{children}
		</p>
	),
	ul: ({ children, ...props }) => (
		<ul {...props} className="mt-2 list-disc space-y-1 pl-5 text-sm text-mist">
			{children}
		</ul>
	),
	ol: ({ children, ...props }) => (
		<ol
			{...props}
			className="mt-2 list-decimal space-y-1 pl-5 text-sm text-mist"
		>
			{children}
		</ol>
	),
	li: ({ children, ...props }) => (
		<li {...props} className="leading-6">
			{children}
		</li>
	),
	table: ({ children, ...props }) => (
		<div className="mt-3 overflow-x-auto rounded-lg border border-graphite">
			<table {...props} className="w-full min-w-[480px] text-xs">
				{children}
			</table>
		</div>
	),
	thead: ({ children, ...props }) => (
		<thead {...props} className="bg-onyx text-slate">
			{children}
		</thead>
	),
	th: ({ children, ...props }) => (
		<th
			{...props}
			className="border-b border-graphite px-3 py-2 text-left font-mono font-semibold"
		>
			{children}
		</th>
	),
	td: ({ children, ...props }) => (
		<td
			{...props}
			className="border-b border-graphite px-3 py-2 align-top font-mono text-mist last:border-b-0"
		>
			{children}
		</td>
	),
	code: ({ className, children, ...props }) => (
		<code
			{...props}
			className={cn(
				"rounded bg-onyx px-1 py-0.5 font-mono text-[11px] text-mist",
				className,
			)}
		>
			{children}
		</code>
	),
	pre: ({ children, ...props }) => (
		<pre
			{...props}
			className="mt-3 overflow-x-auto rounded-lg border border-graphite bg-onyx p-3 font-mono text-xs leading-5 text-mist"
		>
			{children}
		</pre>
	),
	blockquote: ({ children, ...props }) => (
		<blockquote
			{...props}
			className="mt-3 border-l-2 border-graphite pl-3 text-sm text-fog italic"
		>
			{children}
		</blockquote>
	),
};

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

function safeFilename(domain: string): string {
	const safe = domain.replace(/[^a-zA-Z0-9.-]/g, "-").toLowerCase();
	return `${safe || "site"}.md`;
}

export function DesignMdSourcePanel({
	designMd,
	domain,
	onImplementAgent,
	inspectorSource = "observed",
	enrichment,
	enrichmentDetail,
	className,
}: DesignMdSourcePanelProps) {
	const [notice, setNotice] = useState("");
	const [busy, setBusy] = useState(false);
	const [copied, setCopied] = useState(false);
	const [viewTab, setViewTab] = useState<SourceViewTab>("rendered");
	const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const panelBaseId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
	const renderedTabId = `${panelBaseId}-rendered-tab`;
	const sourceTabId = `${panelBaseId}-source-tab`;
	const renderedPanelId = `${panelBaseId}-rendered-panel`;
	const sourcePanelId = `${panelBaseId}-source-panel`;
	const renderedTabRef = useRef<HTMLButtonElement>(null);
	const sourceTabRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		return () => {
			if (copiedTimer.current) clearTimeout(copiedTimer.current);
		};
	}, []);

	async function handleCopy() {
		setBusy(true);
		setNotice("");
		const ok = await copyText(designMd);
		setNotice(
			ok
				? "DESIGN.md tersalin ke clipboard."
				: "Gagal menyalin. Blokir clipboard oleh browser.",
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
				safeFilename(domain),
				designMd,
				"text/markdown;charset=utf-8",
			);
			setNotice("DESIGN.md mulai diunduh.");
		} catch {
			setNotice("Gagal mengunduh file. Coba lagi.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<section
			aria-label="Sumber DESIGN.md"
			className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-graphite bg-charcoal ${className ?? ""}`}
		>
			<div className="flex flex-wrap items-center justify-between gap-2 border-b border-graphite bg-charcoal px-3 py-2">
				<span className="flex min-w-0 items-baseline gap-2">
					<span className="truncate font-mono text-xs font-semibold text-mist">
						DESIGN.md
					</span>
					<span className="truncate text-xs text-fog">
						{inspectorSource === "observed"
							? enrichment === "unavailable"
								? "Analisis AI belum lengkap"
								: "Sesuai evidence browser"
							: "Arsip: belum terverifikasi terhadap evidence"}
					</span>
				</span>
				<div className="flex shrink-0 flex-wrap items-center gap-1">
					<button
						type="button"
						onClick={() => void handleCopy()}
						disabled={busy}
						aria-label="Salin DESIGN.md"
						title="Salin DESIGN.md"
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
						aria-label="Download DESIGN.md"
						title="Download DESIGN.md"
						className={ICON_BUTTON_CLASS}
					>
						<Download size={15} aria-hidden />
					</button>
					<Button
						type="button"
						variant="default"
						size="sm"
						onClick={onImplementAgent}
						className="ml-1 gap-1.5"
					>
						<Bot size={14} aria-hidden />
						Implement ke AI Agent
					</Button>
				</div>
			</div>
			<div className="flex flex-wrap items-center gap-2 border-b border-graphite px-3 py-2">
				<div
					role="tablist"
					aria-label="Tampilan DESIGN.md"
					className="flex gap-1 rounded-lg border border-graphite bg-onyx p-1"
				>
					<button
						ref={renderedTabRef}
						id={renderedTabId}
						type="button"
						role="tab"
						aria-selected={viewTab === "rendered"}
						aria-controls={renderedPanelId}
						tabIndex={viewTab === "rendered" ? 0 : -1}
						onKeyDown={(event) => {
							if (["ArrowRight", "ArrowLeft", "End"].includes(event.key)) {
								event.preventDefault();
								setViewTab("source");
								sourceTabRef.current?.focus();
							}
						}}
						onClick={() => setViewTab("rendered")}
						className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo ${
							viewTab === "rendered"
								? "bg-charcoal text-snow"
								: "text-fog hover:text-mist"
						}`}
					>
						<Eye size={15} aria-hidden />
						<span>Rendered</span>
					</button>
					<button
						ref={sourceTabRef}
						id={sourceTabId}
						type="button"
						role="tab"
						aria-selected={viewTab === "source"}
						aria-controls={sourcePanelId}
						tabIndex={viewTab === "source" ? 0 : -1}
						onKeyDown={(event) => {
							if (["ArrowRight", "ArrowLeft", "Home"].includes(event.key)) {
								event.preventDefault();
								setViewTab("rendered");
								renderedTabRef.current?.focus();
							}
						}}
						onClick={() => setViewTab("source")}
						className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo ${
							viewTab === "source"
								? "bg-charcoal text-snow"
								: "text-fog hover:text-mist"
						}`}
					>
						<Code size={15} aria-hidden />
						<span>Source</span>
					</button>
				</div>
			</div>
			{inspectorSource === "observed" && enrichment === "unavailable" ? (
				<p className="block border-b border-graphite px-3 py-2 text-xs text-fog">
					Analisis AI belum lengkap
					{enrichmentDetail ? `: ${enrichmentDetail}` : "."} Token terukur di
					bawah lengkap dan tidak terpengaruh.
				</p>
			) : null}

			<div
				id={renderedPanelId}
				role="tabpanel"
				aria-labelledby={renderedTabId}
				hidden={viewTab !== "rendered"}
				className="min-h-0 min-w-0 flex-1 overflow-auto p-5"
			>
				<Markdown
					remarkPlugins={[remarkGfm]}
					rehypePlugins={[rehypeHighlight]}
					components={markdownComponents}
				>
					{designMd}
				</Markdown>
			</div>

			<pre
				id={sourcePanelId}
				role="tabpanel"
				aria-labelledby={sourceTabId}
				hidden={viewTab !== "source"}
				className="min-h-0 min-w-0 flex-1 overflow-auto bg-onyx p-5 font-mono text-xs leading-5 text-mist"
				style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
			>
				{designMd}
			</pre>

			{notice ? (
				<output className="block border-t border-graphite px-3 py-2 text-xs text-fog">
					{notice}
				</output>
			) : null}
		</section>
	);
}
