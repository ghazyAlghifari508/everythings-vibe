"use client";

import {
	ArrowDown01Icon,
	AtIcon,
	Tick01Icon,
} from "@hugeicons/core-free-icons";
import { useRef, useState } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import type { ComposerOperationMode } from "@/features/codebase/services/composer-interactions";

interface CodebaseComposerToolbarProps {
	mode: ComposerOperationMode;
	canSwitchToPlan: boolean;
	isMentionOpen: boolean;
	disabled?: boolean;
	onSelectMode: (mode: ComposerOperationMode) => void;
	onToggleMention: () => void;
}

export function CodebaseComposerToolbar({
	mode,
	canSwitchToPlan,
	isMentionOpen,
	disabled = false,
	onSelectMode,
	onToggleMention,
}: CodebaseComposerToolbarProps) {
	const [menuOpen, setMenuOpen] = useState(false);
	const pointerHandledRef = useRef(false);

	const modeLabel = mode === "revise" ? "Revise" : "Plan";

	return (
		<div
			data-testid="composer-toolbar"
			data-composer-interactive="true"
			className="flex min-w-0 flex-wrap items-center gap-1.5"
		>
			<DropdownMenu
				open={menuOpen}
				onOpenChange={(nextOpen) => {
					if (disabled) return;
					setMenuOpen(nextOpen);
				}}
			>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						disabled={disabled}
						data-testid="composer-mode-trigger"
						data-mode={mode}
						aria-label="Pilih mode composer"
						aria-haspopup="menu"
						aria-expanded={menuOpen}
						onPointerDown={() => {
							pointerHandledRef.current = true;
						}}
						onClick={() => {
							if (disabled) return;
							if (pointerHandledRef.current) {
								pointerHandledRef.current = false;
								return;
							}
							setMenuOpen((current) => !current);
						}}
						className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md border border-graphite bg-obsidian px-2.5 text-xs font-medium text-snow transition-colors hover:border-steel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo disabled:cursor-not-allowed disabled:opacity-50"
					>
						<span>{modeLabel}</span>
						<Icon
							icon={ArrowDown01Icon}
							size={12}
							aria-hidden="true"
							className="shrink-0 text-fog"
						/>
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="start"
					side="top"
					className="w-56 border-graphite bg-obsidian p-1"
				>
					<DropdownMenuItem
						data-testid="composer-mode-option-plan"
						aria-current={mode === "plan" ? "true" : undefined}
						aria-disabled={!canSwitchToPlan ? "true" : undefined}
						onSelect={() => {
							onSelectMode("plan");
							setMenuOpen(false);
						}}
						className="flex items-start justify-between gap-2 py-2"
					>
						<span className="flex min-w-0 flex-col gap-0.5">
							<span className="text-xs font-semibold text-snow">Plan</span>
							<span className="text-[11px] text-slate">
								Susun planning fitur
							</span>
						</span>
						{mode === "plan" ? (
							<Icon
								icon={Tick01Icon}
								size={14}
								aria-hidden="true"
								className="mt-0.5 shrink-0 text-emerald"
							/>
						) : null}
					</DropdownMenuItem>
					<DropdownMenuItem
						data-testid="composer-mode-option-revise"
						aria-current={mode === "revise" ? "true" : undefined}
						onSelect={() => {
							onSelectMode("revise");
							setMenuOpen(false);
						}}
						className="flex items-start justify-between gap-2 py-2"
					>
						<span className="flex min-w-0 flex-col gap-0.5">
							<span className="text-xs font-semibold text-snow">Revise</span>
							<span className="text-[11px] text-slate">
								Tinjau dan ubah planning
							</span>
						</span>
						{mode === "revise" ? (
							<Icon
								icon={Tick01Icon}
								size={14}
								aria-hidden="true"
								className="mt-0.5 shrink-0 text-emerald"
							/>
						) : null}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<button
				type="button"
				disabled={disabled}
				onClick={onToggleMention}
				data-testid="composer-mention-trigger"
				aria-label="Tambah referensi konteks"
				aria-expanded={isMentionOpen}
				title="Referensi dokumen atau file (@)"
				className={`inline-flex min-h-8 min-w-8 shrink-0 items-center justify-center rounded-md border px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo disabled:cursor-not-allowed disabled:opacity-50 ${
					isMentionOpen
						? "border-indigo/50 bg-indigo/15 text-snow"
						: "border-graphite bg-obsidian text-fog hover:border-steel hover:text-snow"
				}`}
			>
				<Icon icon={AtIcon} size={14} aria-hidden="true" />
			</button>
		</div>
	);
}
