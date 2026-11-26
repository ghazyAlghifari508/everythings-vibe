import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
	type StudioFrameRow,
	type StudioJobRow,
	studioFrames,
	studioJobs,
	studioProjects,
} from "@/db/schema";
import { admitProductWork } from "@/features/billing/services/product-trials.server";
import type { StudioFrameRetryOutcome } from "../types/studio";
import {
	reserveStudioOperationCharge,
	serverStudioQuote,
} from "./studio-credit-adapter.server";
import {
	deriveStudioLifecycle,
	isTemporarySlot,
} from "../utils/studio-lifecycle";
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
		// Every screen shares one blueprint. When the project still holds only the
		// provisional planning slots, retrying one slot alone would rebuild it with
		// no shared navigation contract, and repeating that per slot is the failure
		// loop this guard exists to stop: the plan is the unit of recovery.
		const slots = await tx
			.select({
				name: studioFrames.name,
				description: studioFrames.description,
				htmlCode: studioFrames.htmlCode,
			})
			.from(studioFrames)
			.where(eq(studioFrames.projectId, projectId));
		if (
			!project.designBlueprint &&
			slots.length > 0 &&
			slots.every(isTemporarySlot)
		)
			throw new StudioFrameError("STUDIO_PLANNING_REQUIRED");
		const [failed] = await tx
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
		const [initial] = failed
			? []
			: await tx
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
		const retryPrompt =
			failed?.prompt ?? initial?.prompt ?? frame.description ?? frame.name;
		const scope = {
			operation: "studio.regenerate" as const,
			frames: 1,
			promptChars: retryPrompt.length,
			designMdChars: project.designMd?.length ?? 0,
		};
		const quote = serverStudioQuote(scope);
		await admitProductWork(tx, userId, "studio", "paid", {
			key: `retry:${frameId}:${failed?.attempts ?? 0}`,
			payload: { projectId, frameId, prompt: retryPrompt },
			maximumCredits: quote?.maximumCredits,
		});
		let retryJobId: string;
		if (failed) {
			retryJobId = failed.id;
			await tx
				.update(studioJobs)
				.set({
					...resetClaim,
					creditOperationId: null,
					updatedAt: new Date(),
				})
				.where(
					and(eq(studioJobs.id, failed.id), eq(studioJobs.userId, userId)),
				);
		} else {
			const [created] = await tx
				.insert(studioJobs)
				.values({
					projectId,
					userId,
					jobType: "retry",
					targetFrameId: frameId,
					prompt: retryPrompt,
				})
				.returning();
			if (!created) throw new StudioFrameError("STUDIO_STORAGE_FAILED");
			retryJobId = created.id;
		}
		if (quote)
			await reserveStudioOperationCharge(tx, {
				userId,
				projectId,
				jobId: retryJobId,
				scope,
				idempotencyKey: `studio-regenerate:${retryJobId}:${failed?.attempts ?? 0}`,
			});
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
		const scope = {
			operation: "studio.regenerate" as const,
			frames: Math.max(1, project.initialPageCount ?? 1),
			promptChars: job.prompt.length,
			designMdChars: project.designMd?.length ?? 0,
		};
		const quote = job.status === "failed" ? serverStudioQuote(scope) : null;
		if (job.status === "failed")
			await admitProductWork(tx, userId, "studio", "paid", {
				key: `retry-planning:${job.id}:${job.attempts}`,
				payload: { projectId, prompt: job.prompt },
				maximumCredits: quote?.maximumCredits,
			});
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
		const frames = await tx
			.select()
			.from(studioFrames)
			.where(eq(studioFrames.projectId, projectId));
		if (
			!deriveStudioLifecycle({ project, frames, activeJob: job })
				.canRetryPlanning
		)
			throw new StudioFrameError("STUDIO_INVALID_INPUT");
		const [updated] = await tx
			.update(studioJobs)
			.set({ ...resetClaim, creditOperationId: null, updatedAt: new Date() })
			.where(
				and(
					eq(studioJobs.id, job.id),
					eq(studioJobs.userId, userId),
					eq(studioJobs.status, "failed"),
				),
			)
			.returning();
		if (!updated) throw new StudioFrameError("STUDIO_STORAGE_FAILED");
		if (quote)
			await reserveStudioOperationCharge(tx, {
				userId,
				projectId,
				jobId: job.id,
				scope,
				idempotencyKey: `studio-regenerate:${job.id}:${job.attempts}`,
			});
		return updated;
	});
}
