import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
	type StudioFrameRow,
	type StudioJobRow,
	studioFrames,
	studioJobs,
	studioProjects,
} from "@/db/schema";
import { STUDIO_JOB_MAX_ATTEMPTS } from "../types/studio-constants";
import { synchronizeStudioConversation } from "./studio-conversation";
import type { StudioJobTransaction } from "./studio-job-lease";

export const STUDIO_ACTIVE_JOB_STATUSES = ["queued", "planning", "generating"];
export const STUDIO_DEPENDENCY_ERROR =
	"Dependensi desain gagal. Pulihkan perencanaan atau layar sumber, lalu coba lagi.";

/** Legacy adoption uses job relationships; display names never establish origin. */
export async function ensureStudioInitialOwnership(
	tx: StudioJobTransaction,
	job: StudioJobRow,
) {
	const initial = await tx
		.select({ id: studioJobs.id })
		.from(studioJobs)
		.where(
			and(
				eq(studioJobs.projectId, job.projectId),
				eq(studioJobs.userId, job.userId),
				eq(studioJobs.jobType, "initial"),
			),
		);
	if (initial.length !== 1 || initial[0].id !== job.id) return;
	const rows = await tx
		.select()
		.from(studioFrames)
		.where(
			and(
				eq(studioFrames.projectId, job.projectId),
				isNull(studioFrames.originJobId),
				sql`not exists (select 1 from ${studioJobs} j where j.project_id = ${job.projectId} and j.user_id = ${job.userId} and j.job_type = 'add' and j.target_frame_id = ${studioFrames.id})`,
			),
		)
		.orderBy(asc(studioFrames.order), asc(studioFrames.id));
	const slots = await tx
		.select({ slot: studioFrames.initialSlot })
		.from(studioFrames)
		.where(eq(studioFrames.originJobId, job.id));
	let next = Math.max(-1, ...slots.map((row) => row.slot ?? -1)) + 1;
	for (const frame of rows)
		await tx
			.update(studioFrames)
			.set({
				originJobId: job.id,
				initialSlot: next++,
				revision: frame.htmlCode ? Math.max(1, frame.revision) : frame.revision,
			})
			.where(
				and(
					eq(studioFrames.id, frame.id),
					eq(studioFrames.projectId, job.projectId),
					isNull(studioFrames.originJobId),
				),
			);
}

export async function findStudioInitialJob(
	tx: StudioJobTransaction,
	projectId: string,
	userId: string,
) {
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
		.orderBy(asc(studioJobs.createdAt), asc(studioJobs.id))
		.limit(1);
	return initial ?? null;
}

export async function studioFrameDependency(
	tx: StudioJobTransaction,
	frame: StudioFrameRow,
	userId: string,
) {
	const [tail] = await tx
		.select()
		.from(studioJobs)
		.where(
			and(
				eq(studioJobs.projectId, frame.projectId),
				eq(studioJobs.userId, userId),
				eq(studioJobs.targetFrameId, frame.id),
				inArray(studioJobs.status, STUDIO_ACTIVE_JOB_STATUSES),
			),
		)
		.orderBy(desc(studioJobs.createdAt), desc(studioJobs.id))
		.limit(1);
	if (tail)
		return {
			dependsOnJobId: tail.id,
			baseRevision: (tail.baseRevision ?? frame.revision) + 1,
		};
	if (!frame.htmlCode && frame.originJobId)
		return { dependsOnJobId: frame.originJobId, baseRevision: 1 };
	return { dependsOnJobId: null, baseRevision: frame.revision };
}

type DependencyState =
	| "ready"
	| "waiting"
	| "STUDIO_DEPENDENCY_FAILED"
	| "STUDIO_STALE_REVISION";
export async function studioJobDependencyState(
	tx: StudioJobTransaction,
	job: StudioJobRow,
): Promise<DependencyState> {
	if (job.jobType === "initial") return "ready";
	if (job.blueprintJobId) {
		const [blueprint] = await tx
			.select()
			.from(studioJobs)
			.where(
				and(
					eq(studioJobs.id, job.blueprintJobId),
					eq(studioJobs.projectId, job.projectId),
					eq(studioJobs.userId, job.userId),
				),
			)
			.limit(1);
		if (!blueprint) return "STUDIO_DEPENDENCY_FAILED";
		if (!blueprint.planningCompletedAt)
			return STUDIO_ACTIVE_JOB_STATUSES.includes(blueprint.status)
				? "waiting"
				: "STUDIO_DEPENDENCY_FAILED";
	}
	if (!job.targetFrameId) return "STUDIO_DEPENDENCY_FAILED";
	const [frame] = await tx
		.select()
		.from(studioFrames)
		.where(
			and(
				eq(studioFrames.id, job.targetFrameId),
				eq(studioFrames.projectId, job.projectId),
			),
		)
		.limit(1);
	if (!frame) return "STUDIO_DEPENDENCY_FAILED";
	if (job.dependsOnJobId) {
		const [dependency] = await tx
			.select()
			.from(studioJobs)
			.where(
				and(
					eq(studioJobs.id, job.dependsOnJobId),
					eq(studioJobs.projectId, job.projectId),
					eq(studioJobs.userId, job.userId),
				),
			)
			.limit(1);
		if (!dependency) return "STUDIO_DEPENDENCY_FAILED";
		if (
			frame.revision === job.baseRevision &&
			frame.lastJobId === dependency.id &&
			frame.htmlCode
		)
			return "ready";
		if (STUDIO_ACTIVE_JOB_STATUSES.includes(dependency.status))
			return "waiting";
		return dependency.status === "completed"
			? "STUDIO_STALE_REVISION"
			: "STUDIO_DEPENDENCY_FAILED";
	}
	if (job.baseRevision !== null && frame.revision !== job.baseRevision)
		return "STUDIO_STALE_REVISION";
	return "ready";
}

export async function failStudioDependency(
	tx: StudioJobTransaction,
	job: StudioJobRow,
	code: string,
) {
	const message =
		code === "STUDIO_STALE_REVISION"
			? "Versi layar telah berubah. Kirim ulang revisi terhadap versi terbaru."
			: code === "STUDIO_FRAME_FAILED"
				? "Pemrosesan terhenti berulang kali. Silakan coba lagi."
				: STUDIO_DEPENDENCY_ERROR;
	await tx
		.update(studioJobs)
		.set({
			status: "failed",
			errorCode: code,
			error: message,
			claimedBy: null,
			claimedAt: null,
			leaseExpiresAt: null,
			finishedAt: new Date(),
			updatedAt: new Date(),
		})
		.where(and(eq(studioJobs.id, job.id), eq(studioJobs.userId, job.userId)));
	// A rejected revision must not change the version it was waiting to read.
	if (job.jobType === "add")
		await tx
			.update(studioFrames)
			.set({
				status: "failed",
				error: message,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(studioFrames.projectId, job.projectId),
					eq(studioFrames.originJobId, job.id),
					eq(studioFrames.revision, 0),
				),
			);
	await synchronizeStudioConversation(tx, job.projectId, job.userId);
}

export async function listRunnableStudioJobs() {
	const pending = await db
		.select()
		.from(studioJobs)
		.where(
			and(
				eq(studioJobs.status, "queued"),
				isNull(studioJobs.claimedBy),
				// The same predicate `claimStudioJob` applies. A job whose old worker
				// still holds a live lease is not runnable, so it must not be offered
				// to the dispatcher until the lease expires: offering it would make the
				// drain loop re-dispatch a job that can never be claimed.
				or(
					isNull(studioJobs.leaseExpiresAt),
					sql`${studioJobs.leaseExpiresAt} <= clock_timestamp()`,
				),
			),
		)
		.orderBy(asc(studioJobs.createdAt), asc(studioJobs.id));
	const ready: StudioJobRow[] = [];
	for (const candidate of pending)
		await db.transaction(async (tx) => {
			const [project] = await tx
				.select({ id: studioProjects.id })
				.from(studioProjects)
				.where(
					and(
						eq(studioProjects.id, candidate.projectId),
						eq(studioProjects.userId, candidate.userId),
					),
				)
				.for("update");
			if (!project) return;
			const [job] = await tx
				.select()
				.from(studioJobs)
				.where(
					and(
						eq(studioJobs.id, candidate.id),
						eq(studioJobs.userId, candidate.userId),
						eq(studioJobs.status, "queued"),
						isNull(studioJobs.claimedBy),
					),
				)
				.for("update");
			if (!job) return;
			// Attempts are exhausted, so no claim can ever succeed again: the job
			// reaches a terminal state here instead of spinning in the queue.
			if (job.attempts >= STUDIO_JOB_MAX_ATTEMPTS) {
				await failStudioDependency(tx, job, "STUDIO_FRAME_FAILED");
				return;
			}
			const state = await studioJobDependencyState(tx, job);
			if (state === "ready") ready.push(job);
			else if (state !== "waiting") await failStudioDependency(tx, job, state);
		});
	return ready;
}
