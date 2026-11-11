import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
	type StudioFrameRow,
	type StudioJobRow,
	studioFrames,
	studioJobs,
	studioProjects,
} from "@/db/schema";
import type { StudioFrameRetryOutcome } from "../types/studio";
import { isTemporarySlot } from "../utils/studio-lifecycle";
import { synchronizeStudioConversation } from "./studio-conversation";
import { StudioFrameError } from "./studio-frame-errors";
import { findStudioInitialJob } from "./studio-job-dependencies";

export interface StudioFrameRetryResult {
	frame: StudioFrameRow;
	retry: StudioFrameRetryOutcome;
}

const resetClaim = {
	status: "queued",
	error: null,
	errorCode: null,
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
		// Every screen shares one blueprint. When the project still holds only the
		// provisional planning slots, retrying one slot alone would rebuild it with
		// no shared navigation contract, and repeating that per slot is the failure
		// loop this guard exists to stop: the plan is the unit of recovery.
		const initial = await findStudioInitialJob(tx, projectId, userId);
		// Only a slot the planner has not named yet needs the whole plan first; a
		// frame with real content is retried on its own, with or without a blueprint.
		if (!project.designBlueprint && isTemporarySlot(frame))
			throw new StudioFrameError("STUDIO_PLANNING_REQUIRED");
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
		if (
			operation?.errorCode === "STUDIO_STALE_REVISION" ||
			operation?.errorCode === "STUDIO_IDEMPOTENCY_CONFLICT"
		)
			throw new StudioFrameError("STUDIO_STALE_REVISION");
		if (operation?.errorCode === "STUDIO_DEPENDENCY_FAILED")
			throw new StudioFrameError("STUDIO_DEPENDENCY_FAILED");
		if (operation) {
			await tx
				.update(studioJobs)
				.set({
					...resetClaim,
					baseRevision: operation.baseRevision ?? frame.revision,
					updatedAt: new Date(),
				})
				.where(
					and(eq(studioJobs.id, operation.id), eq(studioJobs.userId, userId)),
				);
		} else {
			await tx.insert(studioJobs).values({
				projectId,
				userId,
				jobType: "retry",
				targetFrameId: frameId,
				prompt: initial?.prompt ?? frame.description ?? frame.name,
				baseRevision: frame.revision,
				blueprintJobId: initial?.id ?? null,
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
		await synchronizeStudioConversation(tx, projectId, userId);
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
					sql`(${studioJobs.blueprintJobId} is distinct from ${job.id} or ${studioJobs.claimedBy} is not null)`,
				),
			);
		if (active) throw new StudioFrameError("STUDIO_RETRY_RUNNING");
		const initialFrames = await tx
			.select({ htmlCode: studioFrames.htmlCode })
			.from(studioFrames)
			.where(
				and(
					eq(studioFrames.projectId, projectId),
					sql`(${studioFrames.originJobId} = ${job.id} or ${studioFrames.originJobId} is null)`,
				),
			);
		if (initialFrames.some((frame) => frame.htmlCode))
			throw new StudioFrameError("STUDIO_INVALID_INPUT");
		if (project.designBlueprint || job.planningCompletedAt)
			throw new StudioFrameError("STUDIO_INVALID_INPUT");
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
		await synchronizeStudioConversation(tx, projectId, userId);
		return updated;
	});
}
