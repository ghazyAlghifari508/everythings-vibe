"use client";

import { Check, Copy, Download, X } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";

interface CodebaseArtifactCanvasProps {
	fileName: string;
	badge: string;
	subnav?: ReactNode;
	isLoading?: boolean;
	error?: string | null;
	onRetry?: () => void;
	onDownload?: () => void;
	onClose: () => void;
	children: ReactNode;
}

export function CodebaseArtifactCanvas({
	fileName,
	badge,
	subnav,
	isLoading = false,
	error,
	onRetry,
	onDownload,
	onClose,
	children,
}: CodebaseArtifactCanvasProps) {
	const [copied, setCopied] = useState(false);
	const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const handleCopyFileName = async () => {
		try {
			if (!navigator.clipboard?.writeText) return;
			await navigator.clipboard.writeText(fileName);
			setCopied(true);
			if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
			copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
		} catch {
			return;
		}
	};

	return (
		<section
			aria-label="Artifact canvas"
			data-testid="codebase-artifact-canvas"
			className="flex h-full min-h-0 flex-col bg-charcoal"
		>
			<div className="shrink-0 border-b border-graphite bg-obsidian">
				<div className="flex items-center justify-between gap-3 px-3 py-2">
					<div className="flex min-w-0 flex-1 items-center gap-2">
						<span
							data-testid="codebase-canvas-filename"
							className="truncate font-mono text-[13px] font-semibold text-snow"
							title={fileName}
						>
							{fileName}
						</span>
						<span className="shrink-0 rounded border border-graphite bg-charcoal px-1.5 py-px font-mono text-[10px] font-medium uppercase text-fog">
							{badge}
						</span>
					</div>
					<div className="flex shrink-0 items-center gap-1.5">
						<button
							type="button"
							onClick={handleCopyFileName}
							aria-label={`Salin nama file ${fileName}`}
							title={copied ? "Tersalin" : "Salin nama file"}
							data-testid="codebase-canvas-copy"
							className="inline-flex h-7 w-7 items-center justify-center rounded border border-graphite bg-charcoal text-fog transition-colors hover:border-steel hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
						>
							{copied ? (
								<Check
									size={14}
									strokeWidth={1.75}
									aria-hidden="true"
									className="text-emerald"
								/>
							) : (
								<Copy size={14} strokeWidth={1.75} aria-hidden="true" />
							)}
						</button>
					{onDownload ? (
						<button
							type="button"
							onClick={onDownload}
							aria-label={`Unduh ${fileName}`}
							title="Unduh file"
							data-testid="codebase-canvas-download"
							className="inline-flex h-7 w-7 items-center justify-center rounded border border-graphite bg-charcoal text-fog transition-colors hover:border-steel hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
						>
							<Download size={14} strokeWidth={1.75} aria-hidden="true" />
						</button>
					) : (
						<span
							title="Unduh via panel konten"
							data-testid="codebase-canvas-download-hint"
							aria-hidden="true"
							className="inline-flex h-7 w-7 items-center justify-center rounded border border-graphite bg-charcoal text-slate"
						>
							<Download size={14} strokeWidth={1.75} aria-hidden="true" />
						</span>
					)}
						<button
							type="button"
							onClick={onClose}
							aria-label="Tutup preview"
							title="Tutup preview"
							data-testid="codebase-canvas-close"
							className="inline-flex h-7 w-7 items-center justify-center rounded border border-graphite bg-charcoal text-fog transition-colors hover:border-steel hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
						>
							<X size={14} strokeWidth={1.75} aria-hidden="true" />
						</button>
					</div>
				</div>
				{subnav ? (
					<div
						data-testid="codebase-canvas-subnav"
						className="flex items-center justify-between border-t border-graphite bg-charcoal px-3 py-2"
					>
						{subnav}
					</div>
				) : null}
			</div>
			<div
				data-testid="codebase-canvas-content"
				className="min-h-0 flex-1 overflow-y-auto bg-obsidian p-4"
			>
				{isLoading ? (
					<output
						data-testid="codebase-canvas-loading"
						className="flex flex-col gap-3"
					>
						<div className="h-5 w-2/3 animate-pulse rounded bg-graphite" />
						<div className="h-3 w-full animate-pulse rounded bg-graphite" />
						<div className="h-3 w-5/6 animate-pulse rounded bg-graphite" />
						<div className="h-3 w-4/6 animate-pulse rounded bg-graphite" />
						<p className="text-xs text-fog">Memuat preview...</p>
					</output>
				) : error ? (
					<div role="alert" data-testid="codebase-canvas-error">
						<p className="text-sm text-crimson">{error}</p>
						{onRetry ? (
							<button
								type="button"
								onClick={onRetry}
								className="mt-2 inline-flex min-h-11 items-center rounded-md border border-graphite bg-charcoal px-3 text-[13px] font-medium text-snow hover:border-steel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
							>
								Coba lagi
							</button>
						) : null}
					</div>
				) : (
					children
				)}
			</div>
		</section>
	);
}
