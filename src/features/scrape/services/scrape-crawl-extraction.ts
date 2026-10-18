import { setTimeout as wait } from "node:timers/promises";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import type { ScrapeRow } from "@/db/schema";
import { scrapePages, scrapes } from "@/db/schema";
import {
	crawlWebsite,
	isCrawlScope,
} from "@/features/scrape/services/crawl-website";
import type { CrawlSettings } from "@/features/scrape/types/scrape-contract";
import { SCRAPE_LIMITS } from "@/features/scrape/types/scrape-contract";
import { SCRAPE_MAX_HTML_BYTES } from "@/lib/constants";
import { ScrapeError } from "@/lib/design-errors";
import { fetchAsset } from "@/lib/fetch-html";
import { classifyCrawlFailures } from "./scrape-failure-summary";
import type { ScrapeJobClaim, ScrapeJobUpdate } from "./scrape-job-service";
import { scrapeClaimPredicate } from "./scrape-job-service";

const CRAWL_REQUEST_GAP_MS = 1000;
const CRAWL_ROBOTS_MAX_BYTES = 512000;

export async function runCrawlExtraction(params: {
	scrape: ScrapeRow;
	claim: ScrapeJobClaim;
	url: string;
	settings: CrawlSettings;
	update: ScrapeJobUpdate;
}): Promise<void> {
	const { scrape, claim, url, settings, update } = params;
	const crawlDelays = new Map<string, number>();
	const completed = await db
		.select()
		.from(scrapePages)
		.where(
			and(
				eq(scrapePages.scrapeId, claim.id),
				eq(scrapePages.userId, claim.userId),
			),
		);
	const results = await crawlWebsite(url, settings, {
		signal: claim.signal,
		frontier: completed.map(({ url, parentUrl, depth }) => ({
			url,
			parentUrl,
			depth,
		})),
		completed: completed
			.filter((page) => page.status === "completed")
			.map((page) => ({ ...page, status: "completed" })),
		onDiscovered: async (url, parentUrl, depth) => {
			await db.transaction(async (tx) => {
				const [owner] = await tx
					.select({ id: scrapes.id })
					.from(scrapes)
					.where(scrapeClaimPredicate(claim))
					.for("update")
					.limit(1);
				if (!owner)
					throw new ScrapeError(
						"STORAGE_FAILED",
						"Job lease sudah tidak berlaku.",
					);
				await tx
					.insert(scrapePages)
					.values({
						url,
						parentUrl,
						depth,
						userId: claim.userId,
						scrapeId: claim.id,
					})
					.onConflictDoNothing();
			});
		},
		load: async (url) => {
			const result = await db.transaction(async (tx) => {
				await tx.execute(
					sql`select pg_advisory_xact_lock(hashtext(${new URL(url).origin}))`,
				);
				await wait(
					crawlDelays.get(new URL(url).origin) ?? CRAWL_REQUEST_GAP_MS,
					undefined,
					{ signal: claim.signal },
				);
				return fetchAsset(url, 0, {
					maxBytes: SCRAPE_MAX_HTML_BYTES,
					signal: claim.signal,
					allowUrl: (target) =>
						isCrawlScope(target, url, settings.followSubdomains),
				});
			});
			if (!/^text\/html|application\/xhtml\+xml/i.test(result.contentType))
				throw new ScrapeError("NO_ANALYZABLE_CONTENT", "Konten bukan HTML.");
			return {
				html: result.body.toString("utf8"),
				status: result.status,
				finalUrl: result.finalUrl,
			};
		},
		robots: async (origin) => {
			const result = await fetchAsset(`${origin}/robots.txt`, 0, {
				maxBytes: CRAWL_ROBOTS_MAX_BYTES,
				signal: claim.signal,
				allowUrl: (target) => new URL(target).origin === origin,
			});
			if (result.status === 404) return "";
			if (result.status !== 200)
				throw new ScrapeError(
					"WEBSITE_BLOCKED",
					"robots.txt tidak dapat diverifikasi.",
				);
			const content = result.body.toString("utf8");
			if (/<html\b/i.test(content))
				throw new ScrapeError(
					"WEBSITE_BLOCKED",
					"robots.txt bukan dokumen aturan yang valid.",
				);
			const delay =
				Number(
					content.match(/crawl-delay\s*:\s*(\d+(?:\.\d+)?)/i)?.[1] ?? "0",
				) * 1000;
			if (delay > SCRAPE_LIMITS.maxCrawlDelayMs)
				throw new ScrapeError(
					"WEBSITE_ACCESS_DENIED",
					"Crawl delay robots.txt melampaui batas job.",
				);
			crawlDelays.set(origin, Math.max(CRAWL_REQUEST_GAP_MS, delay));
			return content;
		},
		onPage: async (page, discovered) => {
			await db.transaction(async (tx) => {
				const [owner] = await tx
					.select({ id: scrapes.id })
					.from(scrapes)
					.where(scrapeClaimPredicate(claim))
					.for("update")
					.limit(1);
				if (!owner)
					throw new ScrapeError(
						"STORAGE_FAILED",
						"Job lease sudah tidak berlaku.",
					);
				await tx
					.insert(scrapePages)
					.values({ ...page, userId: claim.userId, scrapeId: claim.id })
					.onConflictDoUpdate({
						target: [scrapePages.userId, scrapePages.scrapeId, scrapePages.url],
						set: page,
					});
			});
			const pages = await db
				.select({ status: scrapePages.status })
				.from(scrapePages)
				.where(
					and(
						eq(scrapePages.scrapeId, claim.id),
						eq(scrapePages.userId, claim.userId),
					),
				);
			await update({
				metadata: {
					...scrape.metadata,
					mode: "crawl",
					visitedPages: pages.filter((row) => row.status !== "queued").length,
					completedPages: pages.filter((row) => row.status === "completed")
						.length,
					skippedPages: pages.filter((row) => row.status === "skipped").length,
					discoveredPages: discovered,
					failedResources: pages.filter((row) => row.status === "failed")
						.length,
					activity: page.url,
				},
			});
		},
	});
	if (!results.some((page) => page.status === "completed")) {
		// No page completed, so the run's failure is classified from the
		// evidence each page actually produced.
		const failure = classifyCrawlFailures(
			results.map((page) => ({
				code: page.failureCode ?? null,
				httpStatus: page.httpStatus,
			})),
		);
		throw new ScrapeError(
			failure.code,
			"Tidak ada halaman yang berhasil diambil.",
			{
				...(failure.httpStatus === undefined
					? {}
					: { httpStatus: failure.httpStatus }),
			},
		);
	}
}
