"use client";

import { ChevronDown, type LucideIcon, X } from "lucide-react";
import { useTheme } from "next-themes";
import {
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	stackIconNeedsDarkInvert,
	stackIconUrl,
} from "@/features/greenfield/utils/stack-data";
import { cn } from "@/lib/utils";
import { StackDropdownList } from "./stack-dropdown-list";

interface StackDropdownProps {
	label: string;
	subtitle: string;
	icon: LucideIcon;
	accent: string;
	placeholder: string;
	options: string[];
	value: string | undefined;
	disabled: boolean;
	skipped?: boolean;
	allowSkip?: boolean;
	dropUp?: boolean;
	onChange: (value: string | undefined) => void;
	onToggleSkip?: () => void;
}

export function StackDropdown({
	label,
	subtitle,
	icon: Icon,
	accent,
	placeholder,
	options,
	value,
	disabled,
	skipped,
	allowSkip,
	dropUp,
	onChange,
	onToggleSkip,
}: StackDropdownProps) {
	const selectId = useId();
	const triggerRef = useRef<HTMLButtonElement>(null);
	const listRef = useRef<HTMLDivElement>(null);

	const [open, setOpen] = useState(false);
	const [customMode, setCustomMode] = useState(false);
	const [customDraft, setCustomDraft] = useState("");
	const [highlightIdx, setHighlightIdx] = useState(-1);
	const [searchQuery, setSearchQuery] = useState("");
	const { resolvedTheme } = useTheme();
	const isDark = resolvedTheme === "dark";

	/** Returns inline style to invert black-fill icons in dark mode, undefined otherwise. */
	const invertIfDark = (label: string) =>
		stackIconNeedsDarkInvert(label) && isDark
			? ({ filter: "brightness(0) invert(1)" } as React.CSSProperties)
			: undefined;

	const filtered = useMemo(() => {
		if (!searchQuery.trim()) return options;
		const q = searchQuery.toLowerCase();
		return options.filter((o) => o.toLowerCase().includes(q));
	}, [options, searchQuery]);

	const isCustomValue = Boolean(value) && !options.includes(value ?? "");
	const displayValue = value || "";

	const _isBlocked = disabled || Boolean(skipped);

	const toggleSkip = () => {
		onToggleSkip?.();
		if (!skipped) onChange(undefined); // engaging skip clears value
	};

	// close on outside click
	useEffect(() => {
		if (!open) return;
		const handler = (e: PointerEvent) => {
			const t = e.target as Node;
			if (triggerRef.current?.contains(t) || listRef.current?.contains(t))
				return;
			setOpen(false);
			setCustomMode(false);
			setSearchQuery("");
		};
		document.addEventListener("pointerdown", handler);
		return () => document.removeEventListener("pointerdown", handler);
	}, [open]);

	// Escape must cancel the edit, not commit it: closing the editor
	// unmounts the input, whose blur would otherwise fire commitCustom and
	// submit partially entered text.
	const cancelBlurRef = useRef(false);
	const cancelCustom = useCallback(() => {
		cancelBlurRef.current = true;
		setCustomMode(false);
		setCustomDraft("");
	}, []);

	const commitCustom = useCallback(() => {
		if (cancelBlurRef.current) {
			cancelBlurRef.current = false;
			return;
		}
		const trimmed = customDraft.trim();
		onChange(trimmed || undefined);
		setCustomMode(false);
		setCustomDraft("");
		setOpen(false);
	}, [customDraft, onChange]);

	const selectOption = useCallback(
		(opt: string) => {
			if (opt === "__custom__") {
				setCustomMode(true);
				setCustomDraft(isCustomValue ? (value ?? "") : "");
				setHighlightIdx(-1);
				return;
			}
			onChange(opt);
			setOpen(false);
			setCustomMode(false);
			setHighlightIdx(-1);
			setSearchQuery("");
		},
		[onChange, isCustomValue, value],
	);

	// Options are focusable but live outside the trigger, so they need
	// their own keyboard activation: without this, keyboard users who tab
	// onto an option cannot select it with Enter or Space.
	const handleOptionKeyDown = useCallback(
		(e: React.KeyboardEvent, opt: string) => {
			if (e.key !== "Enter" && e.key !== " ") return;
			e.preventDefault();
			selectOption(opt);
		},
		[selectOption],
	);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (disabled) return;

		if (
			!open &&
			(e.key === "Enter" || e.key === " " || e.key === "ArrowDown")
		) {
			e.preventDefault();
			setOpen(true);
			setHighlightIdx(0);
			return;
		}

		if (!open) return;

		const allItems = [...filtered, "__custom__"];
		const maxIdx = allItems.length - 1;

		switch (e.key) {
			case "ArrowDown":
				e.preventDefault();
				setHighlightIdx((prev) => (prev >= maxIdx ? 0 : prev + 1));
				break;
			case "ArrowUp":
				e.preventDefault();
				setHighlightIdx((prev) => (prev <= 0 ? maxIdx : prev - 1));
				break;
			case "Enter":
			case " ":
				e.preventDefault();
				if (highlightIdx >= 0 && highlightIdx <= maxIdx) {
					selectOption(allItems[highlightIdx]);
				}
				break;
			case "Escape":
				e.preventDefault();
				setOpen(false);
				setCustomMode(false);
				setSearchQuery("");
				break;
		}
	};

	const clearable = Boolean(displayValue || isCustomValue || customMode);

	// Icon for selected value shown in trigger
	const selectedIconUrl = value && !isCustomValue ? stackIconUrl(value) : null;
	const selectedIconStyle =
		selectedIconUrl && isDark && stackIconNeedsDarkInvert(value ?? "")
			? ({ filter: "brightness(0) invert(1)" } as React.CSSProperties)
			: undefined;

	return (
		<div
			className={cn(
				"rounded-2xl border border-(--border-subtle) p-5 shadow-(--shadow-surface) transition-opacity",
				disabled && !skipped && "pointer-events-none opacity-40",
			)}
			style={{ background: "var(--bg-card)" }}
		>
			{/* header */}
			<div className="mb-4 flex items-center gap-3">
				<div
					className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
					style={{ background: `${accent}24`, color: accent }}
				>
					<Icon size={18} />
				</div>
				<div className="min-w-0 flex-1">
					<p
						className="font-inter text-sm font-[510]"
						style={{ color: "var(--text-primary)" }}
					>
						{label}
					</p>
					<p className="font-inter text-xs text-fog">{subtitle}</p>
				</div>

				{allowSkip && !disabled && (
					<button
						type="button"
						onClick={toggleSkip}
						className={cn(
							"shrink-0 cursor-pointer rounded px-2.5 py-1 min-h-[32px] inline-flex items-center justify-center font-inter text-xs transition-colors",
							skipped
								? "bg-steel text-snow font-[510]"
								: "text-fog hover:text-snow hover:bg-white/5",
						)}
					>
						{skipped ? "Rekomendasi AI Aktif" : "Gunakan Rekomendasi AI"}
					</button>
				)}

				{clearable && !disabled && (
					<button
						type="button"
						onClick={() => {
							onChange(undefined);
							setCustomMode(false);
							setCustomDraft("");
							setOpen(false);
						}}
						className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-crimson transition-colors hover:bg-crimson/10"
						aria-label={`Hapus pilihan ${label}`}
					>
						<X size={14} />
					</button>
				)}
			</div>

			{/* trigger */}
			<div
				className={cn("relative", skipped && "pointer-events-none opacity-60")}
			>
				<button
					ref={triggerRef}
					type="button"
					id={selectId}
					aria-haspopup="listbox"
					aria-expanded={open}
					aria-controls={`${selectId}-listbox`}
					disabled={disabled || Boolean(skipped)}
					onClick={() => {
						if (disabled || skipped) return;
						setOpen((o) => !o);
						if (!open) {
							setSearchQuery("");
							setHighlightIdx(options.indexOf(value ?? ""));
						}
					}}
					onKeyDown={handleKeyDown}
					className={cn(
						"flex w-full items-center justify-between gap-2 rounded-lg border px-4 py-3 min-h-[44px] font-inter text-sm transition-all focus-visible:outline-none",
						open ? "border-(--text-secondary)" : "border-(--border-subtle)",
					)}
					style={{
						background: "var(--bg-input)",
						color: displayValue ? "var(--text-primary)" : "var(--text-muted)",
					}}
				>
					<span className="flex items-center gap-2 truncate">
						{selectedIconUrl && (
							<img
								src={selectedIconUrl}
								alt=""
								width={16}
								height={16}
								className="shrink-0"
								style={selectedIconStyle}
								loading="lazy"
							/>
						)}
						{skipped
							? "Otomatis rekomendasi AI"
							: displayValue && !isCustomValue
								? displayValue
								: isCustomValue
									? value
									: placeholder}
					</span>
					<ChevronDown
						size={16}
						aria-hidden="true"
						className={cn(
							"shrink-0 text-fog transition-transform",
							open && "rotate-180",
						)}
					/>
				</button>

				{open && (
					<StackDropdownList
						listRef={listRef}
						selectId={selectId}
						dropUp={dropUp}
						filtered={filtered}
						value={value}
						highlightIdx={highlightIdx}
						searchQuery={searchQuery}
						customMode={customMode}
						customDraft={customDraft}
						onSearchChange={setSearchQuery}
						onHighlightReset={() => setHighlightIdx(-1)}
						onCustomDraftChange={setCustomDraft}
						onSelect={selectOption}
						onOptionKeyDown={handleOptionKeyDown}
						onCommitCustom={commitCustom}
						onCancelCustom={cancelCustom}
						invertIfDark={invertIfDark}
					/>
				)}
			</div>
		</div>
	);
}
