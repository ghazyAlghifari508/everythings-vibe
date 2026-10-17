import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { type ScrapeMode, scrapes, users } from "@/db/schema";
import { ScrapeError } from "@/lib/design-errors";
import { SCRAPE_LIMITS } from "@/features/scrape/types/scrape-contract";
import {
	assertScrapeRetryAllowed,
	resolveScrapeRetryDecision,
} from "@/features/scrape/utils/scrape-retry";

// Public surface for the scrape backend. Each concern lives in its own module;
// this module keeps the job lifecycle entry points that operate on a whole job
// (retry and delete) and re-exports the rest so consumers import one path.
export * from "./scrape-create-service";
export * from "./scrape-detail-service";
export * from "./scrape-document-service";
export * from "./scrape-enrichment-service";
export * from "./scrape-history-service";
export * from "./scrape-pipeline-service";

export async function retryScrape(
	scrapeId: string,
	userId: string,
): Promise<{ ok: true }> {
	return db.transaction(async (tx) => {
		const [owner] = await tx
			.select({ id: users.id })
			.from(users)
			.where(eq(users.id, userId))
			.for("update")
			.limit(1);
		if (!owner) throw new ScrapeError("STORAGE_FAILED");
		const [scrape] = await tx
			.select()
			.from(scrapes)
			.where(and(eq(scrapes.id, scrapeId), eq(scrapes.userId, userId)))
			.limit(1);
		if (!scrape)
			throw new ScrapeError("WEBSITE_BLOCKED", "Scrape tidak ditemukan.");
		if (scrape.status !== "failed") return { ok: true };
		// A retry consumes a real worker slot, so it respects the same request
		// rate limit as creating a new scrape instead of bypassing it.
		const { checkRateLimit } = await import("@/lib/rate-limit");
		if (!(await checkRateLimit(userId, "free", "api_call")).allowed)
			throw new ScrapeError(
				"RATE_LIMITED",
				"Batas request tercapai. Coba lagi setelah satu menit.",
			);
		const active = await tx
			.select({ id: scrapes.id })
			.from(scrapes)
			.where(
				and(
					eq(scrapes.userId, userId),
					inArray(scrapes.status, [
						"queued",
						"capturing",
						"extracting",
						"generating",
						"saving",
					]),
				),
			);
		const metadata =
			typeof scrape.metadata === "object" && scrape.metadata !== null
				? scrape.metadata
				: null;
		assertScrapeRetryAllowed(
			resolveScrapeRetryDecision({
				status: scrape.status,
				errorCode: metadata?.errorDetail ?? null,
				retryAfterExpiresAt: metadata?.retryAfterExpiresAt ?? null,
				activeJobs: active.length,
				maxActiveJobs: SCRAPE_LIMITS.maxActiveJobs,
			}),
		);
		// A retry is a fresh attempt at the same request: it keeps the persisted
		// partial rows, clears the previous failure evidence, and resets the
		// worker bookkeeping so a new lease can be claimed.
		const mode: ScrapeMode = (scrape.mode ??
			scrape.metadata?.mode ??
			"design") as ScrapeMode;
		await tx
			.update(scrapes)
			.set({
				status: "queued",
				jobAttempts: 0,
				jobToken: null,
				leaseExpiresAt: null,
				metadata: {
					...(typeof scrape.metadata === "object" && scrape.metadata !== null
						? scrape.metadata
						: {}),
					mode,
					stage: "queued",
					progress: 0,
					stageStartedAt: new Date().toISOString(),
					activity: undefined,
					activityStartedAt: undefined,
					errorMessage: undefined,
					errorDetail: undefined,
					errorSource: undefined,
					failureReason: undefined,
					failedAtStage: undefined,
					retryAfterSeconds: undefined,
					retryAfterExpiresAt: undefined,
				},
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(scrapes.id, scrapeId),
					eq(scrapes.userId, userId),
					eq(scrapes.status, "failed"),
				),
			);
		return { ok: true };
	});
}

export async function deleteScrape(
	id: string,
	userId: string,
): Promise<{ ok: true }> {
	const deleted = await db
		.delete(scrapes)
		.where(and(eq(scrapes.id, id), eq(scrapes.userId, userId)))
		.returning({ id: scrapes.id });
	if (deleted.length === 0)
		throw new ScrapeError("WEBSITE_BLOCKED", "Scrape tidak ditemukan.");
	return { ok: true };
}