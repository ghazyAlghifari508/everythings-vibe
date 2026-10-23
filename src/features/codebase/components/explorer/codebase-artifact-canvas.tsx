"use client";

import {
	Cancel01Icon,
	Copy01Icon,
	Download01Icon,
	Tick01Icon,
} from "@hugeicons/core-free-icons";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";

interface CodebaseArtifactCanvasProps {
	fileName: string;
	badge: string;
	hideBadge?: boolean;
	contentScroll?: boolean;
	/**
	 * The active artifact's real content to copy. `null` means no complete
	 * content is available (loading, failed, or a truncated source preview):
	 * the copy action is disabled rather than copying a filename or a partial
	 * file as though it were whole.
	 */
	copyValue: string | null;
	/** Accessible label for the copy action; defaults to the artifact name. */
	copyLabel?: string;
	/** Explains why copy is unavailable when `copyValue` is null. */
	copyUnavailableReason?: string;
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
	hideBadge = false,
	contentScroll = true,
	copyValue,
	copyLabel,
	copyUnavailableReason,
	subnav,
	isLoading = false,
	error,
	onRetry,
	onDownload,
	onClose,
	children,
}: CodebaseArtifactCanvasProps) {
	const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
		"idle",
	);
	const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(
		() => () => {
			if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
		},
		[],
	);

	const scheduleReset = () => {
		if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
		copyTimeoutRef.current = setTimeout(() => setCopyState("idle"), 2000);
	};

	const handleCopy = async () => {
		if (copyValue === null) return;
		try {
			if (!navigator.clipboard?.writeText) {
				setCopyState("failed");
				scheduleReset();
				return;
			}
			await navigator.clipboard.writeText(copyValue);
			setCopyState("copied");
			scheduleReset();
		} catch {
			setCopyState("failed");
			scheduleReset();
		}
	};

	const copyDisabled = copyValue === null;
	const resolvedLabel = copyLabel ?? `Salin isi ${fileName}`;
	const copyTitle = copyDisabled
		? (copyUnavailableReason ?? "Isi belum tersedia untuk disalin")
		: copyState === "copied"
			? "Tersalin"
			: copyState === "failed"
				? "Gagal menyalin"
				: resolvedLabel;

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
						{!hideBadge ? (
							<span className="shrink-0 rounded border border-graphite bg-charcoal px-1.5 py-px font-mono text-[10px] font-medium uppercase text-fog">
								{badge}
							</span>
						) : null}
					</div>
					<div className="flex shrink-0 items-center gap-1.5">
						<button
							type="button"
							onClick={handleCopy}
							disabled={copyDisabled}
							aria-label={resolvedLabel}
							title={copyTitle}
							data-testid="codebase-canvas-copy"
							className="inline-flex h-7 w-7 items-center justify-center rounded border border-graphite bg-charcoal text-fog transition-colors hover:border-steel hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-graphite disabled:hover:text-fog"
						>
							{copyState === "copied" ? (
								<Icon
									icon={Tick01Icon}
									size={14}
									strokeWidth={1.75}
									aria-hidden="true"
									className="text-emerald"
								/>
							) : (
								<Icon
									icon={Copy01Icon}
									size={14}
									strokeWidth={1.75}
									aria-hidden="true"
									className={
										copyState === "failed" ? "text-crimson" : undefined
									}
								/>
							)}
						</button>
						{copyState === "failed" ? (
							<output
								data-testid="codebase-canvas-copy-error"
								className="font-mono text-[10px] text-crimson"
							>
								Gagal menyalin
							</output>
						) : null}
						{onDownload ? (
							<button
								type="button"
								onClick={onDownload}
								aria-label={`Unduh ${fileName}`}
								title="Unduh file"
								data-testid="codebase-canvas-download"
								className="inline-flex h-7 w-7 items-center justify-center rounded border border-graphite bg-charcoal text-fog transition-colors hover:border-steel hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
							>
								<Icon
									icon={Download01Icon}
									size={14}
									strokeWidth={1.75}
									aria-hidden="true"
								/>
							</button>
						) : (
							<span
								title="Unduh via panel konten"
								data-testid="codebase-canvas-download-hint"
								aria-hidden="true"
								className="inline-flex h-7 w-7 items-center justify-center rounded border border-graphite bg-charcoal text-slate"
							>
								<Icon
									icon={Download01Icon}
									size={14}
									strokeWidth={1.75}
									aria-hidden="true"
								/>
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
							<Icon
								icon={Cancel01Icon}
								size={14}
								strokeWidth={1.75}
								aria-hidden="true"
							/>
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
				className={`min-h-0 flex-1 bg-obsidian ${contentScroll ? "overflow-y-auto p-4" : "overflow-hidden"}`}
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
