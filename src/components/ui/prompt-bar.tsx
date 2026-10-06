"use client";

import {
	animate,
	useMotionValue,
	useMotionValueEvent,
	useReducedMotion,
} from "framer-motion";
import {
	type KeyboardEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

export interface PromptBarProps {
	id?: string;
	value?: string;
	defaultValue?: string;
	onValueChange?: (value: string) => void;
	placeholder?: string;
	disabled?: boolean;
	isSending?: boolean;
	minCharsToSend?: number;
	maxRows?: number;
	onSend?: (text: string) => void;
	className?: string;
	ariaLabel?: string;
	sendButtonLabel?: string;
}

interface SendGlyphProps {
	busy?: boolean;
	morphDuration?: number;
	squash?: number;
	tilt?: number;
}

const ARROW_UP = [
	12, 4.5, 18.5, 11, 14.25, 11, 14.25, 19.5, 9.75, 19.5, 9.75, 11, 5.5, 11,
];
const SQUARE = [12, 6, 18, 6, 18, 12, 18, 18, 6, 18, 6, 12, 6, 6];
const EASE_IN_OUT: [number, number, number, number] = [0.77, 0, 0.175, 1];
const LINE_HEIGHT_PX = 22;

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

const pathAt = (a: number[], b: number[], t: number) => {
	let d = "";
	for (let i = 0; i < a.length; i += 2) {
		d += `${i ? "L" : "M"}${mix(a[i], b[i], t).toFixed(2)} ${mix(
			a[i + 1],
			b[i + 1],
			t,
		).toFixed(2)}`;
	}
	return `${d}Z`;
};

export function SendGlyph({
	busy = false,
	morphDuration = 240,
	squash = 0.12,
	tilt = 8,
}: SendGlyphProps) {
	const reduce = useReducedMotion();
	const svgRef = useRef<SVGSVGElement>(null);
	const pathRef = useRef<SVGPathElement>(null);
	const dir = useRef(busy ? 1 : -1);
	const t = useMotionValue(busy ? 1 : 0);

	useEffect(() => {
		const target = busy ? 1 : 0;
		dir.current = busy ? 1 : -1;
		if (t.get() === target) return undefined;
		const controls = animate(
			t,
			target,
			reduce
				? { duration: 0 }
				: { duration: morphDuration / 1000, ease: EASE_IN_OUT },
		);
		return () => controls.stop();
	}, [busy, morphDuration, reduce, t]);

	useMotionValueEvent(t, "change", (v) => {
		pathRef.current?.setAttribute("d", pathAt(ARROW_UP, SQUARE, v));
		const goo = reduce ? 0 : Math.sin(v * Math.PI);
		const sx = 1 - squash * goo;
		if (svgRef.current) {
			svgRef.current.style.transform = goo
				? `rotate(${dir.current * tilt * goo}deg) scale(${sx}, ${1 / sx})`
				: "";
		}
	});

	return (
		<svg
			ref={svgRef}
			className="block h-3.5 w-3.5 shrink-0 origin-center"
			viewBox="0 0 24 24"
			aria-hidden="true"
			fill="currentColor"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinejoin="round"
		>
			<path ref={pathRef} d={pathAt(ARROW_UP, SQUARE, t.get())} />
		</svg>
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
	minCharsToSend = 3,
	maxRows = 6,
	onSend,
	className = "",
	ariaLabel = "Jelaskan fitur yang ingin dibangun di repositori ini",
	sendButtonLabel,
}: PromptBarProps) {
	const isControlled = value !== undefined;
	const [internalDraft, setInternalDraft] = useState(defaultValue);
	const draft = isControlled ? value : internalDraft;

	const inputRef = useRef<HTMLTextAreaElement>(null);

	const focusInput = useCallback(() => {
		inputRef.current?.focus({ preventScroll: true });
	}, []);

	const updateDraft = (next: string) => {
		if (!isControlled) {
			setInternalDraft(next);
		}
		onValueChange?.(next);
	};

	// Autosize height calculation bounded by maxRows
	useEffect(() => {
		void draft;
		const el = inputRef.current;
		if (!el) return;
		el.style.height = "0px";
		const maxHeight = LINE_HEIGHT_PX * maxRows;
		const computedHeight = Math.max(
			LINE_HEIGHT_PX,
			Math.min(el.scrollHeight, maxHeight),
		);
		el.style.height = `${computedHeight}px`;
		el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
	}, [draft, maxRows]);

	const canSend = !disabled && draft.trim().length >= minCharsToSend;

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

		if (e.key === "Enter" && !e.shiftKey && !isComposing) {
			e.preventDefault();
			handleSend();
		}
	};

	const displayButtonLabel =
		sendButtonLabel ?? (isSending ? "Mengirim..." : "Kirim");

	return (
		<div
			data-testid="prompt-bar"
			className={`group relative flex w-full flex-col rounded-xl border border-graphite bg-charcoal/80 p-3 transition-colors focus-within:border-indigo/50 ${className}`}
		>
			<label htmlFor={id} className="sr-only">
				{ariaLabel}
			</label>
			<textarea
				ref={inputRef}
				id={id}
				value={draft}
				onChange={(e) => updateDraft(e.target.value)}
				onKeyDown={onKeyDown}
				placeholder={placeholder}
				disabled={disabled}
				rows={1}
				aria-label={ariaLabel}
				className="block w-full resize-none border-0 bg-transparent p-0 text-[13px] leading-[22px] text-snow outline-none placeholder:text-slate disabled:cursor-not-allowed disabled:opacity-50"
			/>
			<div className="flex items-center justify-end border-t border-graphite/40 pt-2">
				<button
					type="button"
					onClick={handleSend}
					disabled={!canSend}
					aria-label={displayButtonLabel}
					data-armed={canSend ? "" : undefined}
					className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-graphite/40 disabled:text-slate data-[armed]:bg-snow data-[armed]:text-onyx hover:data-[armed]:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					<SendGlyph />
					<span>{displayButtonLabel}</span>
				</button>
			</div>
		</div>
	);
}

export default PromptBar;
