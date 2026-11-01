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
// Terminal categories a heartbeat may report. A label is only emitted from an
// observed state; see STUDIO_LEASE_ABORT_BY_OUTCOME.
export type StudioJobAbortReason =
	| "LEASE_FENCE"
	| "HEARTBEAT_DB_ERROR"
	| "LEASE_EXPIRED"
	| "LEASE_OWNERSHIP_CHANGED"
	| "JOB_CANCELLED"
	| "JOB_TIMEOUT"
	| "WORKER_SHUTDOWN";

export class StudioLeaseLostError extends Error {
	constructor(readonly reason: StudioJobAbortReason = "LEASE_FENCE") {
		super(`Studio job lease is no longer current (${reason})`);
	}
}

export type StudioLeaseRefreshOutcome =
	| "renewed"
	| "lease-expired"
	| "ownership-changed"
	| "job-inactive"
	| "database-error";

export interface StudioLeaseRefresh {
	outcome: StudioLeaseRefreshOutcome;
	leaseExpiresAt: Date | null;
	jobStatus: string | null;
	claimedByMatches: boolean;
	errorCategory: string | null;
}

export const STUDIO_LEASE_ABORT_BY_OUTCOME: Record<
	StudioLeaseRefreshOutcome,
	StudioJobAbortReason | null
> = {
	renewed: null,
	"lease-expired": "LEASE_EXPIRED",
	"ownership-changed": "LEASE_OWNERSHIP_CHANGED",
	"job-inactive": "JOB_CANCELLED",
	"database-error": "HEARTBEAT_DB_ERROR",
};

// Codes and constructor names only: provider/DB messages can carry credentials.
// Drizzle wraps driver failures, so the driver error is found through `cause`.
export function studioLeaseErrorCategory(error: unknown): string {
	let current: unknown = error;
	for (
		let depth = 0;
		depth < 4 && current !== null && typeof current === "object";
		depth++
	) {
		if ("code" in current && typeof current.code === "string")
			return current.code;
		current = "cause" in current ? current.cause : null;
	}
	return error instanceof Error ? error.name : "UnknownError";
}

function studioLeaseDbFailure(error: unknown): StudioLeaseRefresh {
	return {
		outcome: "database-error",
		leaseExpiresAt: null,
		jobStatus: null,
		claimedByMatches: false,
		errorCategory: studioLeaseErrorCategory(error),
	};
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
): Promise<StudioLeaseRefresh> {
	try {
		const rows = await db.transaction(async (tx) => {
			// A renewal blocked behind another writer must fail fast as a classified
			// error instead of consuming the lease margin inside one hung statement.
			await tx.execute(
				sql`select set_config('lock_timeout', ${String(STUDIO_JOB_HEARTBEAT_MS)}, true)`,
			);
			return tx
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
				.returning({ leaseExpiresAt: studioJobs.leaseExpiresAt });
		});
		const renewed = rows[0]?.leaseExpiresAt;
		if (renewed)
			return {
				outcome: "renewed",
				leaseExpiresAt: renewed,
				jobStatus: null,
				claimedByMatches: true,
				errorCategory: null,
			};
	} catch (error) {
		return studioLeaseDbFailure(error);
	}
	// The update matched nothing: read the row to name the actually observed cause.
	try {
		const [current] = await db
			.select({
				status: studioJobs.status,
				claimedBy: studioJobs.claimedBy,
				leaseExpiresAt: studioJobs.leaseExpiresAt,
			})
			.from(studioJobs)
			.where(eq(studioJobs.id, jobId));
		if (!current)
			return {
				outcome: "job-inactive",
				leaseExpiresAt: null,
				jobStatus: null,
				claimedByMatches: false,
				errorCategory: null,
			};
		const claimedByMatches = current.claimedBy === workerId;
		return {
			outcome: !activeStatuses.includes(current.status)
				? "job-inactive"
				: claimedByMatches
					? "lease-expired"
					: "ownership-changed",
			leaseExpiresAt: current.leaseExpiresAt,
			jobStatus: current.status,
			claimedByMatches,
			errorCategory: null,
		};
	} catch (error) {
		return studioLeaseDbFailure(error);
	}
}

export async function recoverStalledStudioJobs(
	now = new Date(),
	userId?: string,
): Promise<number> {
	const eligible = and(
		inArray(studioJobs.status, activeStatuses),
		or(
			isNull(studioJobs.leaseExpiresAt),
			// Compare in the database clock domain: claims and renewals use
			// clock_timestamp(), so a skewed Node clock must not reclaim a live lease.
			sql`${studioJobs.leaseExpiresAt} <= clock_timestamp()`,
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
