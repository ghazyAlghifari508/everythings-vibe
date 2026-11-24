import type {
	StudioFrameRow,
	StudioJobRow,
	StudioMessageRow,
	StudioRevisionRow,
} from "@/db/schema";
import type {
	StudioMessageFrame,
	StudioMessageProgress,
} from "../types/studio-conversation";
import { extractCleanHtml } from "../utils/clean-html";
import { STUDIO_ADD_FRAME_PLACEHOLDER_NAME } from "./studio-composer-intent";
import {
	compareStudioFrameHtml,
	extractStudioFrameFacts,
} from "./studio-frame-facts";

const active = ["queued", "planning", "generating"];
const NEW_SCREEN_NAME = "Layar baru";

/** The committed HTML history rows a revision explanation compares. */
export type StudioRevisionHtml = Pick<
	StudioRevisionRow,
	"frameId" | "frameRevision" | "jobId" | "htmlCode"
>;

function operationKind(related: StudioJobRow[]) {
	return related.some((job) => job.jobType === "initial")
		? "initial"
		: related.some((job) => job.jobType === "add")
			? "add"
			: "revise";
}

/**
 * Revision history a revise turn still has to read: one row per completed job
 * whose result is not yet frozen in the stored progress, plus the revision that
 * job started from. Everything else is already pinned and is never refetched.
 */
export function studioMessageHistoryNeeds(
	message: StudioMessageRow,
	jobs: StudioJobRow[],
) {
	const related = jobs.filter((job) => message.jobIds.includes(job.id));
	const needs = {
		jobIds: [] as string[],
		before: [] as { frameId: string; revision: number }[],
	};
	if (operationKind(related) !== "revise") return needs;
	for (const job of related) {
		if (job.status !== "completed" || !job.targetFrameId) continue;
		const frozen = message.progress?.frames?.find(
			(entry) => entry.frameId === job.targetFrameId,
		);
		if (frozen?.status === "ready" && frozen.facts) continue;
		needs.jobIds.push(job.id);
		if (job.baseRevision)
			needs.before.push({
				frameId: job.targetFrameId,
				revision: job.baseRevision,
			});
	}
	return needs;
}

function latestJob(jobs: StudioJobRow[]): StudioJobRow | undefined {
	return jobs.reduce<StudioJobRow | undefined>(
		(latest, job) =>
			!latest || job.createdAt > latest.createdAt ? job : latest,
		undefined,
	);
}

/**
 * The real frames one operation produced or targeted. A frame that is already
 * ready keeps the revision, facts and changes recorded when it became ready, so
 * a later edit of the canvas frame, or another operation, cannot rewrite what
 * this turn reported.
 */
function frameResults(
	message: StudioMessageRow,
	related: StudioJobRow[],
	targets: StudioFrameRow[],
	kind: "initial" | "add" | "revise",
	history: readonly StudioRevisionHtml[],
): StudioMessageFrame[] {
	const previous = new Map(
		(message.progress?.frames ?? []).map((entry) => [entry.frameId, entry]),
	);
	const results: StudioMessageFrame[] = [];
	const seen = new Set<string>();
	for (const frame of targets) {
		if (seen.has(frame.id)) continue;
		seen.add(frame.id);
		const job =
			kind === "initial"
				? undefined
				: latestJob(
						related.filter((entry) => entry.targetFrameId === frame.id),
					);
		const status: StudioMessageFrame["status"] =
			kind === "initial"
				? frame.htmlCode && frame.revision > 0
					? "ready"
					: frame.status === "failed" && !frame.htmlCode
						? "failed"
						: "pending"
				: job?.status === "completed" &&
						frame.htmlCode &&
						frame.revision > (job.baseRevision ?? 0)
					? "ready"
					: job?.status === "failed"
						? "failed"
						: "pending";
		const base = {
			frameId: frame.id,
			name:
				frame.name === STUDIO_ADD_FRAME_PLACEHOLDER_NAME
					? NEW_SCREEN_NAME
					: frame.name,
			viewport:
				frame.viewport === "mobile" ? ("mobile" as const) : ("web" as const),
		};
		const frozen = previous.get(frame.id);
		if (status === "ready" && frozen?.status === "ready" && frozen.facts) {
			results.push({
				...base,
				status,
				revision: frozen.revision,
				facts: frozen.facts,
				...(frozen.changes ? { changes: frozen.changes } : {}),
			});
			continue;
		}
		if (status !== "ready") {
			results.push({ ...base, status, revision: frame.revision });
			continue;
		}
		const produced =
			kind === "revise" && job
				? history.find(
						(row) => row.jobId === job.id && row.frameId === frame.id,
					)
				: undefined;
		const html = extractCleanHtml(produced?.htmlCode ?? frame.htmlCode ?? "");
		const before =
			kind === "revise" && job?.baseRevision
				? history.find(
						(row) =>
							row.frameId === frame.id &&
							row.frameRevision === job.baseRevision &&
							row.jobId !== job.id,
					)?.htmlCode
				: undefined;
		results.push({
			...base,
			status,
			revision: produced?.frameRevision ?? frame.revision,
			...(html ? { facts: extractStudioFrameFacts(html) } : {}),
			...(html && before
				? { changes: compareStudioFrameHtml(extractCleanHtml(before), html) }
				: {}),
		});
	}
	return results;
}

/** A revision is successful only after its own job persisted a newer frame version. */
export function resolveStudioMessageProgress(
	message: StudioMessageRow,
	jobs: StudioJobRow[],
	frames: StudioFrameRow[],
	deferred?: string[],
	history: readonly StudioRevisionHtml[] = [],
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
	const kind = operationKind(related);
	const results =
		initial && !planned
			? []
			: frameResults(message, related, targets, kind, history);
	return {
		phase,
		ready,
		total,
		failed,
		kind,
		...(results.length ? { frames: results } : {}),
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
