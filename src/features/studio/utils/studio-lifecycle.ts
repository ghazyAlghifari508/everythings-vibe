import type { StudioFrameRow, StudioJobRow } from "@/db/schema";
import type { StudioStatus } from "../types/studio-status";

export function isTemporarySlot(
	frame: Pick<StudioFrameRow, "name" | "description" | "htmlCode">,
): boolean {
	return (
		/^Layar \d+$/.test(frame.name) &&
		(frame.description ?? "") === "" &&
		frame.htmlCode == null
	);
}

export function isStudioJobRunning(job: StudioJobRow | null): boolean {
	return !!job && ["queued", "planning", "generating"].includes(job.status);
}

export function deriveStudioLifecycle({
	project,
	frames,
	activeJob,
	jobs,
}: StudioStatus) {
	const isProcessing =
		jobs?.some(isStudioJobRunning) ||
		(activeJob
			? isStudioJobRunning(activeJob)
			: frames.some(
					(frame) => frame.status === "queued" || frame.status === "generating",
				));
	const planningJob =
		jobs?.find((job) => job.jobType === "initial") ?? activeJob;
	const planningFailed =
		planningJob?.jobType === "initial" &&
		planningJob.status === "failed" &&
		!project.designBlueprint &&
		frames.every(isTemporarySlot);
	const inconsistent =
		!!activeJob &&
		!isProcessing &&
		!planningFailed &&
		(frames.length === 0 ||
			frames.some(
				(frame) =>
					frame.status === "queued" ||
					frame.status === "generating" ||
					(frame.status === "ready" && !frame.htmlCode?.trim()),
			) ||
			(activeJob.jobType === "initial" &&
				activeJob.status === "completed" &&
				!project.designBlueprint));
	return {
		phase: activeJob?.status ?? "idle",
		isProcessing,
		planningFailed,
		canRetryPlanning: planningFailed,
		inconsistent,
	};
}

export function resolveStudioFrameStatus(
	frame: StudioFrameRow,
	job: StudioJobRow | null,
): string {
	if (isStudioJobRunning(job)) {
		if (
			frame.status === "failed" &&
			!frame.htmlCode &&
			job &&
			(job.targetFrameId === frame.id ||
				(job.jobType === "initial" && isTemporarySlot(frame)))
		)
			return job.status === "generating" ? "generating" : "queued";
	} else if (
		job &&
		(frame.status === "queued" || frame.status === "generating")
	) {
		return frame.htmlCode?.trim() ? "ready" : "failed";
	}
	return frame.status;
}
