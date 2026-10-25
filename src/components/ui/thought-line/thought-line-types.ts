import type { ReactNode } from "react";

/** Glyph slot: a named built-in, a caller-supplied node, or none. */
export type ThoughtLineGlyph = "sparkle" | "dot" | "none" | ReactNode;

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
	glyph?: ThoughtLineGlyph;
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
