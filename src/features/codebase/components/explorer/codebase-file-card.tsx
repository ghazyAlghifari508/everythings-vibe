"use client";

import { ArrowRight01Icon, File01Icon } from "@hugeicons/core-free-icons";
import type { KeyboardEvent } from "react";
import { Icon } from "@/components/ui/icon";

export interface CodebaseArtifactRef {
	id: string;
	fileName: string;
	fileSizeBytes: number | null;
	badge: string;
	description: string;
	title?: string;
}

export interface CodebaseFileCardProps {
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
}: CodebaseFileCardProps) {
	const openArtifact = () => onOpen?.(artifact);

	const handleOpenKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
		if (event.key !== "Enter" && event.key !== " ") return;
		event.preventDefault();
		openArtifact();
	};

	const displayTitle = artifact.title ?? artifact.fileName;
	const hasRealSize =
		typeof artifact.fileSizeBytes === "number" &&
		Number.isFinite(artifact.fileSizeBytes) &&
		artifact.fileSizeBytes >= 0;

	const content = (
		<>
			<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-graphite bg-obsidian text-indigo">
				<Icon
					icon={File01Icon}
					size={18}
					strokeWidth={1.75}
					aria-hidden="true"
				/>
			</div>
			<div className="min-w-0 flex-1 text-left">
				<p
					data-testid="codebase-file-name"
					className="truncate font-mono text-[13px] font-semibold text-snow"
					title={artifact.fileName}
				>
					{displayTitle}
				</p>
				<div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-fog">
					<span className="truncate">
						{artifact.description || "Dokumen siap"}
					</span>
					{hasRealSize ? (
						<>
							<span aria-hidden="true">•</span>
							<span
								data-testid="codebase-file-size"
								className="font-mono text-[10px]"
							>
								{formatFileSize(artifact.fileSizeBytes as number)}
							</span>
						</>
					) : null}
				</div>
			</div>
			<Icon
				icon={ArrowRight01Icon}
				size={16}
				strokeWidth={1.75}
				className="shrink-0 text-slate transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-snow"
				aria-hidden="true"
			/>
		</>
	);

	if (onOpen) {
		return (
			<button
				type="button"
				onClick={openArtifact}
				onKeyDown={handleOpenKeyDown}
				aria-label={`Buka preview ${displayTitle}`}
				data-testid="codebase-file-card"
				data-artifact-id={artifact.id}
				data-active={active}
				className={`group my-2 flex w-full max-w-md cursor-pointer items-center justify-between gap-3 rounded-xl border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo ${
					active
						? "border-indigo bg-indigo/10"
						: "border-graphite bg-charcoal hover:border-steel hover:bg-obsidian/70"
				}`}
			>
				{content}
			</button>
		);
	}

	return (
		<div
			data-testid="codebase-file-card"
			data-artifact-id={artifact.id}
			data-active={active}
			className={`my-2 flex w-full max-w-md items-center justify-between gap-3 rounded-xl border p-2.5 transition-colors ${
				active ? "border-indigo bg-indigo/10" : "border-graphite bg-charcoal"
			}`}
		>
			{content}
		</div>
	);
}
