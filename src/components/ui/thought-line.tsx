"use client";

import {
	type AnimationPlaybackControls,
	animate,
	motion,
	useReducedMotion,
} from "framer-motion";
import { Check, ChevronDown, Sparkles } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export const THOUGHT_LINE_ROTATION_INTERVAL_MS = 3000;
const ROTATING_SLOT_LABEL = "Aktivitas berlangsung";

export type ThoughtLinePresentation = "stacked" | "rotating";

interface ThoughtLineProps {
	label?: string;
	doneLabel?: string;
	working: boolean;
	thinkingText?: string;
	steps?: string[];
	activeStep?: number;
	collapsible?: boolean;
	collapseOnSettle?: boolean;
	showTimer?: boolean;
	fontSize?: "sm" | "xs";
	glyph?: ReactNode;
	onSettle?: (elapsedSec: number) => void;
	className?: string;
	presentation?: ThoughtLinePresentation;
	rotatingMessages?: string[];
	rotationKey?: string | number;
	rotationIntervalMs?: number;
	startedAt?: number | string | Date;
}

function resolveStartEpoch(
	value: number | string | Date | undefined,
	fallback: number,
): number {
	if (value === undefined) return fallback;
	const epoch =
		value instanceof Date
			? value.getTime()
			: typeof value === "number"
				? value
				: Date.parse(value);
	return Number.isFinite(epoch) ? epoch : fallback;
}

const MAX_THINKING_CHARS = 8000;
const THINKING_LABEL = "Proses Berpikir Model";

// Own component so the framer-motion pulse lifecycle is tied to the active
// step's mount, not to a parent effect dependency on the step index.
function PulsingStepIcon() {
	const ref = useRef<HTMLSpanElement>(null);
	const reduceMotion = useReducedMotion();

	useEffect(() => {
		if (reduceMotion === true) return;
		const el = ref.current;
		if (!el) return;
		let controls: AnimationPlaybackControls | undefined;
		try {
			controls = animate(
				el,
				{ opacity: [1, 0.35, 1] },
				{ duration: 1.6, repeat: Infinity, ease: "easeInOut" },
			);
		} catch {
			controls = undefined;
		}
		return () => controls?.stop();
	}, [reduceMotion]);

	return (
		<span ref={ref} className="flex shrink-0">
			<Sparkles className="size-4 text-[#0f0f0f]" aria-hidden="true" />
		</span>
	);
}

export function ThoughtLine({
	label = "Thinking",
	doneLabel = "Thought",
	working,
	thinkingText,
	steps,
	activeStep = 0,
	collapsible = true,
	collapseOnSettle = true,
	showTimer = true,
	fontSize = "sm",
	glyph,
	onSettle,
	className,
	presentation = "stacked",
	rotatingMessages,
	rotationKey,
	rotationIntervalMs = THOUGHT_LINE_ROTATION_INTERVAL_MS,
	startedAt,
}: ThoughtLineProps) {
	const [elapsed, setElapsed] = useState(0);
	const [open, setOpen] = useState(true);
	const [hintIndex, setHintIndex] = useState(0);
	const reduceMotion = useReducedMotion();
	const startedAtRef = useRef<number>(
		resolveStartEpoch(startedAt, Date.now()),
	);
	const settledRef = useRef<boolean>(false);
	const traceId = useId();

	const isRotating =
		presentation === "rotating" &&
		working &&
		(rotatingMessages?.length ?? 0) > 0;

	useEffect(() => {
		if (startedAt === undefined) return;
		startedAtRef.current = resolveStartEpoch(
			startedAt,
			startedAtRef.current,
		);
		setElapsed(Math.max(0, (Date.now() - startedAtRef.current) / 1000));
	}, [startedAt]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: cycle restarts when the parent signals a real stage change via rotationKey by design
	useEffect(() => {
		setHintIndex(0);
	}, [rotationKey]);

	useEffect(() => {
		if (!isRotating) return;
		const count = rotatingMessages?.length ?? 0;
		if (count <= 1) return;
		const t = setInterval(() => {
			setHintIndex((index) => (index + 1) % count);
		}, rotationIntervalMs);
		return () => clearInterval(t);
	}, [isRotating, rotatingMessages, rotationIntervalMs]);

	useEffect(() => {
		if (!working) return;
		const t = setInterval(() => {
			setElapsed((Date.now() - startedAtRef.current) / 1000);
		}, 500);
		return () => clearInterval(t);
	}, [working]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: settle fires once per working->false flip by design
	useEffect(() => {
		if (!working && !settledRef.current) {
			settledRef.current = true;
			onSettle?.(elapsed);
			if (collapseOnSettle) setOpen(false);
		}
		if (working) {
			settledRef.current = false;
		}
	}, [working]);

	const hasThinking = (thinkingText?.trim().length ?? 0) > 0;
	const displayThinking =
		thinkingText && thinkingText.length > MAX_THINKING_CHARS
			? `…${thinkingText.slice(-MAX_THINKING_CHARS)}`
			: thinkingText;
	const timePart = showTimer ? ` (${elapsed.toFixed(1)}s)` : "";
	const settledTimePart = showTimer ? ` selama ${elapsed.toFixed(1)}s` : "";
	const title = working
		? `${label}…${timePart}`
		: `${doneLabel}${settledTimePart}`;
	const clampedActive =
		steps && steps.length > 0
			? Math.min(Math.max(activeStep, 0), steps.length - 1)
			: 0;
	const hintCount = rotatingMessages?.length ?? 0;
	const activeHint =
		hintCount > 0
			? (rotatingMessages?.[hintIndex % hintCount] ?? "")
			: "";

	return (
		<div
			className={cn(
				"w-full rounded-xl border border-border bg-white p-4 sm:p-5",
				className,
			)}
		>
			<div className="flex items-center justify-between gap-3">
				<span className="flex min-w-0 items-center gap-2.5">
					{working ? (
						(glyph ?? (
							<Sparkles
								className="size-4 shrink-0 text-[#0f0f0f]"
								aria-hidden="true"
							/>
						))
					) : (
						<Check
							className="size-4 shrink-0 text-[#0f0f0f]"
							aria-hidden="true"
						/>
					)}
					<output
						aria-live="polite"
						className={cn(
							"min-w-0 flex-1 truncate font-semibold text-[#0f0f0f]",
							fontSize === "xs" ? "text-xs" : "text-sm",
						)}
					>
						{title}
					</output>
				</span>
				{showTimer ? (
					<span
						role="timer"
						aria-label="Waktu proses"
						className="shrink-0 font-mono text-xs text-[#606060] tabular-nums"
					>
						{elapsed.toFixed(1)}s
					</span>
				) : null}
			</div>

			{presentation === "rotating" ? (
			isRotating ? (
				<div className="mt-3 flex min-w-0 items-center gap-2.5">
					{glyph ?? (
						<Sparkles
							className="size-4 shrink-0 text-[#0f0f0f]"
							aria-hidden="true"
						/>
					)}
					{reduceMotion ? (
						<output
							aria-label={ROTATING_SLOT_LABEL}
							aria-live="polite"
							className={cn(
								"min-w-0 flex-1 truncate text-sm leading-snug text-[#0f0f0f]",
								fontSize === "xs" && "text-xs",
							)}
						>
							{activeHint}
						</output>
					) : (
						<motion.output
							key={`${String(rotationKey ?? "slot")}:${hintIndex}`}
							aria-label={ROTATING_SLOT_LABEL}
							aria-live="polite"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							transition={{ duration: 0.35, ease: "easeOut" }}
							className={cn(
								"min-w-0 flex-1 truncate text-sm leading-snug text-[#0f0f0f]",
								fontSize === "xs" && "text-xs",
							)}
						>
							{activeHint}
						</motion.output>
					)}
				</div>
			) : null
		) : steps && steps.length > 0 ? (
				<ol className="mt-3 space-y-1.5" aria-label="Tahapan proses">
					{steps.map((step, index) => {
						const done =
							index < clampedActive || (!working && index <= clampedActive);
						const active = working && index === clampedActive;
						return (
							<li key={step} className="flex items-center gap-2.5">
								{done && !active ? (
									<Check
										className="size-4 shrink-0 text-[#0f0f0f]"
										aria-hidden="true"
									/>
								) : active ? (
									<PulsingStepIcon />
								) : (
									<span
										className="size-4 shrink-0 rounded-full border border-[#d3d3d3]"
										aria-hidden="true"
									/>
								)}
								<span
									className={cn(
										"min-w-0 flex-1 truncate text-sm leading-snug",
										active || done ? "text-[#0f0f0f]" : "text-[#606060]",
										!active && !done && "opacity-60",
									)}
									aria-current={active ? "step" : undefined}
								>
									{step}
								</span>
							</li>
						);
					})}
				</ol>
			) : null}

			{hasThinking ? (
				<div className="mt-3 rounded-lg border border-[#d3d3d3] p-3">
					{collapsible ? (
						<button
							type="button"
							onClick={() => setOpen((value) => !value)}
							aria-expanded={open}
							aria-controls={traceId}
							className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#065fd4]"
						>
							<span className="font-mono text-[10px] uppercase tracking-wider text-[#606060]">
								{THINKING_LABEL}
							</span>
							<ChevronDown
								className={cn(
									"size-3.5 shrink-0 text-[#606060] transition-transform duration-300 motion-reduce:transition-none",
									open && "rotate-180",
								)}
								aria-hidden="true"
							/>
						</button>
					) : (
						<span className="font-mono text-[10px] uppercase tracking-wider text-[#606060]">
							{THINKING_LABEL}
						</span>
					)}
					{open || !collapsible ? (
						<pre
							id={traceId}
							className="mt-1.5 max-h-48 overflow-y-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-[#606060]"
						>
							{displayThinking}
						</pre>
					) : null}
				</div>
			) : null}
		</div>
	);
}
