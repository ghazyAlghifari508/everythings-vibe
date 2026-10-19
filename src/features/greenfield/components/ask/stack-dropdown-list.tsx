"use client";

import {
	Search01Icon,
	Sorting05Icon,
	Tick01Icon,
} from "@hugeicons/core-free-icons";
import type { CSSProperties, KeyboardEvent, RefObject } from "react";
import { Icon } from "@/components/ui/icon";
import { stackIconUrl } from "@/features/greenfield/utils/stack-data";
import { cn } from "@/lib/utils";

interface StackDropdownListProps {
	listRef: RefObject<HTMLDivElement | null>;
	selectId: string;
	dropUp?: boolean;
	filtered: string[];
	value: string | undefined;
	highlightIdx: number;
	searchQuery: string;
	customMode: boolean;
	customDraft: string;
	onSearchChange: (query: string) => void;
	onHighlightReset: () => void;
	onCustomDraftChange: (draft: string) => void;
	onSelect: (option: string) => void;
	onOptionKeyDown: (event: KeyboardEvent, option: string) => void;
	onCommitCustom: () => void;
	onCancelCustom: () => void;
	invertIfDark: (label: string) => CSSProperties | undefined;
}

/** The dropdown panel: search box, option rows, and the custom-value editor. */
export function StackDropdownList({
	listRef,
	selectId,
	dropUp,
	filtered,
	value,
	highlightIdx,
	searchQuery,
	customMode,
	customDraft,
	onSearchChange,
	onHighlightReset,
	onCustomDraftChange,
	onSelect,
	onOptionKeyDown,
	onCommitCustom,
	onCancelCustom,
	invertIfDark,
}: StackDropdownListProps) {
	return (
		<div
			ref={listRef}
			role="listbox"
			id={`${selectId}-listbox`}
			aria-labelledby={selectId}
			className={cn(
				"absolute z-50 max-h-60 w-full overflow-y-auto rounded-lg border border-(--border-subtle) py-1 shadow-(--shadow-overlay)",
				dropUp ? "bottom-full mb-1" : "mt-1",
			)}
			style={{ background: "var(--bg-elevated)" }}
		>
			{/* Search */}
			<div
				className="sticky top-0 z-10 border-b border-(--border-subtle) px-3 py-2"
				style={{ background: "var(--bg-elevated)" }}
			>
				<div
					className="flex items-center gap-2 rounded-md border border-(--border-subtle) px-3 py-1.5"
					style={{ background: "var(--bg-input)" }}
				>
					<Icon icon={Search01Icon} size={14} className="shrink-0 text-fog" />
					<input
						type="text"
						value={searchQuery}
						onChange={(e) => {
							onSearchChange(e.target.value);
							onHighlightReset();
						}}
						placeholder="Cari..."
						className="w-full bg-transparent font-inter text-sm outline-none"
						style={{ color: "var(--text-primary)" }}
					/>
				</div>
			</div>

			{filtered.length === 0 && (
				<p className="px-4 py-3 font-inter text-sm text-fog italic">
					Tidak ditemukan
				</p>
			)}

			{filtered.map((opt, i) => {
				const selected = opt === value;
				const iconUrl = stackIconUrl(opt);
				return (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: labels are caller data and may repeat; index qualifies duplicates
						key={`${i}:${opt}`}
						id={`${selectId}-opt-${i}`}
						role="option"
						tabIndex={0}
						aria-selected={selected}
						onPointerDown={(e) => {
							e.preventDefault();
							onSelect(opt);
						}}
						onKeyDown={(e) => onOptionKeyDown(e, opt)}
						className={cn(
							"flex cursor-pointer items-center justify-between gap-2 px-4 py-2.5 min-h-[44px] font-inter text-sm transition-colors",
							i === highlightIdx
								? "bg-white/10 text-snow"
								: selected
									? "text-snow"
									: "text-fog hover:bg-white/5 hover:text-snow",
						)}
					>
						<span className="flex items-center gap-2 truncate">
							{iconUrl && (
								<img
									src={iconUrl}
									alt=""
									width={16}
									height={16}
									className="shrink-0"
									style={invertIfDark(opt)}
									loading="lazy"
								/>
							)}
							{opt}
						</span>
						{selected && (
							<Icon icon={Tick01Icon} size={14} className="shrink-0 text-fog" />
						)}
					</div>
				);
			})}

			{customMode ? (
				<div className="px-3 py-2">
					<input
						type="text"
						value={customDraft}
						onChange={(e) => onCustomDraftChange(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								onCommitCustom();
							}
							if (e.key === "Escape") {
								e.preventDefault();
								onCancelCustom();
							}
						}}
						onBlur={onCommitCustom}
						placeholder="Tulis pilihanmu..."
						className="w-full rounded-md border border-(--border-subtle) px-3 py-2 font-inter text-sm outline-none"
						style={{
							background: "var(--bg-input)",
							color: "var(--text-primary)",
						}}
						// biome-ignore lint/a11y/noAutofocus: custom select needs focus on custom input
						autoFocus
					/>
				</div>
			) : (
				<div
					id={`${selectId}-opt-${filtered.length}`}
					role="option"
					tabIndex={0}
					onPointerDown={(e) => {
						e.preventDefault();
						onSelect("__custom__");
					}}
					onKeyDown={(e) => onOptionKeyDown(e, "__custom__")}
					className={cn(
						"flex cursor-pointer items-center gap-2 px-4 py-2.5 font-inter text-sm transition-colors",
						highlightIdx === filtered.length
							? "bg-white/10 text-snow"
							: "text-fog hover:bg-white/5 hover:text-snow",
					)}
				>
					<Icon icon={Sorting05Icon} size={14} className="shrink-0" />
					<span>Lainnya...</span>
				</div>
			)}
		</div>
	);
}
