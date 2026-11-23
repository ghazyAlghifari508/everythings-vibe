"use client";

import {
	Cancel01Icon,
	Delete02Icon,
	Edit01Icon,
	MagicWand02Icon,
} from "@hugeicons/core-free-icons";
import { useEffect, useRef, useState } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { supportsDirectTextEdit } from "../../services/studio-element-targeting";
import type {
	StudioElementAction,
	StudioElementTarget,
} from "../../types/studio-element";

interface StudioElementEditMenuProps {
	target: StudioElementTarget;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onAction: (
		action: StudioElementAction,
		target: StudioElementTarget,
		text?: string,
	) => void;
	canSelectParent?: boolean;
	busy?: boolean;
	/** Floating chat band on the left that the menu must not cover. */
	leftInsetPx?: number;
}

const actionClass =
	"gap-2 py-2 font-[510] text-fog hover:text-snow focus:text-snow";

/**
 * Context menu for one selected element. Positioning, outside interaction,
 * Escape and keyboard navigation come from the shared Radix menu primitive;
 * the canvas only supplies the target identity and action dispatch.
 */
export function StudioElementEditMenu({
	target,
	open,
	onOpenChange,
	onAction,
	canSelectParent = false,
	busy = false,
	leftInsetPx = 0,
}: StudioElementEditMenuProps) {
	const [textKey, setTextKey] = useState<string | null>(null);
	const [draftValue, setDraftValue] = useState("");
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const key = `${target.frameId}:${target.elementId}:${target.baseRevision}`;
	const editingText = textKey === key;
	const draft = textKey === key ? draftValue : target.label;

	useEffect(() => {
		if (editingText) inputRef.current?.focus();
	}, [editingText]);

	const close = () => onOpenChange(false);
	const dispatch = (action: StudioElementAction, text?: string) => {
		onAction(action, target, text);
		close();
	};

	return (
		<DropdownMenu open={open} onOpenChange={onOpenChange}>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					aria-label={`Buka menu edit elemen ${target.label}`}
					title="Edit elemen"
					className="absolute z-20 flex size-8 items-center justify-center rounded-sm border border-snow/70 bg-charcoal/90 text-snow hover:bg-steel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-snow"
					style={{
						left: Math.max(0, target.bounds.x + target.bounds.width - 32),
						top: Math.max(0, target.bounds.y),
					}}
				>
					<Icon icon={Edit01Icon} size={14} />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				side="bottom"
				sideOffset={8}
				avoidCollisions
				collisionPadding={{
					top: 72,
					right: 12,
					bottom: 12,
					left: leftInsetPx + 12,
				}}
				className="w-64 rounded-xl border-iron bg-obsidian shadow-none"
			>
				<div className="flex items-center justify-between gap-2 px-2 py-1.5">
					<span className="font-[510] text-xs text-snow">Edit Element</span>
					<button
						type="button"
						aria-label="Tutup menu edit elemen"
						title="Tutup menu"
						onClick={close}
						className="flex size-8 items-center justify-center rounded-sm text-fog hover:bg-steel hover:text-snow focus-visible:outline-2 focus-visible:outline-snow"
					>
						<Icon icon={Cancel01Icon} size={14} />
					</button>
				</div>
				<DropdownMenuSeparator />
				{editingText ? (
					<form
						className="flex flex-col gap-2 p-2"
						onSubmit={(event) => {
							event.preventDefault();
							if (draft.trim() && !busy) dispatch("edit-text", draft);
						}}
					>
						<label
							htmlFor="studio-element-text"
							className="text-xs font-[510] text-fog"
						>
							Teks elemen
						</label>
						<textarea
							id="studio-element-text"
							ref={inputRef}
							value={draft}
							onChange={(event) => setDraftValue(event.target.value)}
							onKeyDown={(event) => {
								if (event.key.startsWith("Arrow")) event.stopPropagation();
							}}
							rows={3}
							maxLength={8000}
							className="w-full resize-y rounded-sm border border-iron bg-charcoal p-2 text-sm text-snow focus-visible:outline-2 focus-visible:outline-snow"
						/>
						<div className="flex justify-end gap-2">
							<button
								type="button"
								onClick={() => setTextKey(null)}
								className="min-h-11 rounded-sm px-3 text-xs text-fog hover:bg-steel hover:text-snow focus-visible:outline-2 focus-visible:outline-snow"
							>
								Batal
							</button>
							<button
								type="submit"
								disabled={busy || !draft.trim()}
								className="min-h-11 rounded-sm bg-steel px-3 text-xs text-snow hover:brightness-110 focus-visible:outline-2 focus-visible:outline-snow disabled:opacity-40"
							>
								Simpan
							</button>
						</div>
					</form>
				) : (
					<>
						{supportsDirectTextEdit(target) ? (
							<DropdownMenuItem
								className={actionClass}
								onSelect={(event) => {
									event.preventDefault();
									setTextKey(key);
								}}
							>
								<Icon icon={Edit01Icon} size={16} />
								Edit Text
							</DropdownMenuItem>
						) : null}
						<DropdownMenuItem
							className={actionClass}
							onSelect={() => dispatch("edit-ai")}
						>
							<Icon icon={MagicWand02Icon} size={16} />
							Edit with AI
						</DropdownMenuItem>
						{canSelectParent ? (
							<DropdownMenuItem
								className={actionClass}
								onSelect={() => dispatch("select-parent")}
							>
								Pilih induk
							</DropdownMenuItem>
						) : null}
						<DropdownMenuSeparator />
						<DropdownMenuItem
							disabled={busy}
							className={`gap-2 py-2 font-[510] text-crimson focus:bg-crimson/10 focus:text-crimson ${busy ? "opacity-50" : ""}`}
							onSelect={() => dispatch("delete")}
						>
							<Icon icon={Delete02Icon} size={16} />
							Delete
						</DropdownMenuItem>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
