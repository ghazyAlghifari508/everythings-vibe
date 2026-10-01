"use client";

import { Download, FileText } from "lucide-react";
import type { KeyboardEvent, MouseEvent } from "react";

export interface CodebaseArtifactRef {
	id: string;
	fileName: string;
	fileSizeBytes: number | null;
	badge: string;
	description: string;
}

interface CodebaseFileCardProps {
	artifact: CodebaseArtifactRef;
	active?: boolean;
	onOpen?: (artifact: CodebaseArtifactRef) => void;
	onDownload?: (artifact: CodebaseArtifactRef) => void;
}

export function formatFileSize(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
	if (bytes < 1024) return `${bytes} B`;
	const kb = bytes / 1024;
	if (kb < 1024) return `${kb.toFixed(1)} KB`;
	return `${(kb / 1024).toFixed(1)} MB`;
}

export function CodebaseFileCard({
	artifact,
	active = false,
	onOpen,
	onDownload,
}: CodebaseFileCardProps) {
	const openArtifact = () => onOpen?.(artifact);

	const handleOpenKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
		if (event.key !== "Enter" && event.key !== " ") return;
		event.preventDefault();
		openArtifact();
	};

	const handleDownloadClick = (event: MouseEvent<HTMLButtonElement>) => {
		event.stopPropagation();
		onDownload?.(artifact);
	};

	const content = (
		<>
			<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-graphite bg-obsidian text-indigo">
				<FileText size={20} strokeWidth={1.75} aria-hidden="true" />
			</div>
			<div className="min-w-0 text-left">
				<p
					data-testid="codebase-file-name"
					className="truncate font-mono text-[13px] font-semibold text-snow"
					title={artifact.fileName}
				>
					{artifact.fileName}
				</p>
				<div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-fog">
					<span className="rounded border border-graphite bg-obsidian px-1.5 py-px font-mono text-[10px] font-medium uppercase text-fog">
						{artifact.badge}
					</span>
					<span aria-hidden="true">•</span>
					<span data-testid="codebase-file-size">
						{typeof artifact.fileSizeBytes === "number"
							? formatFileSize(artifact.fileSizeBytes)
							: "Ukuran menyusul"}
					</span>
				</div>
				<p className="mt-0.5 truncate text-[11px] text-slate">
					{artifact.description}
				</p>
			</div>
		</>
	);

	return (
		<div
			data-testid="codebase-file-card"
			data-artifact-id={artifact.id}
			data-active={active}
			className={`my-3 flex w-full max-w-md items-center justify-between gap-2 rounded-xl border p-2 transition-colors ${
				active
					? "border-indigo bg-indigo/10"
					: "border-graphite bg-charcoal hover:border-steel"
			}`}
		>
			{onOpen ? (
				<button
					type="button"
					onClick={openArtifact}
					onKeyDown={handleOpenKeyDown}
					aria-label={`Buka preview ${artifact.fileName}`}
					className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg px-1.5 text-left hover:bg-obsidian focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					{content}
				</button>
			) : (
				<div className="flex min-h-11 min-w-0 flex-1 items-center gap-3 px-1.5">
					{content}
				</div>
			)}
		<button
			type="button"
			onClick={handleDownloadClick}
			aria-label={`Unduh ${artifact.fileName}`}
			title="Unduh file"
			data-testid="codebase-file-download"
			disabled={!onDownload}
			className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-graphite bg-obsidian px-3 py-1.5 text-[13px] font-medium text-snow transition-colors hover:border-steel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo disabled:cursor-not-allowed disabled:opacity-50"
		>
				<Download size={15} strokeWidth={1.75} aria-hidden="true" />
				<span>Unduh</span>
			</button>
		</div>
	);
}
