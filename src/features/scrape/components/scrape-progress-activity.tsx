"use client";

import { Tick01Icon } from "@hugeicons/core-free-icons";
import { Orb, type OrbState } from "@yogesharc/thinking-orbs";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { ThoughtLine } from "@/components/ui/thought-line";
import type { ScrapeStatus } from "@/db/schema";
import { cn } from "@/lib/utils";
import { ElapsedTimer } from "./scrape-progress-elapsed";

export const SCRAPE_ACTIVITY_WAITING_COPY = "Menunggu giliran pemrosesan.";
export const SCRAPE_ACTIVITY_DONE_COPY = "Proses selesai";

export interface ScrapeActivityLineProps {
	status: ScrapeStatus;
	/** Already humanised activity copy; null when the stage label is honest. */
	activity?: string | null;
	/** Stage label reported by the backend while no activity copy has arrived. */
	fallbackLabel?: string;
	/** Persisted start of the current stage, when the backend recorded one. */
	stageStartedAt?: string | null;
	/** Persisted start of the latest activity update; only a timer fallback. */
	activityStartedAt?: string | null;
	/** Server-reported stall reason; never inferred on the client. */
	stalledMessage?: string | null;
	className?: string;
}

interface StageStartAnchor {
	stage: ScrapeStatus;
	start: string | null;
}

// One orb per backend stage, chosen from what the worker really does in that
// stage: the browser capture drives a browser, inspecting evidence is plain
// work, the DESIGN.md stage is the AI synthesis call, and saving writes to disk.
// Terminal states get no orb: a stopped run must not keep animating.
const STAGE_ORB_STATES: Partial<Record<ScrapeStatus, OrbState>> = {
	queued: "waiting",
	capturing: "using",
	extracting: "working",
	generating: "reasoning",
	saving: "working",
};

export function resolveScrapeOrbState(status: ScrapeStatus): OrbState | null {
	return STAGE_ORB_STATES[status] ?? null;
}

// The orb paints in the current text colour and takes no data attributes, so a
// zero-box wrapper reports the rendered state to the DOM (and to tests).
function ScrapeActivityOrb({
	state,
	size = 16,
}: {
	state: OrbState;
	size?: number;
}) {
	return (
		<span className="contents" data-activity-orb={state}>
			<Orb state={state} size={size} />
		</span>
	);
}

// The clock measures the current stage, not the current activity string. When
// the row has no `stageStartedAt`, every activity write also rewrites
// `activityStartedAt`, so anchoring straight to it would restart the timer
// although the stage never moved.
function useStageStart(
	stage: ScrapeStatus,
	stageStartedAt: string | null,
	activityStartedAt: string | null,
): string | null {
	const reported = stageStartedAt ?? activityStartedAt;
	const [anchor, setAnchor] = useState<StageStartAnchor>(() => ({
		stage,
		start: reported,
	}));
	if (anchor.stage !== stage || (anchor.start === null && reported !== null))
		setAnchor({ stage, start: reported });
	const anchored = anchor.stage === stage ? anchor.start : reported;
	return stageStartedAt ?? anchored;
}

// The single live activity line for every scrape mode. Running work reuses the
// repository ThoughtLine (ReactBits port) with an official Thinking Orb in the
// glyph slot instead of a second spinner, evidence-backed text with a soft
// shimmer, one short fade when the label actually changes, and the persisted
// clock beside it. Nothing animates once the backend stops reporting work, and
// reduced motion removes the shimmer, the fade and the orb's motion.
export function ScrapeActivityLine({
	status,
	activity = null,
	fallbackLabel = "",
	stageStartedAt = null,
	activityStartedAt = null,
	stalledMessage = null,
	className,
}: ScrapeActivityLineProps) {
	const start = useStageStart(status, stageStartedAt, activityStartedAt);
	// Read synchronously so the first paint already honours the preference; the
	// shared stylesheet also disables the shimmer for the server-rendered frame.
	const reduceMotion =
		typeof window !== "undefined" &&
		typeof window.matchMedia === "function" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches;

	// Failure keeps its own reason and recovery copy in the progress panel, so
	// this line never dresses a stopped run up as an active one.
	if (status === "failed") return null;

	if (stalledMessage) {
		return (
			<p
				data-activity-line
				data-activity-state="stalled"
				className={cn("break-words text-sm text-fog", className)}
			>
				{stalledMessage}
			</p>
		);
	}

	if (status === "queued") {
		return (
			<p
				data-activity-line
				data-activity-state="queued"
				className={cn(
					"flex min-w-0 items-center gap-2 text-sm text-fog",
					className,
				)}
			>
				<ScrapeActivityOrb state="waiting" />
				<span className="min-w-0 break-words">
					{SCRAPE_ACTIVITY_WAITING_COPY}
				</span>
			</p>
		);
	}

	const working = status !== "completed";
	// Every unlisted status still runs the worker, so it keeps a working orb
	// rather than dropping the indicator on the floor.
	const orbState = resolveScrapeOrbState(status) ?? "working";

	return (
		<div
			data-activity-line
			data-activity-state={working ? "running" : "completed"}
			className={cn("flex min-w-0 items-baseline gap-2", className)}
		>
			<ThoughtLine
				bare
				wrap
				fadeTextOnChange={!reduceMotion}
				collapsible={false}
				showTimer={false}
				shimmer={!reduceMotion}
				breathDepth={0}
				working={working}
				activity={activity}
				label={fallbackLabel}
				doneLabel={SCRAPE_ACTIVITY_DONE_COPY}
				className="min-w-0 flex-1"
				glyph={
					working ? (
						<ScrapeActivityOrb state={orbState} />
					) : (
						<Icon
							icon={Tick01Icon}
							size="1em"
							data-activity-done-marker
							className="text-mist"
						/>
					)
				}
			/>
			{working && start ? <ElapsedTimer start={start} /> : null}
		</div>
	);
}
