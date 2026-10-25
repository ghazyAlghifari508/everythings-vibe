"use client";

import {
	AlertCircleIcon,
	ArrowDown01Icon,
	SparklesIcon,
} from "@hugeicons/core-free-icons";
import {
	type AnimationPlaybackControls,
	animate,
	useReducedMotionConfig,
} from "framer-motion";
import { type RefObject, useEffect, useRef } from "react";
import { Icon } from "../icon";
import type { ThoughtLineGlyph } from "./thought-line-types";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];
const EASE_IN_OUT: [number, number, number, number] = [0.77, 0, 0.175, 1];
const GLYPH_DONE = 0.55;

export interface ThoughtLineHeaderProps {
	working: boolean;
	isFailed: boolean;
	glyph: ThoughtLineGlyph;
	workingText: string;
	settledText: string;
	announce: string;
	showTimer: boolean;
	collapsible: boolean;
	hasTrace: boolean;
	fadeTextOnChange: boolean;
	breathPeriod: number;
	breathDepth: number;
	shimmer: boolean;
	settleDuration: number;
	timerRef: RefObject<HTMLSpanElement | null>;
}

/**
 * Status presentation for a ThoughtLine: breathing glyph, cross-fading label,
 * the directly painted timer, the fold chevron, and the polite live region.
 * Owns the label-alignment observer and the text-change fade.
 */
export function ThoughtLineHeader({
	working,
	isFailed,
	glyph,
	workingText,
	settledText,
	announce,
	showTimer,
	collapsible,
	hasTrace,
	fadeTextOnChange,
	breathPeriod,
	breathDepth,
	shimmer,
	settleDuration,
	timerRef,
}: ThoughtLineHeaderProps) {
	const reduce = useReducedMotionConfig();
	const glyphRef = useRef<HTMLSpanElement>(null);
	const breathRef = useRef<HTMLSpanElement>(null);
	const stackRef = useRef<HTMLSpanElement>(null);
	const workRef = useRef<HTMLSpanElement>(null);
	const doneRef = useRef<HTMLSpanElement>(null);
	const lastTextRef = useRef(workingText);

	const depth = reduce === true ? Math.min(breathDepth, 0.2) : breathDepth;
	const period = reduce === true ? breathPeriod * 1.5 : breathPeriod;
	const trough = 1 - depth;
	const sheen = shimmer && reduce !== true;

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
		if (working) {
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
	}, [working, period, depth, trough, settleDuration, sheen]);

	// Keeps the clock visually anchored to the active label while the two labels
	// cross-fade. The ResizeObserver re-anchors it whenever either label's width
	// changes, so the label text itself is not a dependency.
	useEffect(() => {
		const timer = timerRef.current;
		const stack = stackRef.current;
		if (!timer || !stack) return undefined;
		const place = (glide: boolean) => {
			const active = working ? workRef.current : doneRef.current;
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
	}, [working, timerRef]);

	// Only a real text change fades. The reported line is data from the server,
	// so this never animates on a timer and never replays on re-render.
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

	return (
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
					data-active={working ? "" : undefined}
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
					data-active={working ? undefined : ""}
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
					data-done={working ? undefined : ""}
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
}
