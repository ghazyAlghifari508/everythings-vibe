import { isDeepStrictEqual } from "node:util";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
	type InsertScrapeRow,
	type ScrapeMode,
	type ScrapeRow,
	scrapes,
} from "@/db/schema";
import {
	admitProductWork,
	SCRAPE_TRIAL_PAGES,
	SCRAPE_TRIAL_VIEWS,
} from "@/features/billing/services/product-trials.server";
import {
	SCRAPE_LIMITS,
	type ScrapeRequest,
	scrapeRequestSchema,
} from "@/features/scrape/types/scrape-contract";
import { parseAndValidateFormat } from "@/features/scrape/utils/url-validator";
import { ScrapeError } from "@/lib/design-errors";

function domainOf(sourceUrl: string): string {
	return new URL(sourceUrl).hostname.toLowerCase();
}

export async function createScrape(
	userId: string,
	rawUrl: string,
	mode: ScrapeMode = "design",
	request?: ScrapeRequest,
	idempotencyKey?: string,
): Promise<ScrapeRow> {
	let normalized: string;
	try {
		normalized = parseAndValidateFormat(rawUrl).href;
	} catch (error) {
		if (error instanceof ScrapeError) throw error;
		throw new ScrapeError("INVALID_URL");
	}

	const validated = scrapeRequestSchema.parse(
		request ?? { url: normalized, mode },
	);
	if (validated.mode !== mode || validated.url !== normalized)
		throw new ScrapeError("INVALID_URL");
	return db.transaction(async (tx) => {
		const admission = await admitProductWork(tx, userId, "scrape", "trial", {
			key: idempotencyKey,
			payload: validated,
		});
		if (admission.kind === "replay") {
			const [replay] = await tx
				.select()
				.from(scrapes)
				.where(
					and(eq(scrapes.userId, userId), eq(scrapes.id, admission.jobId)),
				);
			if (!replay) throw new ScrapeError("TRIAL_EXHAUSTED");
			return replay;
		}
		if (admission.kind === "trial" && validated.mode === "crawl") {
			validated.settings.maxPages = Math.min(
				validated.settings.maxPages,
				SCRAPE_TRIAL_PAGES,
			);
		}
		if (admission.kind === "trial" && validated.mode === "design") {
			const views =
				(validated.settings.viewport === "both" ? 2 : 1) *
				(validated.settings.theme === "both" ? 2 : 1);
			if (views > SCRAPE_TRIAL_VIEWS) throw new ScrapeError("TRIAL_LIMIT");
		}
		if (idempotencyKey) {
			const [replay] = await tx
				.select()
				.from(scrapes)
				.where(
					and(
						eq(scrapes.userId, userId),
						sql`${scrapes.metadata}->>'idempotencyKey' = ${idempotencyKey}`,
					),
				)
				.limit(1);
			if (replay) {
				if (
					!isDeepStrictEqual(
						scrapeRequestSchema.parse(
							replay.request ?? { url: replay.sourceUrl, mode: replay.mode },
						),
						validated,
					)
				)
					throw new ScrapeError(
						"INVALID_URL",
						"Request key sudah dipakai untuk parameter berbeda.",
					);
				return replay;
			}
		}
		const { checkRateLimit } = await import("@/lib/rate-limit");
		if (!(await checkRateLimit(userId, "free", "api_call")).allowed)
			throw new ScrapeError(
				"RATE_LIMITED",
				"Batas request tercapai. Coba lagi setelah satu menit.",
			);
		const active = await tx
			.select()
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
		const existing = active.find(
			(row) =>
				row.sourceUrl === normalized &&
				row.mode === mode &&
				isDeepStrictEqual(
					scrapeRequestSchema.parse(
						row.request ?? { url: row.sourceUrl, mode: row.mode },
					),
					validated,
				),
		);
		if (existing) return existing;
		if (active.length >= SCRAPE_LIMITS.maxActiveJobs)
			throw new ScrapeError(
				"QUEUE_CAPACITY",
				"Tunggu proses aktif selesai sebelum memulai ekstraksi baru.",
			);
		const [pending] = await tx
			.insert(scrapes)
			.values({
				userId,
				sourceUrl: normalized,
				domain: domainOf(normalized),
				mode,
				request: validated,
				status: "queued",
				metadata: {
					designSettings:
						validated.mode === "design" ? validated.settings : undefined,
					mode,
					idempotencyKey,
					stage: "queued",
					progress: 0,
					stageStartedAt: new Date().toISOString(),
				},
			} satisfies InsertScrapeRow)
			.returning();

		if (!pending) throw new ScrapeError("STORAGE_FAILED");
		if (admission.kind === "trial") await admission.reserve(pending.id);
		return pending;
	});
}
