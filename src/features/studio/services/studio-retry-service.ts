import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
	type StudioFrameRow,
	type StudioJobRow,
	studioFrames,
	studioJobs,
	studioProjects,
} from "@/db/schema";
import { ScrapeError } from "@/lib/design-errors";

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
): Promise<StudioFrameRow> {
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
		if (!project)
			throw new ScrapeError("WEBSITE_BLOCKED", "Studio tidak ditemukan.");
		const [frame] = await tx
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
		if (frame.status !== "failed")
			throw new ScrapeError("INVALID_URL", "Frame ini tidak memerlukan retry.");
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
		if (active)
			throw new ScrapeError(
				"INVALID_URL",
				"Tunggu pemrosesan selesai sebelum mencoba lagi.",
			);
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
		if (!updated) throw new ScrapeError("STORAGE_FAILED");
		return updated;
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
		if (!project)
			throw new ScrapeError("WEBSITE_BLOCKED", "Studio tidak ditemukan.");
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
		if (!job || job.status !== "failed")
			throw new ScrapeError(
				"INVALID_URL",
				"Perencanaan ini tidak memerlukan retry.",
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
		if (active)
			throw new ScrapeError(
				"INVALID_URL",
				"Tunggu pemrosesan selesai sebelum mencoba lagi.",
			);
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
		if (!updated) throw new ScrapeError("STORAGE_FAILED");
		return updated;
	});
}
