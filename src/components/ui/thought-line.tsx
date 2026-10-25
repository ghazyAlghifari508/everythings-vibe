"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { ThoughtLineHeader } from "./thought-line/thought-line-header";
import { ThoughtLineTrace } from "./thought-line/thought-line-trace";
import type { ThoughtLineProps } from "./thought-line/thought-line-types";
import { useThoughtStream } from "./thought-line/use-thought-stream";

export type { ThoughtLineProps } from "./thought-line/thought-line-types";

// Behaviour contract ported from the ReactBits ThoughtLine micro-interaction
// (https://reactbits.dev/micro/thought-line): a reasoning-trace header with a
// breathing glyph, a live clock that glides between the working and settled
// labels, and a fold-out step trace. Paint comes from the everythings-vibe theme
// tokens (see .thought-line in globals.css) instead of ReactBits' own palette.
const EMPTY_STEPS: readonly string[] = [];

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
	const isWorking = working;
	const isFailed = failed && !isWorking;

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

	const { timerRef, open, toggleOpen, announce } = useThoughtStream({
		working: isWorking,
		label,
		workingText,
		settledText,
		showTimer,
		collapseOnSettle,
		startedAt,
		finishedAt,
		onSettle,
	});

	const styleVars: CSSProperties & Record<`--tl-${string}`, string> = {
		"--tl-font": `${fontSize}px`,
		"--tl-settle": `${settleDuration}ms`,
		"--tl-blur": `${settleBlur}px`,
		"--tl-shimmer": `${shimmerDuration}s`,
	};

	const header = (
		<ThoughtLineHeader
			working={isWorking}
			isFailed={isFailed}
			glyph={glyph}
			workingText={workingText}
			settledText={settledText}
			announce={announce}
			showTimer={showTimer}
			collapsible={collapsible}
			hasTrace={hasTrace}
			fadeTextOnChange={fadeTextOnChange}
			breathPeriod={breathPeriod}
			breathDepth={breathDepth}
			shimmer={shimmer}
			settleDuration={settleDuration}
			timerRef={timerRef}
		/>
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
						if (toggle) toggleOpen();
					}}
				>
					{header}
				</button>
			) : (
				<div className="thought-line__head">{header}</div>
			)}

			{hasTrace ? (
				<ThoughtLineTrace
					open={open}
					onToggle={toggleOpen}
					working={isWorking}
					steps={steps}
					activeStep={activeStep}
					thinkingText={thinkingText}
					collapsible={collapsible}
				/>
			) : null}
		</div>
	);
}
