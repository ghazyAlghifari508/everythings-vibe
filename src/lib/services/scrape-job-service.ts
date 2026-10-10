import { and, asc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { scrapes } from "@/db/schema";

export const SCRAPE_JOB_LEASE_MS = 60_000;
export const SCRAPE_JOB_HEARTBEAT_MS = 15_000;
export const SCRAPE_WORKER_POLL_MS = 2_000;
export const SCRAPE_JOB_MAX_ATTEMPTS = 3;

const activeStatuses = [
	"queued",
	"capturing",
	"extracting",
	"generating",
	"saving",
] as const;

export function isScrapeJobEligible(
	status: string,
	leaseExpiresAt: Date | null,
	now: Date,
): boolean {
	return (
		activeStatuses.some((active) => active === status) &&
		(!leaseExpiresAt || leaseExpiresAt <= now)
	);
}

export function isScrapeClaimCurrent(
	row: { jobToken: string | null; leaseExpiresAt: Date | null },
	token: string,
	now: Date,
): boolean {
	return (
		row.jobToken === token &&
		row.leaseExpiresAt !== null &&
		row.leaseExpiresAt > now
	);
}

export interface ScrapeJobClaim {
	id: string;
	userId: string;
	token: string;
}

export function scrapeClaimPredicate(claim: ScrapeJobClaim) {
	return and(
		eq(scrapes.id, claim.id),
		eq(scrapes.userId, claim.userId),
		eq(scrapes.jobToken, claim.token),
		gt(scrapes.leaseExpiresAt, new Date()),
	);
}

export async function claimScrapeJob(): Promise<ScrapeJobClaim | null> {
	const { db } = await import("@/db");
	return db.transaction(async (tx) => {
		const [row] = await tx
			.select()
			.from(scrapes)
			.where(
				and(
					inArray(scrapes.status, [...activeStatuses]),
					or(
						isNull(scrapes.leaseExpiresAt),
						lte(scrapes.leaseExpiresAt, new Date()),
					),
				),
			)
			.orderBy(asc(scrapes.createdAt))
			.limit(1)
			.for("update", { skipLocked: true });
		if (!row) return null;
		if (row.jobAttempts >= SCRAPE_JOB_MAX_ATTEMPTS) {
			await tx
				.update(scrapes)
				.set({
					status: "failed",
					jobToken: null,
					leaseExpiresAt: null,
					metadata: {
						...row.metadata,
						errorMessage: "Pemrosesan terhenti berulang kali. Coba lagi.",
						errorDetail: "WORKER_INTERRUPTED",
					},
				})
				.where(and(eq(scrapes.id, row.id), eq(scrapes.userId, row.userId)));
			return null;
		}
		const token = crypto.randomUUID();
		await tx
			.update(scrapes)
			.set({
				jobToken: token,
				leaseExpiresAt: new Date(Date.now() + SCRAPE_JOB_LEASE_MS),
				jobAttempts: sql`${scrapes.jobAttempts} + 1`,
				updatedAt: new Date(),
			})
			.where(and(eq(scrapes.id, row.id), eq(scrapes.userId, row.userId)));
		return { id: row.id, userId: row.userId, token };
	});
}

export async function renewScrapeClaim(
	claim: ScrapeJobClaim,
): Promise<boolean> {
	const { db } = await import("@/db");
	const rows = await db
		.update(scrapes)
		.set({ leaseExpiresAt: new Date(Date.now() + SCRAPE_JOB_LEASE_MS) })
		.where(scrapeClaimPredicate(claim))
		.returning({ id: scrapes.id });
	return rows.length === 1;
}

export async function releaseScrapeClaim(claim: ScrapeJobClaim): Promise<void> {
	const { db } = await import("@/db");
	await db
		.update(scrapes)
		.set({ jobToken: null, leaseExpiresAt: null })
		.where(
			and(
				eq(scrapes.id, claim.id),
				eq(scrapes.userId, claim.userId),
				eq(scrapes.jobToken, claim.token),
			),
		);
}
