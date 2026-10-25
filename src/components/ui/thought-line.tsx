"use client";

import {
	AlertCircleIcon,
	ArrowDown01Icon,
	SparklesIcon,
	Tick01Icon,
} from "@hugeicons/core-free-icons";
import {
	type AnimationPlaybackControls,
	animate,
	useReducedMotionConfig,
} from "framer-motion";
import {
	type CSSProperties,
	type ReactNode,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";

// Behaviour contract ported from the ReactBits ThoughtLine micro-interaction
// (https://reactbits.dev/micro/thought-line): a reasoning-trace header with a
// breathing glyph, a live clock that glides between the working and settled
// labels, and a fold-out step trace. Paint comes from the everythings-vibe theme
// tokens (see .thought-line in globals.css) instead of ReactBits' own palette.
const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];
const EASE_IN_OUT: [number, number, number, number] = [0.77, 0, 0.175, 1];
const GLYPH_DONE = 0.55;
const EMPTY_STEPS: readonly string[] = [];
const MAX_THINKING_CHARS = 8000;
const THINKING_LABEL = "Proses Berpikir Model";

export interface ThoughtLineProps {
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
	glyph?: "sparkle" | "dot" | "none" | ReactNode;
	steps?: readonly string[];
	/** Real index into steps, when the parent tracks a live pipeline stage. */
	activeStep?: number;
	collapsible?: boolean;
	collapseOnSettle?: boolean;
	fontSize?: number;
	breathPeriod?: number;
	breathDepth?: number;
	shimmer?: boolean;
	shimmerDuration?: number;
	settleDuration?: number;
	settleBlur?: number;
	showTimer?: boolean;
	onSettle?: (elapsedSec: number) => void;
	className?: string;
	/**
	 * Single activity line persisted by the server or worker. When supplied it
	 * is the working text and it never rotates, so the component can only ever
	 * report work that actually happened.
	 */
	activity?: string | null;
	/** Real reasoning text streamed from a model, shown in the fold-out trace. */
	thinkingText?: string;
	/**
	 * Real start of the current stage. The timer measures elapsed time from this
	 * instant, never from component mount.
	 */
	startedAt?: number | string | Date;
	/**
	 * Real settle time of the request this line reports on. When present, the
	 * settled duration is measured from `startedAt` to `finishedAt` instead of
	 * to "now", so a line mounted after the work already finished still reports
	 * the actual duration rather than the time since the page was opened.
	 */
	finishedAt?: number | string | Date | null;
	/** Embeds the line inline instead of rendering it as a standalone card. */
	bare?: boolean;
	/**
	 * Lets the reported line run to several lines instead of truncating. Used
	 * when the line carries a sentence rather than a short trace header.
	 */
	wrap?: boolean;
	/** Fades the reported line whenever its text actually changes. */
	fadeTextOnChange?: boolean;
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

// Deciseconds keep the sub-second precision ReactBits shows without drift.
function formatElapsed(deciseconds: number): string {
	return deciseconds < 600
		? `${(deciseconds / 10).toFixed(1)}s`
		: `${Math.floor(deciseconds / 600)}m ${((deciseconds % 600) / 10).toFixed(1)}s`;
}

function spokenElapsed(deciseconds: number): string {
	const seconds = (deciseconds / 10).toFixed(1);
	if (deciseconds < 600) return `${seconds} detik`;
	return `${Math.floor(deciseconds / 600)} menit ${((deciseconds % 600) / 10).toFixed(1)} detik`;
}

export function ThoughtLine({
	label = "Thinking",
	doneLabel = "Selesai",
	working,
	failed = false,
	failedLabel = "Gagal",
	glyph = "sparkle",
	steps = EMPTY_STEPS,
	activeStep,
	collapsible = true,
	collapseOnSettle = true,
	fontSize = 14,
	breathPeriod = 1.6,
	breathDepth = 0.45,
	shimmer = true,
	shimmerDuration = 1.8,
	settleDuration = 350,
	settleBlur = 2,
	showTimer = true,
	onSettle,
	className,
	activity,
	thinkingText,
	startedAt,
	finishedAt,
	bare = false,
	wrap = false,
	fadeTextOnChange = false,
}: ThoughtLineProps) {
	const reduce = useReducedMotionConfig();
	const [open, setOpen] = useState(true);
	const [announce, setAnnounce] = useState(label);
	const glyphRef = useRef<HTMLSpanElement>(null);
	const breathRef = useRef<HTMLSpanElement>(null);
	const timerRef = useRef<HTMLSpanElement>(null);
	const stackRef = useRef<HTMLSpanElement>(null);
	const workRef = useRef<HTMLSpanElement>(null);
	const doneRef = useRef<HTMLSpanElement>(null);
	const startedAtRef = useRef<number>(resolveStartEpoch(startedAt, Date.now()));
	const decisecondsRef = useRef(0);
	const settledRef = useRef(!working);
	const latest = useRef({ onSettle });
	latest.current = { onSettle };
	const traceId = useId();

	const isWorking = working;
	const isFailed = failed && !isWorking;
	const depth = reduce === true ? Math.min(breathDepth, 0.2) : breathDepth;
	const period = reduce === true ? breathPeriod * 1.5 : breathPeriod;
	const trough = 1 - depth;
	const sheen = shimmer && reduce !== true;

	// A backend activity line wins over the stage label; an absent activity keeps
	// the last honest label rather than inventing a message.
	const reportedActivity = activity?.trim();
	const workingText = reportedActivity ? reportedActivity : label;
	// A failed request reports its own outcome instead of the success label, so
	// the settled line never reads as a completed run.
	const settledText = isFailed ? failedLabel : doneLabel;
	const hasThinking = (thinkingText?.trim().length ?? 0) > 0;
	// Bare embeds a single inline activity line inside a parent card, so the
	// fold-out trace belongs to the parent layout instead of this component.
	const hasTrace = !bare && (steps.length > 0 || hasThinking);
	const toggle = hasTrace && collapsible;

	// A settled request reports the duration it actually took. The finish epoch
	// is the recorded settle time, never "now", so remounting the line after the
	// work finished cannot inflate the reported duration.
	const settledDeciseconds =
		finishedAt === undefined || finishedAt === null
			? null
			: Math.max(
					0,
					(resolveStartEpoch(finishedAt, Date.now()) - startedAtRef.current) /
						100,
				);

	useEffect(() => {
		startedAtRef.current = resolveStartEpoch(startedAt, startedAtRef.current);
	}, [startedAt]);

	useEffect(() => {
		if (isWorking) setOpen(true);
		else if (collapseOnSettle) setOpen(false);
	}, [isWorking, collapseOnSettle]);

	useEffect(() => {
		const glyphEl = glyphRef.current;
		const breathEl = breathRef.current;
		if (!breathEl) return undefined;
		const settleSeconds = settleDuration / 1000;
		const loop = (el: HTMLElement, delay: number) =>
			animate(
				el,
				{ opacity: [trough, 1, trough] },
				{ duration: period, ease: EASE_IN_OUT, repeat: Infinity, delay },
			);
		let cancelled = false;
		const running: AnimationPlaybackControls[] = [];
		if (isWorking) {
			if (depth > 0) {
				if (sheen)
					running.push(
						animate(
							breathEl,
							{ opacity: 1 },
							{ duration: 0.2, ease: EASE_OUT },
						),
					);
				if (glyphEl) {
					const lead = animate(
						glyphEl,
						{ opacity: trough },
						{ duration: 0.2, ease: EASE_OUT },
					);
					running.push(lead);
					void lead.then(() => {
						if (cancelled) return;
						running.push(loop(glyphEl, 0));
						if (!sheen) running.push(loop(breathEl, 0.14));
					});
				} else if (!sheen) {
					running.push(loop(breathEl, 0.14));
				}
			} else {
				if (glyphEl)
					running.push(
						animate(glyphEl, { opacity: 1 }, { duration: 0.2, ease: EASE_OUT }),
					);
				running.push(
					animate(breathEl, { opacity: 1 }, { duration: 0.2, ease: EASE_OUT }),
				);
			}
		} else {
			if (glyphEl)
				running.push(
					animate(
						glyphEl,
						{ opacity: GLYPH_DONE },
						{ duration: settleSeconds, ease: EASE_OUT },
					),
				);
			running.push(
				animate(
					breathEl,
					{ opacity: 1 },
					{ duration: settleSeconds, ease: EASE_OUT },
				),
			);
		}
		return () => {
			cancelled = true;
			for (const control of running) control.stop();
		};
	}, [isWorking, period, depth, trough, settleDuration, sheen]);

	useEffect(() => {
		const paint = (deciseconds: number) => {
			decisecondsRef.current = deciseconds;
			if (timerRef.current)
				timerRef.current.textContent = formatElapsed(deciseconds);
		};
		if (!isWorking) {
			// The recorded settle time wins over the last ticked value, so a line
			// mounted after the work finished still shows the real duration.
			paint(settledDeciseconds ?? decisecondsRef.current);
			return undefined;
		}
		// Reads startedAtRef on every tick, so a stage change re-anchors the clock
		// without restarting this interval.
		paint(Math.max(0, (Date.now() - startedAtRef.current) / 100));
		const id = setInterval(() => {
			paint(Math.max(0, (Date.now() - startedAtRef.current) / 100));
		}, 100);
		return () => clearInterval(id);
	}, [isWorking, settledDeciseconds]);

	// Keeps the clock visually anchored to the active label while the two labels
	// cross-fade. The ResizeObserver re-anchors it whenever either label's width
	// changes, so the label text itself is not a dependency.
	useEffect(() => {
		const timer = timerRef.current;
		const stack = stackRef.current;
		if (!timer || !stack) return undefined;
		const place = (glide: boolean) => {
			const active = isWorking ? workRef.current : doneRef.current;
			if (!active) return;
			const shift = active.offsetWidth - stack.offsetWidth;
			if (!glide) timer.style.transition = "none";
			timer.style.transform = `translateX(${shift}px)`;
			if (!glide) {
				void timer.offsetWidth;
				timer.style.transition = "";
			}
		};
		place(false);
		const observer =
			typeof ResizeObserver === "undefined"
				? null
				: new ResizeObserver(() => place(false));
		if (workRef.current) observer?.observe(workRef.current);
		if (doneRef.current) observer?.observe(doneRef.current);
		return () => observer?.disconnect();
	}, [isWorking]);

	// Only a real text change fades. The reported line is data from the server,
	// so this never animates on a timer and never replays on re-render.
	const lastTextRef = useRef(workingText);
	useEffect(() => {
		const previous = lastTextRef.current;
		lastTextRef.current = workingText;
		if (!fadeTextOnChange || previous === workingText) return;
		const el = breathRef.current;
		if (!el || reduce === true) return;
		const control = animate(
			el,
			{ opacity: [0.4, 1] },
			{ duration: 0.3, ease: EASE_OUT },
		);
		return () => control.stop();
	}, [workingText, fadeTextOnChange, reduce]);

	useEffect(() => {
		if (isWorking) {
			setAnnounce(workingText);
			return;
		}
		if (settledRef.current) return;
		settledRef.current = true;
		setAnnounce(
			showTimer
				? `${settledText} selama ${spokenElapsed(decisecondsRef.current)}`
				: settledText,
		);
		latest.current.onSettle?.(decisecondsRef.current / 10);
	}, [isWorking, workingText, settledText, showTimer]);

	useEffect(() => {
		if (working) settledRef.current = false;
	}, [working]);

	const displayThinking =
		thinkingText && thinkingText.length > MAX_THINKING_CHARS
			? `…${thinkingText.slice(-MAX_THINKING_CHARS)}`
			: thinkingText;

	const styleVars: CSSProperties & Record<`--tl-${string}`, string> = {
		"--tl-font": `${fontSize}px`,
		"--tl-settle": `${settleDuration}ms`,
		"--tl-blur": `${settleBlur}px`,
		"--tl-shimmer": `${shimmerDuration}s`,
	};

	// Bare embeds one inline activity line inside a parent card, so the trace and
	// the chevron belong to the parent layout, not here.
	const head = (
		<>
			{glyph !== "none" ? (
				<span
					ref={glyphRef}
					className="thought-line__glyph"
					data-failed={isFailed ? "" : undefined}
					aria-hidden="true"
				>
					{isFailed ? (
						<Icon icon={AlertCircleIcon} size="100%" />
					) : glyph === "sparkle" ? (
						<Icon icon={SparklesIcon} size="100%" />
					) : glyph === "dot" ? (
						<span className="thought-line__dot" />
					) : (
						glyph
					)}
				</span>
			) : null}
			<span ref={stackRef} className="thought-line__label" aria-hidden="true">
				<span
					ref={workRef}
					className="thought-line__text"
					data-active={isWorking ? "" : undefined}
				>
					<span
						ref={breathRef}
						className="thought-line__breath"
						data-shimmer={sheen ? "" : undefined}
					>
						{workingText}
					</span>
				</span>
				<span
					ref={doneRef}
					className="thought-line__text thought-line__text--done"
					data-active={isWorking ? undefined : ""}
					data-failed={isFailed ? "" : undefined}
				>
					{settledText}
				</span>
			</span>
			{showTimer ? (
				<span
					ref={timerRef}
					role="timer"
					aria-label="Waktu proses"
					className="thought-line__timer"
					data-done={isWorking ? undefined : ""}
				>
					0.0s
				</span>
			) : null}
			{collapsible ? (
				<span
					className="thought-line__chevron"
					data-on={hasTrace ? "" : undefined}
					aria-hidden="true"
				>
					<Icon icon={ArrowDown01Icon} size="1em" />
				</span>
			) : null}
			<output className="thought-line__sr" aria-live="polite">
				{announce}
			</output>
		</>
	);

	return (
		<div
			className={cn("thought-line", !bare && "thought-line--card", className)}
			data-working={isWorking ? "" : undefined}
			data-failed={isFailed ? "" : undefined}
			data-open={open && hasTrace ? "" : undefined}
			data-wrap={wrap ? "" : undefined}
			style={styleVars}
		>
			{collapsible ? (
				<button
					type="button"
					className="thought-line__head"
					data-toggle={toggle ? "" : undefined}
					aria-expanded={toggle ? open : undefined}
					tabIndex={toggle ? 0 : -1}
					onClick={() => {
						if (toggle) setOpen((value) => !value);
					}}
				>
					{head}
				</button>
			) : (
				<div className="thought-line__head">{head}</div>
			)}

			{hasTrace ? (
				<div
					className="thought-line__trace"
					data-open={open ? "" : undefined}
					aria-hidden={!open}
				>
					<div className="thought-line__fold">
						{steps.length > 0 ? (
							<ol className="thought-line__steps">
								{steps.map((text, index) => {
									const done =
										!isWorking ||
										(activeStep === undefined
											? index < steps.length - 1
											: index < activeStep);
									return (
										<li
											// biome-ignore lint/suspicious/noArrayIndexKey: stage labels can repeat; position is the stable identity here
											key={`${index}-${text}`}
											className="thought-line__step"
											data-done={done ? "" : undefined}
										>
											<span className="thought-line__mark" aria-hidden="true">
												{done ? (
													<Icon
														icon={Tick01Icon}
														size="100%"
														strokeWidth={2.5}
													/>
												) : (
													<i className="thought-line__pulse" />
												)}
											</span>
											<span className="thought-line__step-text">{text}</span>
										</li>
									);
								})}
							</ol>
						) : null}
						{hasThinking ? (
							<div className="thought-line__thinking">
								{collapsible ? (
									<button
										type="button"
										onClick={() => setOpen((value) => !value)}
										aria-expanded={open}
										aria-controls={traceId}
										className="thought-line__thinking-toggle"
									>
										<span className="thought-line__thinking-label">
											{THINKING_LABEL}
										</span>
										<Icon
											icon={ArrowDown01Icon}
											size={14}
											className="shrink-0"
											aria-hidden
										/>
									</button>
								) : (
									<span className="thought-line__thinking-label">
										{THINKING_LABEL}
									</span>
								)}
								{open || !collapsible ? (
									<pre id={traceId} className="thought-line__thinking-body">
										{displayThinking}
									</pre>
								) : null}
							</div>
						) : null}
					</div>
				</div>
			) : null}
		</div>
	);
}
