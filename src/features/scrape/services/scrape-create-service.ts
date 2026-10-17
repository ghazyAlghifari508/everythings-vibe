import { isDeepStrictEqual } from "node:util";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
	type InsertScrapeRow,
	type ScrapeMode,
	type ScrapeRow,
	scrapes,
	users,
} from "@/db/schema";
import { ScrapeError } from "@/lib/design-errors";
import {
	SCRAPE_LIMITS,
	type ScrapeRequest,
	scrapeRequestSchema,
} from "@/features/scrape/types/scrape-contract";
import { parseAndValidateFormat } from "@/features/scrape/utils/url-validator";

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
	return db.transaction(async (tx) => {
		const [owner] = await tx
			.select({ id: users.id })
			.from(users)
			.where(eq(users.id, userId))
			.for("update")
			.limit(1);
		if (!owner) throw new ScrapeError("STORAGE_FAILED");
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
		return pending;
	});
}