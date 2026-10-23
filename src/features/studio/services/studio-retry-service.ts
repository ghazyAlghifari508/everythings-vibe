import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
	type StudioFrameRow,
	type StudioJobRow,
	studioFrames,
	studioJobs,
	studioProjects,
} from "@/db/schema";
import type { StudioFrameRetryOutcome } from "../types/studio";
import { StudioFrameError } from "./studio-frame-errors";

export interface StudioFrameRetryResult {
	frame: StudioFrameRow;
	retry: StudioFrameRetryOutcome;
}

const resetClaim = {
	status: "queued",
	error: null,
	claimedBy: null,
	claimedAt: null,
	leaseExpiresAt: null,
	attempts: 0,
	startedAt: null,
	finishedAt: null,
};

export async function retryStudioFrame(
	projectId: string,
	userId: string,
	frameId: string,
): Promise<StudioFrameRetryResult> {
	return db.transaction(async (tx): Promise<StudioFrameRetryResult> => {
		// The project row lock serializes two retries for the same frame, so the
		// second request observes the queued frame instead of queueing a duplicate.
		const [project] = await tx
			.select()
			.from(studioProjects)
			.where(
				and(
					eq(studioProjects.id, projectId),
					eq(studioProjects.userId, userId),
				),
			)
			.for("update");
		if (!project) throw new StudioFrameError("STUDIO_NOT_FOUND");
		const [frame] = await tx
			.select()
			.from(studioFrames)
			.where(
				and(
					eq(studioFrames.id, frameId),
					eq(studioFrames.projectId, projectId),
				),
			);
		if (!frame) throw new StudioFrameError("STUDIO_NOT_FOUND");
		// A frame that still renders is never thrown away by a stale retry.
		if (frame.status === "ready" && frame.htmlCode)
			return { frame, retry: "completed" };
		if (frame.status === "queued" || frame.status === "generating")
			return { frame, retry: "already-running" };
		const [active] = await tx
			.select({ id: studioJobs.id })
			.from(studioJobs)
			.where(
				and(
					eq(studioJobs.projectId, projectId),
					eq(studioJobs.userId, userId),
					eq(studioJobs.targetFrameId, frameId),
					inArray(studioJobs.status, ["queued", "planning", "generating"]),
				),
			)
			.limit(1);
		if (active) return { frame, retry: "already-running" };
		const [operation] = await tx
			.select()
			.from(studioJobs)
			.where(
				and(
					eq(studioJobs.projectId, projectId),
					eq(studioJobs.userId, userId),
					eq(studioJobs.targetFrameId, frameId),
					eq(studioJobs.status, "failed"),
				),
			)
			.orderBy(desc(studioJobs.createdAt))
			.limit(1);
		if (operation) {
			await tx
				.update(studioJobs)
				.set({ ...resetClaim, updatedAt: new Date() })
				.where(
					and(eq(studioJobs.id, operation.id), eq(studioJobs.userId, userId)),
				);
		} else {
			const [initial] = await tx
				.select()
				.from(studioJobs)
				.where(
					and(
						eq(studioJobs.projectId, projectId),
						eq(studioJobs.userId, userId),
						eq(studioJobs.jobType, "initial"),
					),
				)
				.orderBy(asc(studioJobs.createdAt))
				.limit(1);
			await tx.insert(studioJobs).values({
				projectId,
				userId,
				jobType: "retry",
				targetFrameId: frameId,
				prompt: initial?.prompt ?? frame.description ?? frame.name,
			});
		}
		// Only the failed state is reset; the frame keeps its last HTML so a
		// failed revision still has content to correct.
		const [updated] = await tx
			.update(studioFrames)
			.set({ status: "queued", error: null, updatedAt: new Date() })
			.where(
				and(
					eq(studioFrames.id, frameId),
					eq(studioFrames.projectId, projectId),
				),
			)
			.returning();
		if (!updated) throw new StudioFrameError("STUDIO_STORAGE_FAILED");
		return { frame: updated, retry: "queued" };
	});
}

export async function retryStudioPlanning(
	projectId: string,
	userId: string,
): Promise<StudioJobRow> {
	return db.transaction(async (tx) => {
		const [project] = await tx
			.select()
			.from(studioProjects)
			.where(
				and(
					eq(studioProjects.id, projectId),
					eq(studioProjects.userId, userId),
				),
			)
			.for("update");
		if (!project) throw new StudioFrameError("STUDIO_NOT_FOUND");
		const [job] = await tx
			.select()
			.from(studioJobs)
			.where(
				and(
					eq(studioJobs.projectId, projectId),
					eq(studioJobs.userId, userId),
					eq(studioJobs.jobType, "initial"),
				),
			)
			.orderBy(desc(studioJobs.createdAt))
			.limit(1);
		if (!job) throw new StudioFrameError("STUDIO_NOT_FOUND");
		if (job.status !== "failed")
			throw new StudioFrameError(
				job.status === "queued" ||
					job.status === "planning" ||
					job.status === "generating"
					? "STUDIO_RETRY_RUNNING"
					: "STUDIO_INVALID_INPUT",
			);
		const [active] = await tx
			.select({ id: studioJobs.id })
			.from(studioJobs)
			.where(
				and(
					eq(studioJobs.projectId, projectId),
					eq(studioJobs.userId, userId),
					inArray(studioJobs.status, ["queued", "planning", "generating"]),
				),
			);
		if (active) throw new StudioFrameError("STUDIO_RETRY_RUNNING");
		const [updated] = await tx
			.update(studioJobs)
			.set({ ...resetClaim, updatedAt: new Date() })
			.where(
				and(
					eq(studioJobs.id, job.id),
					eq(studioJobs.userId, userId),
					eq(studioJobs.status, "failed"),
				),
			)
			.returning();
		if (!updated) throw new StudioFrameError("STUDIO_STORAGE_FAILED");
		return updated;
	});
}
