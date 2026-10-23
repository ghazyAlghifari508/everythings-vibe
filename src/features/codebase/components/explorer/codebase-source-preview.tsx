"use client";

import { useMemo, useState, useTransition } from "react";
import {
	buildSourceViewRows,
	type SourceToken,
	type SourceViewMode,
} from "@/features/codebase/services/source-view";
import { CODEBASE_FILE_PREVIEW_MAX_LINES } from "@/features/codebase/types/codebase-constants";

/** Where the complete source lives when the preview can only show part of it. */
const DEFAULT_TRUNCATION_HINT = "File lengkap tersedia di repository lokal.";

export interface CodebaseSourcePreviewProps {
	/** Repository-relative path of the snapshot file being inspected. */
	path: string;
	content: string;
	truncated: boolean;
	sizeBytes: number | null;
	onRetry?: () => void;
	/** Upper bound on rendered rows. A longer source is clipped and reported. */
	maxLines?: number;
	/**
	 * Height cap for the scrollable source area, in pixels. Without it the area
	 * fills its parent; with it the area shrinks to the content and scrolls
	 * once the content outgrows the cap.
	 */
	maxBodyHeight?: number;
	/** Where the full source can be obtained when the preview is clipped. */
	truncationHint?: string;
}

function formatSize(sizeBytes: number | null): string | null {
	if (sizeBytes === null || !Number.isFinite(sizeBytes) || sizeBytes < 0) {
		return null;
	}
	if (sizeBytes < 1024) return `${sizeBytes} B`;
	return `${(sizeBytes / 1024).toFixed(1)} KB`;
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
	maxLines = CODEBASE_FILE_PREVIEW_MAX_LINES,
	maxBodyHeight,
	truncationHint = DEFAULT_TRUNCATION_HINT,
}: CodebaseSourcePreviewProps) {
	const [mode, setMode] = useState<SourceViewMode>("original");
	const [pendingMode, setPendingMode] = useState<SourceViewMode | null>(null);
	const [activePath, setActivePath] = useState(path);
	const [isPending, startTransition] = useTransition();

	if (activePath !== path) {
		setActivePath(path);
		setMode("original");
		setPendingMode(null);
	}

	const activeMode = pendingMode ?? mode;

	const view = useMemo(
		() =>
			buildSourceViewRows({
				content,
				path,
				mode,
				maxLines,
			}),
		[content, path, mode, maxLines],
	);

	const handleModeChange = (next: SourceViewMode) => {
		if (next === mode && !pendingMode) return;
		setPendingMode(next);
		startTransition(() => {
			setMode(next);
			setPendingMode(null);
		});
	};

	const sizeLabel = formatSize(sizeBytes);
	const isClipped = truncated || view.truncatedLines;
	const truncationText = view.truncatedLines
		? `Pratinjau menampilkan ${view.rows.length.toLocaleString("id-ID")} dari ${view.totalLines.toLocaleString("id-ID")} baris.`
		: "Pratinjau dipotong agar tetap ringan.";

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
					{isPending ? (
						<span className="text-[10px] text-fog animate-pulse">
							Menyiapkan tampilan...
						</span>
					) : null}
				</p>
				{view.formattedAvailable ? (
					<fieldset className="flex rounded-md border border-graphite bg-obsidian p-0.5">
						<legend className="sr-only">Tampilan isi file</legend>
						{(["original", "formatted"] as const).map((option) => (
							<button
								key={option}
								type="button"
								onClick={() => handleModeChange(option)}
								aria-pressed={activeMode === option}
								data-testid={`codebase-source-mode-${option}`}
								className={`min-h-7 rounded px-2 text-[11px] font-medium capitalize transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo ${
									activeMode === option
										? "bg-steel/40 text-snow"
										: "text-fog hover:text-snow"
								}`}
							>
								{option === "original" ? "Asli" : "Terformat"}
							</button>
						))}
					</fieldset>
				) : null}
			</div>
			{isClipped ? (
				<output
					data-testid="codebase-source-truncated"
					className="block shrink-0 rounded-md border border-graphite bg-charcoal px-2.5 py-1.5 text-[11px] leading-4 text-fog"
				>
					{truncationText} {truncationHint}
				</output>
			) : null}
			<div
				data-testid="codebase-source-body"
				className={`min-h-0 overflow-auto rounded-md border border-graphite bg-charcoal${
					maxBodyHeight ? "" : " flex-1"
				}`}
				style={maxBodyHeight ? { maxHeight: maxBodyHeight } : undefined}
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
