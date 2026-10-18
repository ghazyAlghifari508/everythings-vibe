import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { type StudioJobRow, studioJobs } from "@/db/schema";
import { STUDIO_JOB_CLAIM_TTL_MS } from "@/features/studio/types/studio-constants";

// Claims are short atomic updates; no transaction is held during AI calls.
export async function claimStudioJob(
	jobId: string,
	userId: string,
	workerId: string,
	ttlMs: number = STUDIO_JOB_CLAIM_TTL_MS,
	claimableStatuses: string[] = ["queued", "planning", "generating"],
): Promise<StudioJobRow | null> {
	const now = new Date();
	const [claimed] = await db
		.update(studioJobs)
		.set({
			claimedBy: workerId,
			claimedAt: now,
			leaseExpiresAt: new Date(now.getTime() + ttlMs),
			attempts: sql`${studioJobs.attempts} + 1`,
			startedAt: sql`coalesce(${studioJobs.startedAt}, now())`,
			updatedAt: now,
		})
		.where(
			and(
				eq(studioJobs.id, jobId),
				eq(studioJobs.userId, userId),
				inArray(studioJobs.status, claimableStatuses),
				or(
					isNull(studioJobs.leaseExpiresAt),
					sql`${studioJobs.leaseExpiresAt} < now()`,
				),
			),
		)
		.returning();
	return claimed ?? null;
}

export async function refreshStudioJobLease(
	jobId: string,
	workerId: string,
	ttlMs: number = STUDIO_JOB_CLAIM_TTL_MS,
): Promise<boolean> {
	const now = new Date();
	const [refreshed] = await db
		.update(studioJobs)
		.set({
			leaseExpiresAt: new Date(now.getTime() + ttlMs),
			updatedAt: now,
		})
		.where(and(eq(studioJobs.id, jobId), eq(studioJobs.claimedBy, workerId)))
		.returning({ id: studioJobs.id });
	return refreshed !== undefined;
}

export async function recoverStalledStudioJobs(
	now: Date = new Date(),
): Promise<number> {
	const recovered = await db
		.update(studioJobs)
		.set({
			status: "queued",
			claimedBy: null,
			claimedAt: null,
			leaseExpiresAt: null,
			updatedAt: now,
		})
		.where(
			and(
				inArray(studioJobs.status, ["queued", "planning", "generating"]),
				sql`${studioJobs.leaseExpiresAt} < ${now.toISOString()}::timestamptz`,
			),
		)
		.returning({ id: studioJobs.id });
	return recovered.length;
}
