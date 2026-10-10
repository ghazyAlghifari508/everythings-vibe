"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import {
	buildFencedSource,
	detectSourceLanguage,
	limitPreviewLines,
	sourceFileName,
} from "@/lib/codebase-source-preview";

export interface CodebaseSourcePreviewProps {
	/** Repository-relative path of the snapshot file being inspected. */
	path: string;
	content: string;
	truncated: boolean;
	sizeBytes: number | null;
	onRetry?: () => void;
}

const LINE_HEIGHT_CLASS = "text-[12px] leading-[20px]";

function formatSize(sizeBytes: number | null): string | null {
	if (sizeBytes === null || !Number.isFinite(sizeBytes) || sizeBytes < 0) {
		return null;
	}
	if (sizeBytes < 1024) return `${sizeBytes} B`;
	return `${(sizeBytes / 1024).toFixed(1)} KB`;
}

function CopyAction({
	label,
	value,
	testId,
}: {
	label: string;
	value: string;
	testId: string;
}) {
	const [copied, setCopied] = useState(false);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(
		() => () => {
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
		},
		[],
	);

	const handleCopy = async () => {
		try {
			if (!navigator.clipboard?.writeText) return;
			await navigator.clipboard.writeText(value);
			setCopied(true);
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
			timeoutRef.current = setTimeout(() => setCopied(false), 2000);
		} catch {
			return;
		}
	};

	return (
		<button
			type="button"
			onClick={() => void handleCopy()}
			aria-label={label}
			title={label}
			data-testid={testId}
			className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded border border-graphite bg-charcoal px-2 text-[11px] text-fog transition-colors hover:border-steel hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
		>
			{copied ? (
				<Check
					size={12}
					strokeWidth={1.75}
					aria-hidden="true"
					className="text-emerald"
				/>
			) : (
				<Copy size={12} strokeWidth={1.75} aria-hidden="true" />
			)}
			<span className={copied ? "text-emerald" : undefined}>
				{copied ? "Tersalin" : "Salin"}
			</span>
		</button>
	);
}

export function CodebaseSourcePreview({
	path,
	content,
	truncated,
	sizeBytes,
	onRetry,
}: CodebaseSourcePreviewProps) {
	const language = useMemo(() => detectSourceLanguage(path), [path]);
	const fenced = useMemo(
		() => buildFencedSource(content, language),
		[content, language],
	);
	const { lines, truncated: linesTruncated } = useMemo(
		() => limitPreviewLines(content.split("\n")),
		[content],
	);
	const sizeLabel = formatSize(sizeBytes);
	const lineCount = lines.length;
	const gutter = Array.from({ length: lineCount }, (_, index) => index + 1);

	return (
		<div
			data-testid="codebase-source-preview"
			className="flex h-full min-h-0 flex-col gap-3"
		>
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div className="min-w-0">
					<p
						data-testid="codebase-source-filename"
						className="truncate text-sm font-semibold text-snow"
						title={sourceFileName(path)}
					>
						{sourceFileName(path)}
					</p>
					<p
						data-testid="codebase-source-path"
						className="mt-0.5 break-all font-mono text-[11px] text-fog"
					>
						{path}
					</p>
					<p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-slate">
						{[language ?? "teks", sizeLabel].filter(Boolean).join(" • ")}
						{` • ${lineCount} baris`}
					</p>
				</div>
				<CopyAction
					label={`Salin isi ${sourceFileName(path)}`}
					value={content}
					testId="codebase-source-copy"
				/>
			</div>
			{truncated || linesTruncated ? (
				<output
					data-testid="codebase-source-truncated"
					className="block rounded-lg border border-graphite bg-charcoal px-3 py-2 text-[11px] leading-5 text-fog"
				>
					Pratinjau dipotong agar tetap ringan. File lengkap tersedia di
					repository lokal.
				</output>
			) : null}
			<div
				data-testid="codebase-source-body"
				className="min-h-0 flex-1 overflow-auto rounded-lg border border-graphite bg-charcoal"
			>
				<div className="flex min-w-full items-start">
					<pre
						aria-hidden="true"
						data-testid="codebase-source-linenumbers"
						className={`sticky left-0 shrink-0 select-none border-r border-graphite bg-obsidian px-2 py-3 text-right font-mono ${LINE_HEIGHT_CLASS} text-slate tabular-nums`}
					>
						{gutter.join("\n")}
					</pre>
					<div className="codebase-source-code min-w-0 flex-1">
						<Markdown
							rehypePlugins={[rehypeHighlight]}
							components={{
								pre: ({ children }) => <>{children}</>,
								code: ({ className, children }) => (
									<code className={`font-mono ${className ?? ""}`}>
										{children}
									</code>
								),
							}}
						>
							{fenced}
						</Markdown>
					</div>
				</div>
			</div>
			{onRetry ? (
				<button
					type="button"
					onClick={onRetry}
					className="w-fit rounded-md border border-graphite px-3 py-1.5 text-[11px] text-snow hover:border-steel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					Muat ulang
				</button>
			) : null}
		</div>
	);
}
