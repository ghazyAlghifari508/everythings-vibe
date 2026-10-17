import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
	type InsertStudioJobRow,
	type StudioFrameRow,
	type StudioJobRow,
	studioFrames,
	studioJobs,
} from "@/db/schema";
import { ScrapeError } from "@/lib/design-errors";
import { runStudioJobPipeline } from "./studio-job-pipeline";
import { getStudioProjectDetail } from "./studio-project-detail";
import { getStudioProject } from "./studio-project-query";

export async function retryStudioFrame(
	projectId: string,
	userId: string,
	frameId: string,
): Promise<StudioFrameRow> {
	const [failedOperation] = await db
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
	if (failedOperation) {
		await getStudioProject(projectId, userId);
		await db.transaction(async (tx) => {
			await tx
				.update(studioJobs)
				.set({ status: "queued", error: null, updatedAt: new Date() })
				.where(
					and(
						eq(studioJobs.id, failedOperation.id),
						eq(studioJobs.userId, userId),
						eq(studioJobs.status, "failed"),
					),
				);
			await tx
				.update(studioFrames)
				.set({ status: "queued", error: null, updatedAt: new Date() })
				.where(
					and(
						eq(studioFrames.id, frameId),
						eq(studioFrames.projectId, projectId),
					),
				);
		});
		void runStudioJobPipeline(failedOperation.id, projectId, userId);
		const [frame] = await db
			.select()
			.from(studioFrames)
			.where(
				and(
					eq(studioFrames.id, frameId),
					eq(studioFrames.projectId, projectId),
				),
			);
		if (!frame)
			throw new ScrapeError("WEBSITE_BLOCKED", "Frame tidak ditemukan.");
		return frame;
	}
	const owned = await getStudioProjectDetail(projectId, userId);
	const target = owned.frames.find((frame) => frame.id === frameId);
	if (!target)
		throw new ScrapeError("WEBSITE_BLOCKED", "Frame tidak ditemukan.");
	if (target.status !== "failed")
		throw new ScrapeError("INVALID_URL", "Frame ini tidak memerlukan retry.");
	const [initial] = await db
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
	const [retryJob] = await db
		.insert(studioJobs)
		.values({
			projectId,
			userId,
			jobType: "retry",
			targetFrameId: frameId,
			prompt: initial?.prompt ?? target.description ?? target.name,
			status: "queued",
		} satisfies InsertStudioJobRow)
		.returning();
	if (!retryJob) throw new ScrapeError("STORAGE_FAILED");
	await db
		.update(studioFrames)
		.set({ status: "queued", error: null, updatedAt: new Date() })
		.where(
			and(eq(studioFrames.id, frameId), eq(studioFrames.projectId, projectId)),
		);
	void runStudioJobPipeline(retryJob.id, projectId, userId);
	return { ...target, status: "queued", error: null };
}

export async function retryStudioPlanning(
	projectId: string,
	userId: string,
): Promise<StudioJobRow> {
	const [job] = await db
		.select()
		.from(studioJobs)
		.where(
			and(eq(studioJobs.projectId, projectId), eq(studioJobs.userId, userId)),
		)
		.orderBy(desc(studioJobs.createdAt))
		.limit(1);

	if (!job) {
		throw new ScrapeError("WEBSITE_BLOCKED", "Job antrean tidak ditemukan.");
	}

	const [updated] = await db
		.update(studioJobs)
		.set({
			status: "queued",
			error: null,
			updatedAt: new Date(),
		})
		.where(eq(studioJobs.id, job.id))
		.returning();

	if (!updated) throw new ScrapeError("STORAGE_FAILED");

	void runStudioJobPipeline(updated.id, projectId, userId);

	return updated;
}
