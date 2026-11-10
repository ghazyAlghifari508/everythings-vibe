"use client";

import {
	Alert02Icon,
	ArrowRight01Icon,
	Download01Icon,
	File01Icon,
	File02Icon,
	PencilEdit01Icon,
	Task01Icon,
	Tick01Icon,
} from "@hugeicons/core-free-icons";
import type { KeyboardEvent, MouseEvent } from "react";
import { Icon } from "@/components/ui/icon";
import {
	type CodebaseArtifactRef,
	formatFileSize,
} from "../explorer/codebase-file-card";

export type PlanningDocumentStageKind = "feature" | "prd" | "ac" | "tasks";

export interface CodebasePlanningDocumentRowProps {
	artifact: CodebaseArtifactRef;
	stageKind: PlanningDocumentStageKind;
	title: string;
	description: string;
	status?: "persisted" | "processing" | "error";
	isActive?: boolean;
	onOpen?: (artifact: CodebaseArtifactRef) => void;
	onDownload?: (artifact: CodebaseArtifactRef) => void;
	onRevise?: (artifact: CodebaseArtifactRef) => void;
}

function resolveDocumentIcon(stageKind: PlanningDocumentStageKind) {
	switch (stageKind) {
		case "feature":
			return File01Icon;
		case "prd":
			return File02Icon;
		case "ac":
		case "tasks":
			return Task01Icon;
	}
}

export function CodebasePlanningDocumentRow({
	artifact,
	stageKind,
	title,
	description,
	status = "persisted",
	isActive = false,
	onOpen,
	onDownload,
	onRevise,
}: CodebasePlanningDocumentRowProps) {
	const handleRowClick = () => {
		onOpen?.(artifact);
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			onOpen?.(artifact);
		}
	};

	const handleReviseClick = (event: MouseEvent<HTMLButtonElement>) => {
		event.stopPropagation();
		onRevise?.(artifact);
	};

	const handleDownloadClick = (event: MouseEvent<HTMLButtonElement>) => {
		event.stopPropagation();
		onDownload?.(artifact);
	};

	const DocumentIcon = resolveDocumentIcon(stageKind);
	const displayTitle = artifact.title ?? artifact.fileName;
	const hasRealSize =
		typeof artifact.fileSizeBytes === "number" &&
		Number.isFinite(artifact.fileSizeBytes) &&
		artifact.fileSizeBytes >= 0;

	return (
		<button
			type="button"
			onClick={handleRowClick}
			onKeyDown={handleKeyDown}
			data-testid="codebase-file-card"
			data-planning-row="true"
			data-artifact-id={artifact.id}
			data-stage-kind={stageKind}
			data-active={isActive}
			aria-label={`Buka preview ${displayTitle}`}
			className={`group relative flex w-full cursor-pointer items-center justify-between gap-3 px-3.5 py-3 text-left transition-colors select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo ${
				isActive ? "bg-indigo/10" : "bg-transparent hover:bg-white/[0.03]"
			}`}
		>
			<div className="flex min-w-0 flex-1 items-center gap-3">
				<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-graphite bg-charcoal text-snow/90">
					<Icon
						icon={DocumentIcon}
						size={16}
						strokeWidth={1.5}
						aria-hidden="true"
					/>
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<p
							data-testid="codebase-file-name"
							className="truncate text-xs font-semibold text-snow"
							title={artifact.fileName}
						>
							<span>{title}</span>
							{artifact.fileName && artifact.fileName !== title ? (
								<span className="ml-1.5 font-mono text-[11px] font-normal text-mist">
									({artifact.fileName})
								</span>
							) : null}
						</p>
					</div>
					<div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-fog">
						<span className="truncate">{description}</span>
						{hasRealSize ? (
							<>
								<span aria-hidden="true" className="text-slate">
									•
								</span>
								<span
									data-testid="codebase-file-size"
									className="shrink-0 font-mono text-[10px] text-mist"
								>
									{formatFileSize(artifact.fileSizeBytes as number)}
								</span>
							</>
						) : null}
					</div>
				</div>
			</div>

			<div className="flex shrink-0 items-center gap-2">
				{onRevise ? (
					<button
						type="button"
						onClick={handleReviseClick}
						data-testid={`codebase-document-revise-${stageKind}`}
						title={`Revisi ${title}`}
						aria-label={`Revisi ${title}`}
						className="inline-flex h-7 items-center gap-1 rounded border border-graphite bg-charcoal px-2 text-[11px] font-medium text-fog opacity-0 transition-opacity hover:border-steel hover:text-snow focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo group-hover:opacity-100"
					>
						<Icon
							icon={PencilEdit01Icon}
							size={12}
							strokeWidth={1.5}
							aria-hidden="true"
						/>
						<span>Revisi</span>
					</button>
				) : null}

				{onDownload ? (
					<button
						type="button"
						onClick={handleDownloadClick}
						data-testid={`codebase-document-download-${stageKind}`}
						title={`Unduh ${title}`}
						aria-label={`Unduh ${title}`}
						className="inline-flex h-7 w-7 items-center justify-center rounded border border-graphite bg-charcoal text-fog opacity-0 transition-opacity hover:border-steel hover:text-snow focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo group-hover:opacity-100"
					>
						<Icon
							icon={Download01Icon}
							size={13}
							strokeWidth={1.5}
							aria-hidden="true"
						/>
					</button>
				) : null}

				<div className="flex items-center gap-1.5 pl-1">
					{status === "persisted" ? (
						<output
							data-status="persisted"
							aria-label="Tersimpan"
							title="Tersimpan di server"
							className="flex h-5 w-5 items-center justify-center text-emerald"
						>
							<Icon
								icon={Tick01Icon}
								size={14}
								strokeWidth={2}
								aria-hidden="true"
							/>
						</output>
					) : status === "processing" ? (
						<output
							data-status="processing"
							aria-label="Sedang diproses"
							title="Sedang diproses"
							className="flex h-5 w-5 items-center justify-center text-indigo"
						>
							<span className="h-3 w-3 animate-spin rounded-full border-2 border-indigo border-t-transparent" />
						</output>
					) : status === "error" ? (
						<output
							data-status="error"
							aria-label="Gagal dimuat"
							title="Gagal dimuat"
							className="flex h-5 w-5 items-center justify-center text-crimson"
						>
							<Icon
								icon={Alert02Icon}
								size={14}
								strokeWidth={2}
								aria-hidden="true"
							/>
						</output>
					) : null}

					<Icon
						icon={ArrowRight01Icon}
						size={14}
						strokeWidth={1.75}
						className="text-slate transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-snow"
						aria-hidden="true"
					/>
				</div>
			</div>
		</button>
	);
}
