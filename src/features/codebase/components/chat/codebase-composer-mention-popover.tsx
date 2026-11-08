"use client";

import { File01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { type KeyboardEvent, useEffect, useRef } from "react";
import { Icon } from "@/components/ui/icon";
import { PopoverContent } from "@/components/ui/popover";
import type { ComposerMentionCandidate } from "@/features/codebase/services/composer-interactions";

/**
 * The `@` selector floats above the composer and overlaps its top edge, like
 * the model picker in the reference screenshot: side "top" for the upward
 * direction, align "start" to hug the composer's left edge, a negative
 * sideOffset so the surface slightly covers the composer's top border, and
 * collision padding so a short viewport repositions it instead of resizing the
 * composer.
 */
export const MENTION_POPOVER_PLACEMENT = {
	side: "top",
	align: "start",
	sideOffset: -6,
	collisionPadding: 12,
} as const;

interface CodebaseComposerMentionPopoverProps {
	isOpen: boolean;
	hasDocuments: boolean;
	documents: readonly ComposerMentionCandidate[];
	searchQuery: string;
	activeIndex: number;
	autoFocusSearch: boolean;
	onSearchChange: (value: string) => void;
	onSearchKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
	onSelectCandidate: (candidate: ComposerMentionCandidate) => void;
}

export function CodebaseComposerMentionPopover({
	isOpen,
	hasDocuments,
	documents,
	searchQuery,
	activeIndex,
	autoFocusSearch,
	onSearchChange,
	onSearchKeyDown,
	onSelectCandidate,
}: CodebaseComposerMentionPopoverProps) {
	const searchRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!isOpen || !autoFocusSearch) return;
		searchRef.current?.focus({ preventScroll: true });
	}, [isOpen, autoFocusSearch]);

	if (!isOpen) return null;

	const activeOption = documents[activeIndex];

	return (
		<PopoverContent
			data-testid="composer-mention-popover"
			side={MENTION_POPOVER_PLACEMENT.side}
			align={MENTION_POPOVER_PLACEMENT.align}
			sideOffset={MENTION_POPOVER_PLACEMENT.sideOffset}
			collisionPadding={MENTION_POPOVER_PLACEMENT.collisionPadding}
			aria-label="Pilih dokumen"
			onOpenAutoFocus={(event) => {
				// Typing `@` must keep the caret — and the draft selection — in the
				// textarea; only a button click hands focus to the search field.
				if (!autoFocusSearch) event.preventDefault();
			}}
			onInteractOutside={(event) => {
				// The trigger toggles the surface itself; dismissing here first would
				// immediately re-open it on the same click.
				const target = event.target;
				if (
					target instanceof HTMLElement &&
					target.closest("[data-composer-mention-trigger='true']")
				) {
					event.preventDefault();
				}
			}}
			className="flex w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw_-_2rem)] flex-col overflow-hidden"
		>
			<div className="flex items-center gap-2 border-b border-graphite px-3 py-2">
				<Icon
					icon={Search01Icon}
					size={14}
					aria-hidden="true"
					className="shrink-0 text-slate"
				/>
				<input
					ref={searchRef}
					type="text"
					value={searchQuery}
					onChange={(event) => onSearchChange(event.target.value)}
					onKeyDown={onSearchKeyDown}
					placeholder="Cari dokumen..."
					aria-label="Cari dokumen"
					data-testid="composer-mention-search"
					className="min-w-0 flex-1 bg-transparent text-xs text-snow outline-none placeholder:text-slate"
				/>
			</div>

			{!hasDocuments ? (
				<p className="px-3 py-2 text-xs text-slate">
					Belum ada dokumen planning pada fitur ini.
				</p>
			) : documents.length === 0 ? (
				<p className="px-3 py-2 text-xs text-slate">
					Tidak ada dokumen yang cocok.
				</p>
			) : (
				<div
					role="listbox"
					aria-label="Dokumen planning"
					tabIndex={-1}
					aria-activedescendant={
						activeOption
							? `composer-mention-option-${activeOption.targetKind}`
							: undefined
					}
					className="max-h-[min(18rem,var(--radix-popover-content-available-height,18rem))] overflow-y-auto p-1.5"
				>
					{documents.map((doc, idx) => {
						const isSelected = idx === activeIndex;
						return (
							<button
								key={doc.key}
								id={`composer-mention-option-${doc.targetKind}`}
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
								</span>
								<span className="max-w-[45%] shrink-0 truncate font-mono text-[10px] text-slate">
									{doc.fileName}
								</span>
							</button>
						);
					})}
				</div>
			)}
		</PopoverContent>
	);
}
