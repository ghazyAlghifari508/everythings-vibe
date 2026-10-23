import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
	type StudioJobRow,
	studioFrames,
	studioJobs,
	studioProjects,
} from "@/db/schema";
import { STUDIO_JOB_CLAIM_TTL_MS } from "../types/studio-constants";

export const STUDIO_JOB_MAX_ATTEMPTS = 3;
export const STUDIO_JOB_HEARTBEAT_MS = 15_000;
export const STUDIO_JOB_TIMEOUT_MS = 30 * 60_000;
export const STUDIO_WORKER_POLL_MS = 2_000;
const activeStatuses = ["queued", "planning", "generating"];
export type StudioJobTransaction = Parameters<
	Parameters<typeof db.transaction>[0]
>[0];
export interface StudioJobClaim {
	jobId: string;
	projectId: string;
	userId: string;
	workerId: string;
}
export class StudioLeaseLostError extends Error {
	constructor() {
		super("Studio job lease is no longer current");
	}
}

function studioClaimPredicate(claim: StudioJobClaim) {
	return and(
		eq(studioJobs.id, claim.jobId),
		eq(studioJobs.projectId, claim.projectId),
		eq(studioJobs.userId, claim.userId),
		eq(studioJobs.claimedBy, claim.workerId),
		inArray(studioJobs.status, activeStatuses),
		sql`${studioJobs.leaseExpiresAt} > clock_timestamp()`,
	);
}

// Lock order is always project then job, shared with enqueue and finalization.
export async function withStudioJobWrite<T>(
	claim: StudioJobClaim,
	write: (tx: StudioJobTransaction) => Promise<T>,
): Promise<T> {
	return db.transaction(async (tx) => {
		const [project] = await tx
			.select({ id: studioProjects.id })
			.from(studioProjects)
			.where(
				and(
					eq(studioProjects.id, claim.projectId),
					eq(studioProjects.userId, claim.userId),
				),
			)
			.for("update");
		if (!project) throw new StudioLeaseLostError();
		const [job] = await tx
			.select({ id: studioJobs.id })
			.from(studioJobs)
			.where(studioClaimPredicate(claim))
			.for("update");
		if (!job) throw new StudioLeaseLostError();
		return write(tx);
	});
}

export async function claimStudioJob(
	jobId: string,
	userId: string,
	workerId: string,
	ttlMs = STUDIO_JOB_CLAIM_TTL_MS,
): Promise<StudioJobRow | null> {
	const [claimed] = await db
		.update(studioJobs)
		.set({
			claimedBy: workerId,
			claimedAt: sql`clock_timestamp()`,
			leaseExpiresAt: sql`clock_timestamp() + ${ttlMs} * interval '1 millisecond'`,
			attempts: sql`${studioJobs.attempts} + 1`,
			startedAt: sql`coalesce(${studioJobs.startedAt}, clock_timestamp())`,
			finishedAt: null,
			updatedAt: sql`clock_timestamp()`,
		})
		.where(
			and(
				eq(studioJobs.id, jobId),
				eq(studioJobs.userId, userId),
				inArray(studioJobs.status, activeStatuses),
				lt(studioJobs.attempts, STUDIO_JOB_MAX_ATTEMPTS),
				or(
					isNull(studioJobs.leaseExpiresAt),
					sql`${studioJobs.leaseExpiresAt} <= clock_timestamp()`,
				),
			),
		)
		.returning();
	return claimed ?? null;
}

export async function refreshStudioJobLease(
	jobId: string,
	workerId: string,
	ttlMs = STUDIO_JOB_CLAIM_TTL_MS,
): Promise<boolean> {
	const rows = await db
		.update(studioJobs)
		.set({
			leaseExpiresAt: sql`clock_timestamp() + ${ttlMs} * interval '1 millisecond'`,
			updatedAt: sql`clock_timestamp()`,
		})
		.where(
			and(
				eq(studioJobs.id, jobId),
				eq(studioJobs.claimedBy, workerId),
				inArray(studioJobs.status, activeStatuses),
				sql`${studioJobs.leaseExpiresAt} > clock_timestamp()`,
			),
		)
		.returning({ id: studioJobs.id });
	return rows.length === 1;
}

export async function recoverStalledStudioJobs(
	now = new Date(),
	userId?: string,
): Promise<number> {
	const eligible = and(
		inArray(studioJobs.status, activeStatuses),
		or(
			isNull(studioJobs.leaseExpiresAt),
			sql`${studioJobs.leaseExpiresAt} <= ${now}`,
		),
		or(
			sql`${studioJobs.claimedBy} is not null`,
			sql`${studioJobs.attempts} >= ${STUDIO_JOB_MAX_ATTEMPTS}`,
			inArray(studioJobs.status, ["planning", "generating"]),
		),
		userId ? eq(studioJobs.userId, userId) : undefined,
	);
	const candidates = await db
		.select()
		.from(studioJobs)
		.where(eligible)
		.orderBy(asc(studioJobs.createdAt))
		.limit(100);
	let recovered = 0;
	for (const candidate of candidates) {
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
			const exhausted = candidate.attempts >= STUDIO_JOB_MAX_ATTEMPTS;
			const [job] = await tx
				.update(studioJobs)
				.set({
					status: exhausted ? "failed" : "queued",
					claimedBy: null,
					claimedAt: null,
					leaseExpiresAt: null,
					error: exhausted
						? "Pemrosesan terhenti berulang kali. Silakan coba lagi."
						: null,
					finishedAt: exhausted ? now : null,
					updatedAt: now,
				})
				.where(
					and(
						eq(studioJobs.id, candidate.id),
						eligible,
						eq(studioJobs.attempts, candidate.attempts),
					),
				)
				.returning();
			if (!job) return;
			if (exhausted)
				await tx
					.update(studioFrames)
					.set({ status: "failed", error: job.error, updatedAt: now })
					.where(
						and(
							eq(studioFrames.projectId, job.projectId),
							inArray(studioFrames.status, ["queued", "generating"]),
							job.targetFrameId
								? eq(studioFrames.id, job.targetFrameId)
								: undefined,
						),
					);
			recovered++;
		});
	}
	return recovered;
}
