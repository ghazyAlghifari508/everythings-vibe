import type {
	StudioFrameRow,
	StudioJobRow,
	StudioMessageRow,
} from "@/db/schema";
import type { StudioMessageProgress } from "../types/studio-conversation";

const active = ["queued", "planning", "generating"];

/** A revision is successful only after its own job persisted a newer frame version. */
export function resolveStudioMessageProgress(
	message: StudioMessageRow,
	jobs: StudioJobRow[],
	frames: StudioFrameRow[],
	deferred?: string[],
): StudioMessageProgress {
	const related = jobs.filter((job) => message.jobIds.includes(job.id));
	const initial = related.find((job) => job.jobType === "initial");
	const planned = Boolean(initial?.planningCompletedAt);
	const targets = initial
		? frames.filter((frame) => frame.originJobId === initial.id)
		: frames.filter((frame) =>
				related.some((job) => job.targetFrameId === frame.id),
			);
	const total = initial ? targets.length : related.length;
	const ready = initial
		? targets.filter((frame) => frame.htmlCode && frame.revision > 0).length
		: related.filter(
				(job) =>
					job.status === "completed" &&
					targets.some(
						(frame) =>
							frame.id === job.targetFrameId &&
							frame.htmlCode &&
							frame.revision > (job.baseRevision ?? 0),
					),
			).length;
	const failed = initial
		? targets.filter((frame) => !frame.htmlCode && frame.status === "failed")
				.length
		: related.filter((job) => job.status === "failed").length;
	const recovering = initial
		? jobs.filter(
				(job) =>
					job.jobType === "retry" &&
					targets.some(
						(frame) => frame.id === job.targetFrameId && !frame.htmlCode,
					),
			)
		: [];
	const live = [...related, ...recovering];
	const running = live.some((job) => active.includes(job.status));
	const phase = live.some((job) => job.status === "planning")
		? "planning"
		: running
			? live.some((job) => job.status === "generating")
				? "generating"
				: "queued"
			: total > 0 && ready === total
				? "completed"
				: ready > 0
					? "partial"
					: "failed";
	const failedFrames = initial
		? targets.filter((frame) => !frame.htmlCode && frame.status === "failed")
		: frames.filter((frame) =>
				related.some(
					(job) => job.status === "failed" && job.targetFrameId === frame.id,
				),
			);
	return {
		phase,
		ready,
		total,
		failed,
		kind: initial
			? "initial"
			: related.some((job) => job.jobType === "add")
				? "add"
				: "revise",
		...(failedFrames.length
			? { failedScreens: failedFrames.map((frame) => frame.name) }
			: {}),
		...(initial && planned && deferred?.length ? { deferred } : {}),
		screenNames:
			initial && !planned
				? []
				: initial && message.progress?.screenNames.length
					? message.progress.screenNames
					: targets.map((frame) => frame.name),
		recovery:
			running || phase === "completed"
				? null
				: initial && !planned
					? "planning"
					: initial || related.some((job) => job.jobType === "add")
						? "frames"
						: "resubmit",
	};
}
