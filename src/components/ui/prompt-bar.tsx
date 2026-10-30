"use client";

import { ArrowUp02Icon } from "@hugeicons/core-free-icons";
import {
	type KeyboardEvent,
	type MouseEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { Icon } from "./icon";
import { Spinner } from "./spinner";

export type PromptBarSubmitAppearance = "label" | "icon";

export interface PromptBarProps {
	id?: string;
	value?: string;
	defaultValue?: string;
	onValueChange?: (value: string) => void;
	placeholder?: string;
	disabled?: boolean;
	isSending?: boolean;
	sendDisabled?: boolean;
	minCharsToSend?: number;
	minRows?: number;
	maxRows?: number;
	onSend?: (text: string) => void;
	onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
	headerSlot?: ReactNode;
	footerStart?: ReactNode;
	popoverSlot?: ReactNode;
	className?: string;
	ariaLabel?: string;
	sendButtonLabel?: string;
	/**
	 * Opt-in submit presentation. "label" keeps the historical text button so
	 * unrelated flows are untouched; "icon" renders the same functional
	 * submit as a compact icon-only control.
	 */
	submitAppearance?: PromptBarSubmitAppearance;
}

interface SendGlyphProps {
	busy?: boolean;
}

const LINE_HEIGHT_PX = 22;
const ICON_SUBMIT_LABEL = "Kirim pesan";

// Anything a user expects to activate directly. A click that lands on one of
// these must keep its native behavior instead of being forwarded to the
// textarea.
const INTERACTIVE_SELECTOR =
	'a[href], button, input, select, textarea, [role="button"], [role="tab"], [role="checkbox"], [role="switch"], [role="slider"], [role="menuitem"], [role="option"], [role="listbox"], [role="dialog"], [data-composer-interactive="true"], [contenteditable="true"]';

export function SendGlyph({ busy = false }: SendGlyphProps) {
	if (busy) {
		return <Spinner size={14} className="text-current" />;
	}
	return (
		<Icon
			icon={ArrowUp02Icon}
			size={16}
			strokeWidth={2}
			className="block shrink-0"
		/>
	);
}

export function PromptBar({
	id = "codebase-chat-composer",
	value,
	defaultValue = "",
	onValueChange,
	placeholder = "Jelaskan fitur yang ingin kamu bangun di repositori ini...",
	disabled = false,
	isSending = false,
	sendDisabled = false,
	minCharsToSend = 3,
	minRows = 1,
	maxRows = 6,
	onSend,
	onKeyDown: onExternalKeyDown,
	headerSlot,
	footerStart,
	popoverSlot,
	className = "",
	ariaLabel = "Jelaskan fitur yang ingin dibangun di repositori ini",
	sendButtonLabel,
	submitAppearance = "label",
}: PromptBarProps) {
	const isControlled = value !== undefined;
	const [internalDraft, setInternalDraft] = useState(defaultValue);
	const draft = isControlled ? value : internalDraft;

	const inputRef = useRef<HTMLTextAreaElement>(null);

	const focusInput = useCallback(() => {
		inputRef.current?.focus({ preventScroll: true });
	}, []);

	/**
	 * The composer surface (padding, the footer row, the gap above the submit
	 * button) is one visual field, so pressing anywhere that is not a control
	 * must start typing. Pointer-down is intercepted instead of click so the
	 * browser never moves focus to the surface first, and the caret lands at
	 * the end of the draft like every other "clicked below the text" input.
	 *
	 * Only `disabled` stops this: a busy composer stays editable by design, so
	 * a user can keep preparing their next message while a request is in
	 * flight. The submit action is what the busy state blocks, not typing.
	 */
	const handleSurfacePointerDown = useCallback(
		(event: MouseEvent<HTMLFormElement>) => {
			if (disabled || event.defaultPrevented) return;
			const target = event.target;
			if (!(target instanceof HTMLElement)) return;
			const el = inputRef.current;
			// Clicks inside the textarea keep native caret/selection behavior.
			if (el?.contains(target)) return;
			if (target.closest(INTERACTIVE_SELECTOR)) return;
			event.preventDefault();
			focusInput();
			const caret = draft.length;
			el?.setSelectionRange(caret, caret);
		},
		[draft.length, disabled, focusInput],
	);

	const updateDraft = (next: string) => {
		if (!isControlled) {
			setInternalDraft(next);
		}
		onValueChange?.(next);
	};

	// Autosize height calculation bounded by minRows and maxRows
	useEffect(() => {
		void draft;
		const el = inputRef.current;
		if (!el) return;
		el.style.height = "0px";
		const minHeight = LINE_HEIGHT_PX * minRows;
		const maxHeight = LINE_HEIGHT_PX * maxRows;
		const computedHeight = Math.max(
			minHeight,
			Math.min(el.scrollHeight, maxHeight),
		);
		el.style.height = `${computedHeight}px`;
		el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
	}, [draft, minRows, maxRows]);

	// A busy composer keeps the textarea editable so a draft survives the
	// in-flight request, but the submit action is closed: Enter and the button
	// both consult this one predicate, so the keyboard cannot bypass the guard.
	const canSend =
		!disabled &&
		!isSending &&
		!sendDisabled &&
		draft.trim().length >= minCharsToSend;

	const handleSend = () => {
		if (!canSend) return;
		const message = draft.trim();
		onSend?.(message);
		if (!isControlled) {
			setInternalDraft("");
		}
		focusInput();
	};

	const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
		const isComposing =
			Boolean(e.nativeEvent?.isComposing) ||
			("isComposing" in e && Boolean(e.isComposing));

		if (!isComposing) {
			onExternalKeyDown?.(e);
			if (e.defaultPrevented) return;
		}

		if (e.key === "Enter" && !e.shiftKey && !isComposing) {
			e.preventDefault();
			handleSend();
		}
	};

	const isIconSubmit = submitAppearance === "icon";
	const displayButtonLabel =
		sendButtonLabel ?? (isSending ? "Mengirim..." : "Kirim");
	const iconSubmitLabel = sendButtonLabel ?? ICON_SUBMIT_LABEL;

	return (
		<form
			data-testid="prompt-bar"
			data-submit-appearance={submitAppearance}
			onMouseDown={handleSurfacePointerDown}
			onSubmit={(event) => {
				// The composer owns submission: never let a native submit
				// navigate the planning workspace away.
				event.preventDefault();
				handleSend();
			}}
			className={`group relative flex w-full ${disabled ? "cursor-not-allowed" : "cursor-text"} flex-col rounded-xl border border-graphite bg-charcoal/80 p-3 transition-colors focus-within:border-indigo/50 ${className}`}
		>
			<label htmlFor={id} className="sr-only">
				{ariaLabel}
			</label>
			{popoverSlot}
			{headerSlot ? (
				<header
					data-testid="prompt-bar-header"
					className="mb-2 flex flex-wrap items-center gap-1.5"
				>
					{headerSlot}
				</header>
			) : null}
			<textarea
				ref={inputRef}
				id={id}
				value={draft}
				onChange={(e) => updateDraft(e.target.value)}
				onKeyDown={onKeyDown}
				placeholder={placeholder}
				disabled={disabled}
				rows={minRows}
				aria-label={ariaLabel}
				className="block w-full resize-none border-0 bg-transparent p-0 text-[13px] leading-[22px] text-snow outline-none placeholder:text-slate disabled:cursor-not-allowed disabled:opacity-50"
			/>
			<div
				className={`flex items-center ${footerStart ? "justify-between" : "justify-end"} gap-2 pt-2`}
			>
				{footerStart ? (
					<div className="flex min-w-0 flex-wrap items-center gap-1.5">
						{footerStart}
					</div>
				) : null}
				<button
					type="button"
					onClick={handleSend}
					disabled={!canSend}
					aria-label={isIconSubmit ? iconSubmitLabel : displayButtonLabel}
					aria-busy={isIconSubmit ? isSending : undefined}
					title={isIconSubmit ? iconSubmitLabel : undefined}
					data-testid="prompt-bar-submit"
					data-armed={canSend ? "" : undefined}
					className={
						isIconSubmit
							? "inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-md text-snow transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo disabled:cursor-not-allowed disabled:bg-graphite/40 disabled:text-slate data-[armed]:bg-snow data-[armed]:text-onyx hover:data-[armed]:brightness-105"
							: "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-graphite/40 disabled:text-slate data-[armed]:bg-snow data-[armed]:text-onyx hover:data-[armed]:brightness-105"
					}
				>
					<SendGlyph busy={isSending} />
					{isIconSubmit ? null : <span>{displayButtonLabel}</span>}
				</button>
			</div>
		</form>
	);
}
