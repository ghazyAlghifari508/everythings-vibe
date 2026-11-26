"use client";

import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import type { ComposerSlashCommandItem } from "@/features/codebase/services/composer-interactions";

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
					<span className="font-mono text-mist">@Dokumen</span>
					<span>Sisipkan referensi dokumen planning</span>
				</div>
			</div>
		</section>
	);
}
