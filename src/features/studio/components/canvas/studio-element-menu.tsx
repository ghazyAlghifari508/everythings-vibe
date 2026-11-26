"use client";

import {
	Cancel01Icon,
	Delete02Icon,
	Edit01Icon,
	MagicWand02Icon,
} from "@hugeicons/core-free-icons";
import { useRef } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import type {
	StudioElementAction,
	StudioElementTarget,
} from "../../types/studio-element";

interface StudioElementEditMenuProps {
	target: StudioElementTarget;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onAction: (action: StudioElementAction, target: StudioElementTarget) => void;
	busy?: boolean;
	leftInsetPx?: number;
	viewport?: HTMLElement | null;
	zoom?: number;
	width?: number;
	height?: number;
}

const actionClass =
	"gap-2 py-2 font-[510] text-fog hover:text-snow focus:text-snow";

/** The trigger lives on the artboard; the accessible menu is portaled at screen scale. */
export function StudioElementEditMenu({
	target,
	open,
	onOpenChange,
	onAction,
	viewport,
	busy = false,
	leftInsetPx = 0,
	zoom = 1,
	width = Infinity,
	height = Infinity,
}: StudioElementEditMenuProps) {
	const close = () => onOpenChange(false);
	const skipRestore = useRef(false);
	const size = Math.min(36 / zoom, width, height);
	const dispatch = (action: StudioElementAction) => {
		skipRestore.current = action !== "delete";
		close();
		onAction(action, target);
	};

	return (
		<DropdownMenu open={open} onOpenChange={onOpenChange} modal={false}>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					aria-label={`Buka menu edit elemen ${target.label}`}
					title="Edit elemen"
					className="absolute z-20 flex size-8 items-center justify-center rounded-sm border border-snow/70 bg-charcoal/90 text-snow hover:bg-steel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-snow"
					style={{
						left: Math.max(
							0,
							Math.min(width, target.bounds.x + target.bounds.width) - size,
						),
						top: Math.max(0, Math.min(height - size, target.bounds.y)),
						width: size,
						height: size,
					}}
				>
					<Icon icon={Edit01Icon} size={14 / zoom} />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				side="bottom"
				sideOffset={8}
				avoidCollisions
				collisionBoundary={viewport ?? undefined}
				updatePositionStrategy="always"
				sticky="always"
				onCloseAutoFocus={(event) => {
					if (skipRestore.current) event.preventDefault();
					skipRestore.current = false;
				}}
				collisionPadding={{
					top: 8,
					right: 56,
					bottom: 60,
					left: leftInsetPx + 12,
				}}
				className="max-h-[var(--radix-dropdown-menu-content-available-height)] w-52 max-w-[var(--radix-dropdown-menu-content-available-width)] overflow-auto rounded-xl border-iron bg-obsidian shadow-none motion-reduce:animate-none"
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
				{target.textEditable ? (
					<DropdownMenuItem
						className={actionClass}
						disabled={busy}
						onSelect={() => dispatch("edit-text")}
					>
						<Icon icon={Edit01Icon} size={16} />
						Edit Text
					</DropdownMenuItem>
				) : null}
				<DropdownMenuItem
					className={actionClass}
					disabled={busy}
					onSelect={() => dispatch("edit-ai")}
				>
					<Icon icon={MagicWand02Icon} size={16} />
					Edit with AI
				</DropdownMenuItem>
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
	);
}
