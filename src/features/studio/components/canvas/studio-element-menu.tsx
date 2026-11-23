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
	/** Full text from the live document; the identity label is truncated. */
	textValue?: string;
	/** False when the live node cannot be safely patched as text. */
	textEditable?: boolean;
}

const actionClass =
	"gap-2 py-2 font-[510] text-fog hover:text-snow focus:text-snow";

/**
 * Context menu for one selected element. Positioning, outside interaction,
 * Escape and keyboard navigation come from the shared Radix menu primitive;
 * the canvas only supplies the target identity and action dispatch. Direct
 * text editing happens in place over the selected element, never through a
 * separate dialog or a model request.
 */
export function StudioElementEditMenu({
	target,
	open,
	onOpenChange,
	onAction,
	canSelectParent = false,
	busy = false,
	leftInsetPx = 0,
	textValue,
	textEditable,
}: StudioElementEditMenuProps) {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState("");
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const cancelled = useRef(false);
	const currentText = textValue ?? target.label;
	const canEditText = textEditable ?? supportsDirectTextEdit(target);

	useEffect(() => {
		if (!editing) return;
		// Radix moves focus into the closing menu after the editor mounts;
		// refocus once that transition is done.
		const frame = requestAnimationFrame(() => inputRef.current?.focus());
		return () => cancelAnimationFrame(frame);
	}, [editing]);

	const close = () => onOpenChange(false);
	const dispatch = (action: StudioElementAction, text?: string) => {
		onAction(action, target, text);
		close();
	};
	const openEditor = () => {
		cancelled.current = false;
		setDraft(currentText);
		setEditing(true);
		close();
	};
	const cancelEditor = () => {
		cancelled.current = true;
		setEditing(false);
	};
	const commitEditor = () => {
		if (!editing || cancelled.current) return;
		cancelled.current = true;
		setEditing(false);
		const next = draft;
		if (!next.trim() || next === currentText) return;
		dispatch("edit-text", next);
	};

	return (
		<>
			<DropdownMenu open={open} onOpenChange={onOpenChange}>
				<DropdownMenuTrigger asChild>
					<button
						ref={triggerRef}
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
					ref={menuRef}
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
					{canEditText ? (
						<DropdownMenuItem
							className={actionClass}
							onClick={(event) => {
								// Prevent Radix's select handler from restoring focus
								// to the trigger after the menu closes.
								event.preventDefault();
								openEditor();
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
				</DropdownMenuContent>
			</DropdownMenu>
			{editing ? (
				<div
					data-ev-editor-overlay
					className="absolute z-30 flex flex-col gap-1 rounded-sm border border-snow bg-obsidian/95 p-1 shadow-lg"
					style={{
						left: Math.max(0, target.bounds.x),
						top: Math.max(0, target.bounds.y),
						width: Math.min(Math.max(target.bounds.width, 180), 480),
					}}
				>
					<textarea
						ref={inputRef}
						aria-label="Teks elemen"
						value={draft}
						disabled={busy}
						rows={Math.min(
							Math.max(Math.ceil(target.bounds.height / 20), 1),
							6,
						)}
						maxLength={8000}
						onChange={(event) => setDraft(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Escape") {
								event.preventDefault();
								cancelEditor();
							} else if (event.key === "Enter" && !event.shiftKey) {
								event.preventDefault();
								commitEditor();
							} else {
								event.stopPropagation();
							}
						}}
						onBlur={(event) => {
							const next = event.relatedTarget;
							if (
								next instanceof Node &&
								(menuRef.current?.contains(next) ||
									triggerRef.current?.contains(next))
							)
								return;
							commitEditor();
						}}
						className="w-full resize-y rounded-sm border border-iron bg-charcoal p-2 text-sm text-snow focus-visible:outline-2 focus-visible:outline-snow"
					/>
					<div className="flex items-center justify-between gap-2 px-1 pb-0.5 text-xs text-fog">
						<span>Enter simpan · Shift+Enter baris baru</span>
						<button
							type="button"
							onPointerDown={(event) => event.preventDefault()}
							onClick={cancelEditor}
							className="min-h-8 rounded-sm px-2 hover:bg-steel hover:text-snow focus-visible:outline-2 focus-visible:outline-snow"
						>
							Batal
						</button>
					</div>
				</div>
			) : null}
		</>
	);
}
