"use client";

import { type RefObject, useEffect, useRef, useState } from "react";
import {
	formatElapsed,
	normalizeSettledDeciseconds,
	resolveStartEpoch,
	spokenElapsed,
} from "./thought-line-timing";

export interface UseThoughtStreamOptions {
	working: boolean;
	/** Honest fallback announcement before any activity text arrives. */
	label: string;
	/** The reported working text. Never fabricated, never rotated on a timer. */
	workingText: string;
	settledText: string;
	showTimer: boolean;
	collapseOnSettle: boolean;
	startedAt?: number | string | Date;
	finishedAt?: number | string | Date | null;
	onSettle?: (elapsedSec: number) => void;
}

export interface UseThoughtStreamResult {
	/** Attach to the timer element the hook paints directly, without re-renders. */
	timerRef: RefObject<HTMLSpanElement | null>;
	open: boolean;
	toggleOpen: () => void;
	announce: string;
}

/**
 * Elapsed-time and settle lifecycle for ThoughtLine: real start/finish epochs,
 * the tick clock, trace fold state, and the single polite announcement. The
 * clock is painted through a ref so a 100ms tick never re-renders the line.
 */
export function useThoughtStream({
	working,
	label,
	workingText,
	settledText,
	showTimer,
	collapseOnSettle,
	startedAt,
	finishedAt,
	onSettle,
}: UseThoughtStreamOptions): UseThoughtStreamResult {
	const [open, setOpen] = useState(true);
	const [announce, setAnnounce] = useState(label);
	const timerRef = useRef<HTMLSpanElement>(null);
	const startedAtRef = useRef<number>(resolveStartEpoch(startedAt, Date.now()));
	const decisecondsRef = useRef(0);
	const settledRef = useRef(!working);
	const onSettleRef = useRef(onSettle);
	onSettleRef.current = onSettle;

	useEffect(() => {
		startedAtRef.current = resolveStartEpoch(startedAt, startedAtRef.current);
	}, [startedAt]);

	useEffect(() => {
		if (working) setOpen(true);
		else if (collapseOnSettle) setOpen(false);
	}, [working, collapseOnSettle]);

	// A settled request reports the duration it actually took. The finish epoch
	// is the recorded settle time, never "now", so remounting the line after the
	// work finished cannot inflate the reported duration.
	const settledDeciseconds = normalizeSettledDeciseconds(
		finishedAt,
		startedAtRef.current,
	);

	useEffect(() => {
		const paint = (deciseconds: number) => {
			decisecondsRef.current = deciseconds;
			if (timerRef.current)
				timerRef.current.textContent = formatElapsed(deciseconds);
		};
		if (!working) {
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
	}, [working, settledDeciseconds]);

	useEffect(() => {
		if (working) {
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
		onSettleRef.current?.(decisecondsRef.current / 10);
	}, [working, workingText, settledText, showTimer]);

	useEffect(() => {
		if (working) settledRef.current = false;
	}, [working]);

	return {
		timerRef,
		open,
		toggleOpen: () => setOpen((value) => !value),
		announce,
	};
}
