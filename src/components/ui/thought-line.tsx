"use client";

import {
	type AnimationPlaybackControls,
	animate,
	motion,
	useReducedMotion,
} from "framer-motion";
import { AlertCircle, Check, ChevronDown, Sparkles } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export const THOUGHT_LINE_ROTATION_INTERVAL_MS = 3000;
const ROTATING_SLOT_LABEL = "Aktivitas berlangsung";

export type ThoughtLinePresentation = "stacked" | "rotating";

interface ThoughtLineProps {
	label?: string;
	doneLabel?: string;
	working: boolean;
	/**
	 * The request this line reports on ended in failure. Renders the failed
	 * state instead of the settled checkmark, so a failure is never dressed up
	 * as a completed run.
	 */
	failed?: boolean;
	failedLabel?: string;
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
	// bare embeds one inline activity line in a parent card instead of its own card + header.
	bare?: boolean;
	presentation?: ThoughtLinePresentation;
	rotatingMessages?: readonly string[];
	rotationKey?: string | number;
	rotationIntervalMs?: number;
	startedAt?: number | string | Date;
	/**
	 * Real settle time of the request this line reports on. When present, the
	 * settled duration is measured from `startedAt` to `finishedAt` instead of
	 * to "now", so a line mounted after the work already finished still reports
	 * the actual duration rather than the time since the page was opened.
	 */
	finishedAt?: number | string | Date | null;
	// Backend-backed single activity line. When provided (even null), it
	// overrides rotatingMessages and never rotates.
	activity?: string | null;
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
			<Sparkles className="size-4 text-snow" aria-hidden="true" />
		</span>
	);
}

interface RotatingActivityProps {
	messages: readonly string[];
	index: number;
	rotationKeyValue: string | number | undefined;
	glyph: ReactNode;
	fontSize: "sm" | "xs";
	showTimer: boolean;
	elapsed: number;
	bare: boolean;
	className?: string;
}

function RotatingActivity({
	messages,
	index,
	rotationKeyValue,
	glyph,
	fontSize,
	showTimer,
	elapsed,
	bare: _bare,
	className,
}: RotatingActivityProps) {
	const reduceMotion = useReducedMotion();
	const hint =
		messages.length > 0 ? (messages[index % messages.length] ?? "") : "";
	// Non-bare (card) presentation draws on the app surface, so the whole card
	// uses the theme tokens that already flip with light/dark mode. Literal
	// ink hex values would stay black-on-black in the dark workspace.
	const messageTone = "text-snow";
	const glyphTone = "text-mist";
	const timerTone = "text-fog";
	return (
		<div className={cn("flex min-w-0 items-center gap-2.5", className)}>
			{glyph ?? (
				<Sparkles
					className={cn("size-4 shrink-0", glyphTone)}
					aria-hidden="true"
				/>
			)}
			{reduceMotion ? (
				<output
					aria-label={ROTATING_SLOT_LABEL}
					aria-live="polite"
					className={cn(
						"min-w-0 flex-1 truncate text-sm leading-snug",
						messageTone,
						fontSize === "xs" && "text-xs",
					)}
				>
					{hint}
				</output>
			) : (
				<motion.output
					key={`${String(rotationKeyValue ?? "slot")}:${index}`}
					aria-label={ROTATING_SLOT_LABEL}
					aria-live="polite"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ duration: 0.35, ease: "easeOut" }}
					className={cn(
						"min-w-0 flex-1 truncate text-sm leading-snug",
						messageTone,
						fontSize === "xs" && "text-xs",
					)}
				>
					{hint}
				</motion.output>
			)}
			{showTimer ? (
				<span
					role="timer"
					aria-label="Waktu proses"
					className={cn("shrink-0 font-mono text-xs tabular-nums", timerTone)}
				>
					{elapsed.toFixed(1)}s
				</span>
			) : null}
		</div>
	);
}

export function ThoughtLine({
	label = "Thinking",
	doneLabel = "Thought",
	working,
	failed = false,
	failedLabel = "Gagal",
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
	finishedAt,
	bare = false,
	activity,
}: ThoughtLineProps) {
	const [elapsed, setElapsed] = useState(0);
	const [open, setOpen] = useState(true);
	const [hintIndex, setHintIndex] = useState(0);
	const startedAtRef = useRef<number>(resolveStartEpoch(startedAt, Date.now()));
	const settledRef = useRef<boolean>(false);
	const traceId = useId();

	const isActivityDriven = activity !== undefined;
	const activityMessages = isActivityDriven
		? activity
			? ([activity] as const)
			: ([] as readonly string[])
		: rotatingMessages;

	const isRotating =
		presentation === "rotating" &&
		working &&
		(activityMessages?.length ?? 0) > 0;

	useEffect(() => {
		if (startedAt === undefined) return;
		startedAtRef.current = resolveStartEpoch(startedAt, startedAtRef.current);
		setElapsed(Math.max(0, (Date.now() - startedAtRef.current) / 1000));
	}, [startedAt]);

	// A settled request reports the duration it actually took. The finish epoch
	// is the recorded settle time, never "now", so remounting the line after the
	// work finished cannot inflate the reported duration.
	const settledElapsed =
		finishedAt === undefined || finishedAt === null
			? null
			: Math.max(
					0,
					(resolveStartEpoch(finishedAt, Date.now()) - startedAtRef.current) /
						1000,
				);
	const reportedElapsed =
		!working && settledElapsed !== null ? settledElapsed : elapsed;

	// biome-ignore lint/correctness/useExhaustiveDependencies: cycle restarts when the parent signals a real stage change via rotationKey by design
	useEffect(() => {
		setHintIndex(0);
	}, [rotationKey]);

	const messageCount = activityMessages?.length ?? 0;
	const messagesRef = useRef(activityMessages);
	messagesRef.current = activityMessages;

	// biome-ignore lint/correctness/useExhaustiveDependencies: rotation survives equivalent parent rerenders; only a real stage change (rotationKey) or set-size change restarts the cycle by design
	useEffect(() => {
		if (!isRotating || messageCount <= 1) return;
		const t = setInterval(() => {
			const count = messagesRef.current?.length ?? 0;
			if (count > 0) setHintIndex((index) => (index + 1) % count);
		}, rotationIntervalMs);
		return () => clearInterval(t);
	}, [isRotating, rotationKey, messageCount, rotationIntervalMs]);

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
	const timePart = showTimer ? ` (${reportedElapsed.toFixed(1)}s)` : "";
	const settledTimePart = showTimer
		? ` selama ${reportedElapsed.toFixed(1)}s`
		: "";
	const title = working
		? `${label}…${timePart}`
		: failed
			? `${failedLabel}${settledTimePart}`
			: `${doneLabel}${settledTimePart}`;
	const clampedActive =
		steps && steps.length > 0
			? Math.min(Math.max(activeStep, 0), steps.length - 1)
			: 0;
	const hintList = activityMessages ?? [];

	if (bare) {
		return (
			<div className={cn("min-w-0", className)}>
				{isRotating ? (
					<RotatingActivity
						messages={hintList}
						index={hintIndex}
						rotationKeyValue={rotationKey}
						glyph={glyph}
						fontSize={fontSize}
						showTimer={showTimer}
						elapsed={reportedElapsed}
						bare
					/>
				) : null}
			</div>
		);
	}

	return (
		<div
			className={cn(
				"w-full rounded-xl border border-graphite bg-charcoal p-4 sm:p-5",
				className,
			)}
		>
			<div className="flex items-center justify-between gap-3">
				<span className="flex min-w-0 items-center gap-2.5">
					{working ? (
						(glyph ?? (
							<Sparkles
								className="size-4 shrink-0 text-mist"
								aria-hidden="true"
							/>
						))
					) : failed ? (
						<AlertCircle
							className="size-4 shrink-0 text-crimson"
							aria-hidden="true"
						/>
					) : (
						<Check
							className="size-4 shrink-0 text-emerald"
							aria-hidden="true"
						/>
					)}
					<output
						aria-live="polite"
						className={cn(
							"min-w-0 flex-1 truncate font-semibold text-snow",
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
						className="shrink-0 font-mono text-xs text-fog tabular-nums"
					>
						{reportedElapsed.toFixed(1)}s
					</span>
				) : null}
			</div>

			{presentation === "rotating" ? (
				isRotating ? (
					<RotatingActivity
						messages={hintList}
						index={hintIndex}
						rotationKeyValue={rotationKey}
						glyph={glyph}
						fontSize={fontSize}
						showTimer={false}
						elapsed={reportedElapsed}
						bare={false}
						className="mt-3"
					/>
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
										className="size-4 shrink-0 text-emerald"
										aria-hidden="true"
									/>
								) : active ? (
									<PulsingStepIcon />
								) : (
									<span
										className="size-4 shrink-0 rounded-full border border-slate"
										aria-hidden="true"
									/>
								)}
								<span
									className={cn(
										"min-w-0 flex-1 truncate text-sm leading-snug",
										active || done ? "text-snow" : "text-fog",
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
				<div className="mt-3 rounded-lg border border-graphite p-3">
					{collapsible ? (
						<button
							type="button"
							onClick={() => setOpen((value) => !value)}
							aria-expanded={open}
							aria-controls={traceId}
							className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
						>
							<span className="font-mono text-[10px] uppercase tracking-wider text-fog">
								{THINKING_LABEL}
							</span>
							<ChevronDown
								className={cn(
									"size-3.5 shrink-0 text-fog transition-transform duration-300 motion-reduce:transition-none",
									open && "rotate-180",
								)}
								aria-hidden="true"
							/>
						</button>
					) : (
						<span className="font-mono text-[10px] uppercase tracking-wider text-fog">
							{THINKING_LABEL}
						</span>
					)}
					{open || !collapsible ? (
						<pre
							id={traceId}
							className="mt-1.5 max-h-48 overflow-y-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-fog"
						>
							{displayThinking}
						</pre>
					) : null}
				</div>
			) : null}
		</div>
	);
}
