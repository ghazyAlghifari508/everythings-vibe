"use client";

import {
	Cancel01Icon,
	File01Icon,
	FileCodeIcon,
	Search01Icon,
} from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import type {
	ComposerArtifactMentionCandidate,
	ComposerFileMentionCandidate,
	ComposerMentionCandidate,
	ComposerSlashCommandItem,
} from "@/features/codebase/services/composer-interactions";

interface CodebaseComposerMentionPopoverProps {
	isOpen: boolean;
	searchQuery: string;
	documents: readonly ComposerArtifactMentionCandidate[];
	files: readonly ComposerFileMentionCandidate[];
	activeIndex: number;
	onSearchChange: (value: string) => void;
	onSelectCandidate: (candidate: ComposerMentionCandidate) => void;
	onClose: () => void;
}

const MAX_VISIBLE_FILES = 30;

export function CodebaseComposerMentionPopover({
	isOpen,
	searchQuery,
	documents,
	files,
	activeIndex,
	onSearchChange,
	onSelectCandidate,
	onClose,
}: CodebaseComposerMentionPopoverProps) {
	if (!isOpen) return null;

	const visibleFiles = files.slice(0, MAX_VISIBLE_FILES);

	return (
		<div
			data-testid="composer-mention-popover"
			data-composer-interactive="true"
			role="dialog"
			aria-label="Referensi dokumen dan file"
			className="mb-2 w-full max-w-md overflow-hidden rounded-lg border border-graphite bg-obsidian text-snow shadow-lg"
		>
			<div className="flex items-center gap-2 border-b border-graphite px-3 py-2">
				<Icon
					icon={Search01Icon}
					size={14}
					aria-hidden="true"
					className="shrink-0 text-slate"
				/>
				<input
					type="text"
					value={searchQuery}
					onChange={(e) => onSearchChange(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Escape") {
							e.preventDefault();
							onClose();
						}
					}}
					placeholder="Cari dokumen atau file..."
					aria-label="Cari dokumen atau file"
					data-testid="composer-mention-search"
					className="min-w-0 flex-1 bg-transparent text-xs text-snow outline-none placeholder:text-slate"
				/>
				<button
					type="button"
					onClick={onClose}
					aria-label="Tutup daftar referensi"
					className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate hover:text-snow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo"
				>
					<Icon icon={Cancel01Icon} size={12} aria-hidden="true" />
				</button>
			</div>

			<div
				role="listbox"
				aria-label="Pilihan referensi"
				className="max-h-60 overflow-y-auto p-1.5"
			>
				{documents.length > 0 ? (
					<div data-testid="composer-mention-documents-group">
						<div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate">
							Dokumen Planning
						</div>
						{documents.map((doc, idx) => {
							const isSelected = idx === activeIndex;
							return (
								<button
									key={doc.key}
									type="button"
									role="option"
									aria-selected={isSelected}
									data-testid={`composer-mention-doc-${doc.targetKind}`}
									data-active={isSelected ? "true" : undefined}
									onClick={() => onSelectCandidate(doc)}
									className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
										isSelected
											? "bg-white/10 text-snow"
											: "text-fog hover:bg-white/5 hover:text-snow"
									}`}
								>
									<span className="flex min-w-0 items-center gap-2">
										<Icon
											icon={File01Icon}
											size={13}
											aria-hidden="true"
											className="shrink-0 text-indigo-300"
										/>
										<span className="truncate font-medium text-snow">
											{doc.label}
										</span>
										<span className="shrink-0 font-mono text-[10px] text-slate">
											{doc.mentionAlias}
										</span>
									</span>
									<span className="shrink-0 text-[10px] text-slate">
										{doc.available ? doc.fileName : "Belum dibuat"}
									</span>
								</button>
							);
						})}
					</div>
				) : null}

				<div
					data-testid="composer-mention-files-group"
					className={
						documents.length > 0 ? "mt-1.5 border-t border-graphite pt-1.5" : ""
					}
				>
					<div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate">
						File Repository
					</div>
					{visibleFiles.length > 0 ? (
						visibleFiles.map((file, idx) => {
							const globalIdx = documents.length + idx;
							const isSelected = globalIdx === activeIndex;
							return (
								<button
									key={file.key}
									type="button"
									role="option"
									aria-selected={isSelected}
									data-testid={`composer-mention-file-${file.path}`}
									data-active={isSelected ? "true" : undefined}
									onClick={() => onSelectCandidate(file)}
									className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
										isSelected
											? "bg-white/10 text-snow"
											: "text-fog hover:bg-white/5 hover:text-snow"
									}`}
								>
									<span className="flex min-w-0 items-center gap-2">
										<Icon
											icon={FileCodeIcon}
											size={13}
											aria-hidden="true"
											className="shrink-0 text-slate"
										/>
										<span className="truncate font-mono text-[11.5px] text-snow">
											{file.path}
										</span>
									</span>
								</button>
							);
						})
					) : (
						<p className="px-2 py-1.5 text-xs text-slate">
							Tidak ada file repository yang cocok.
						</p>
					)}
				</div>
			</div>
		</div>
	);
}

interface CodebaseComposerSlashPopoverProps {
	isOpen: boolean;
	commands: readonly ComposerSlashCommandItem[];
	activeIndex: number;
	canSwitchToPlan: boolean;
	onSelectCommand: (command: ComposerSlashCommandItem) => void;
}

export function CodebaseComposerSlashPopover({
	isOpen,
	commands,
	activeIndex,
	canSwitchToPlan,
	onSelectCommand,
}: CodebaseComposerSlashPopoverProps) {
	if (!isOpen || commands.length === 0) return null;

	return (
		<div
			data-testid="composer-slash-menu"
			data-composer-interactive="true"
			role="listbox"
			aria-label="Commands"
			className="mb-2 w-full max-w-sm overflow-hidden rounded-lg border border-graphite bg-obsidian p-1.5 text-snow shadow-lg"
		>
			<div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate">
				Commands
			</div>
			{commands.map((cmd, idx) => {
				const isSelected = idx === activeIndex;
				const isPlanLocked = cmd.id === "plan" && !canSwitchToPlan;
				return (
					<button
						key={cmd.id}
						type="button"
						role="option"
						aria-selected={isSelected}
						aria-disabled={isPlanLocked ? "true" : undefined}
						data-testid={`composer-slash-item-${cmd.id}`}
						data-active={isSelected ? "true" : undefined}
						onClick={() => onSelectCommand(cmd)}
						className={`flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
							isSelected
								? "bg-white/10 text-snow"
								: "text-fog hover:bg-white/5 hover:text-snow"
						} ${isPlanLocked ? "opacity-50" : ""}`}
					>
						<span className="font-mono font-semibold text-snow">
							{cmd.command}
						</span>
						<span className="truncate text-fog">{cmd.label}</span>
					</button>
				);
			})}
		</div>
	);
}

interface CodebaseComposerCommandHelpProps {
	isOpen: boolean;
	commands: readonly ComposerSlashCommandItem[];
	onSelectCommand: (command: ComposerSlashCommandItem) => void;
	onClose: () => void;
}

export function CodebaseComposerCommandHelp({
	isOpen,
	commands,
	onSelectCommand,
	onClose,
}: CodebaseComposerCommandHelpProps) {
	if (!isOpen) return null;

	return (
		<section
			data-testid="composer-command-help"
			data-composer-interactive="true"
			aria-label="Bantuan perintah composer"
			className="mb-2 rounded-lg border border-graphite bg-obsidian p-3 text-xs text-snow"
		>
			<div className="flex items-center justify-between gap-2">
				<span className="font-semibold text-snow">Perintah & Referensi</span>
				<button
					type="button"
					onClick={onClose}
					aria-label="Tutup bantuan perintah"
					data-testid="composer-command-help-close"
					className="inline-flex h-5 w-5 items-center justify-center rounded text-slate hover:text-snow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo"
				>
					<Icon icon={Cancel01Icon} size={12} aria-hidden="true" />
				</button>
			</div>
			<div className="mt-2 space-y-1">
				{commands.map((cmd) => (
					<div
						key={cmd.id}
						className="flex items-center justify-between gap-2 text-[11px]"
					>
						<button
							type="button"
							onClick={() => onSelectCommand(cmd)}
							className="font-mono font-medium text-indigo-300 hover:underline"
						>
							{cmd.command}
						</button>
						<span className="text-fog">{cmd.label}</span>
					</div>
				))}
				<div className="flex items-center justify-between gap-2 pt-1 text-[11px] text-slate">
					<span className="font-mono text-mist">@Dokumen / @file</span>
					<span>Lampirkan referensi artefak atau file</span>
				</div>
			</div>
		</section>
	);
}
