"use client";

import { Bot, Check, Copy, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export interface DesignMdSourcePanelProps {
	designMd: string;
	domain: string;
	onImplementAgent: () => void;
	className?: string;
}

const ICON_BUTTON_CLASS =
	"inline-flex size-8 items-center justify-center rounded-md border border-transparent text-fog transition-colors hover:border-graphite hover:bg-onyx hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo disabled:opacity-50";

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
	className,
}: DesignMdSourcePanelProps) {
	const [notice, setNotice] = useState("");
	const [busy, setBusy] = useState(false);
	const [copied, setCopied] = useState(false);
	const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
			ok ? "DESIGN.md tersalin ke clipboard." : "Gagal menyalin. Blokir clipboard oleh browser.",
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
			downloadFile(safeFilename(domain), designMd, "text/markdown;charset=utf-8");
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
			className={`flex min-h-0 flex-col overflow-hidden rounded-xl border border-graphite bg-charcoal ${className ?? ""}`}
		>
			<div className="flex flex-wrap items-center justify-between gap-2 border-b border-graphite bg-charcoal px-3 py-2">
				<span className="truncate font-mono text-xs font-semibold text-mist">
					DESIGN.md
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

			<pre className="min-h-0 flex-1 overflow-auto bg-onyx p-5 font-mono text-xs leading-5 text-mist">
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
