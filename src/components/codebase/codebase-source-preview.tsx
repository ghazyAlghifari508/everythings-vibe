"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { sourceFileName } from "@/lib/codebase-source-preview";
import {
	buildSourceViewRows,
	type SourceToken,
	type SourceViewMode,
} from "@/lib/codebase-source-view";
import { CODEBASE_FILE_PREVIEW_MAX_LINES } from "@/lib/constants";

export interface CodebaseSourcePreviewProps {
	/** Repository-relative path of the snapshot file being inspected. */
	path: string;
	content: string;
	truncated: boolean;
	sizeBytes: number | null;
	onRetry?: () => void;
}

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

/**
 * Read-only source viewer.
 *
 * Every visible line is one row rendered from the same record that supplies its
 * number, so a wrapped line, an empty line, and a truncated file all stay
 * aligned without depending on matching heights in two separate blocks.
 *
 * Copying always uses the original file content, never the formatted view.
 */
/**
 * Each run gets a key from its character offset within the row. Offsets are
 * unique and derive from the content itself, so no array index is used as a key.
 */
function renderRowTokens(tokens: readonly SourceToken[]) {
	let offset = 0;
	return tokens.map((token) => {
		const key = offset;
		offset += token.text.length;
		return (
			<span key={key} className={token.className ?? undefined}>
				{token.text}
			</span>
		);
	});
}

export function CodebaseSourcePreview({
	path,
	content,
	truncated,
	sizeBytes,
	onRetry,
}: CodebaseSourcePreviewProps) {
	const [mode, setMode] = useState<SourceViewMode>("original");

	const view = useMemo(
		() =>
			buildSourceViewRows({
				content,
				path,
				mode,
				maxLines: CODEBASE_FILE_PREVIEW_MAX_LINES,
			}),
		[content, path, mode],
	);
	const sizeLabel = formatSize(sizeBytes);
	const name = sourceFileName(path);
	const isClipped = truncated || view.truncatedLines;

	return (
		<div
			data-testid="codebase-source-preview"
			className="flex h-full min-h-0 flex-col gap-2"
		>
			<div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
				<p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-fog">
					<span className="text-mist">{view.language ?? "teks"}</span>
					{sizeLabel ? <span>{sizeLabel}</span> : null}
					<span data-testid="codebase-source-linecount">
						{view.totalLines.toLocaleString("id-ID")} baris
					</span>
				</p>
				<div className="flex items-center gap-1.5">
					{view.formattedAvailable ? (
						<fieldset className="flex rounded-md border border-graphite bg-obsidian p-0.5">
							<legend className="sr-only">Tampilan isi file</legend>
							{(["original", "formatted"] as const).map((option) => (
								<button
									key={option}
									type="button"
									onClick={() => setMode(option)}
									aria-pressed={view.mode === option}
									data-testid={`codebase-source-mode-${option}`}
									className={`min-h-7 rounded px-2 text-[11px] font-medium capitalize transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo ${
										view.mode === option
											? "bg-steel/40 text-snow"
											: "text-fog hover:text-snow"
									}`}
								>
									{option === "original" ? "Asli" : "Terformat"}
								</button>
							))}
						</fieldset>
					) : null}
					<CopyAction
						label={`Salin isi asli ${name}`}
						value={content}
						testId="codebase-source-copy"
					/>
				</div>
			</div>
			{isClipped ? (
				<output
					data-testid="codebase-source-truncated"
					className="block shrink-0 rounded-md border border-graphite bg-charcoal px-2.5 py-1.5 text-[11px] leading-4 text-fog"
				>
					Pratinjau dipotong agar tetap ringan. File lengkap tersedia di
					repository lokal.
				</output>
			) : null}
			<div
				data-testid="codebase-source-body"
				className="min-h-0 flex-1 overflow-auto rounded-md border border-graphite bg-charcoal"
			>
				<div
					data-testid="codebase-source-rows"
					className="flex w-max min-w-full font-mono text-[12px] leading-5"
				>
					<div
						aria-hidden="true"
						data-testid="codebase-source-linenumbers"
						className="sticky left-0 z-10 shrink-0 select-none border-r border-graphite bg-obsidian py-2 pl-2 pr-2 text-right text-slate tabular-nums"
					>
						{view.rows.map((row) => (
							<div key={row.lineNumber}>{row.lineNumber}</div>
						))}
					</div>
					<div className="codebase-source-code min-w-0 py-2 pr-3">
						{view.rows.map((row) => (
							<div
								key={row.lineNumber}
								data-testid="codebase-source-row"
								data-line={row.lineNumber}
								className={
									view.softWrap
										? "whitespace-pre-wrap break-words pl-3"
										: "whitespace-pre pl-3"
								}
							>
								{renderRowTokens(row.tokens)}
							</div>
						))}
					</div>
				</div>
			</div>
			{onRetry ? (
				<button
					type="button"
					onClick={onRetry}
					className="w-fit shrink-0 rounded-md border border-graphite px-3 py-1.5 text-[11px] text-snow hover:border-steel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					Muat ulang
				</button>
			) : null}
		</div>
	);
}
