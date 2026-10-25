"use client";

import { Loading02Icon, PauseCircleIcon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { ThoughtLine } from "@/components/ui/thought-line";
import type { ScrapeStatus } from "@/db/schema";
import { ElapsedTimer } from "./scrape-progress-elapsed";
import { LABELS } from "./scrape-progress-steps";

export interface ScrapeActivityLineProps {
	status: ScrapeStatus;
	/** Already humanised activity copy, or null when the stage label is honest. */
	activity: string | null;
	stageStartedAt: string | null;
	/** Server-reported reason the current stage stopped making progress. */
	stalledMessage: string | null;
}

// One activity line for every scrape mode. Running work gets the repository's
// ReactBits-derived ThoughtLine (breathing glyph, soft shimmer, single polite
// announcement) so the line is animated by a ready-made component rather than
// a local imitation. Queued and stalled runs stay static: nothing is spinning
// while the backend is not working.
export function ScrapeActivityLine({
	status,
	activity,
	stageStartedAt,
	stalledMessage,
}: ScrapeActivityLineProps) {
	const isDone = status === "completed";
	const isWorking = !isDone && status !== "failed";

	if (stalledMessage) {
		return (
			<div data-activity-state="stalled" className="flex items-start gap-2">
				<Icon
					icon={PauseCircleIcon}
					size={16}
					aria-hidden
					data-activity-stalled-marker
					className="mt-0.5 shrink-0 text-fog"
				/>
				<div className="min-w-0">
					<p className="text-sm font-semibold text-snow">Pemrosesan tertunda</p>
					<p className="mt-1 break-words text-xs leading-5 text-fog">
						{stalledMessage}
					</p>
				</div>
			</div>
		);
	}

	if (status === "queued") {
		return (
			<div data-activity-state="queued" className="flex items-start gap-2">
				<span
					aria-hidden
					className="mt-1.5 size-1.5 shrink-0 rounded-full border border-slate"
				/>
				<p className="text-sm text-fog">Menunggu giliran pemrosesan.</p>
			</div>
		);
	}

	return (
		<div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
			<ThoughtLine
				bare
				wrap
				fadeTextOnChange
				collapsible={false}
				showTimer={false}
				working={isWorking}
				label={LABELS[status]}
				doneLabel="Semua tahapan selesai"
				activity={activity}
				className="min-w-0 flex-1"
				glyph={
					isWorking ? (
						<Icon
							icon={Loading02Icon}
							size="1em"
							data-activity-spinner
							className="motion-safe:animate-spin motion-reduce:animate-none"
						/>
					) : (
						"none"
					)
				}
			/>
			{isWorking && stageStartedAt ? (
				<ElapsedTimer start={stageStartedAt} />
			) : null}
		</div>
	);
}
