import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
	type ScrapeRow,
	scrapeImages,
	scrapePages,
	scrapes,
} from "@/db/schema";
import { crawlWebsite, isCrawlScope } from "@/lib/crawl-website";
import { fetchAsset } from "@/lib/fetch-html";
import { renderPage } from "@/lib/render-page";
import { scrapeRequestSchema } from "@/lib/scrape-contract";
import { normalizeImageCandidates } from "@/lib/scrape-images";
import {
	type ScrapeJobClaim,
	scrapeClaimPredicate,
} from "./scrape-job-service";

const CRAWL_REQUEST_GAP_MS = 1000;
const CRAWL_ROBOTS_MAX_BYTES = 512000;

import { SCRAPE_MAX_HTML_BYTES } from "@/lib/constants";

export async function runExtractionJob(
	scrape: ScrapeRow,
	claim: ScrapeJobClaim,
): Promise<void> {
	const request = scrapeRequestSchema.parse(
		scrape.request ?? { url: scrape.sourceUrl, mode: scrape.mode },
	);
	const update = async (values: Partial<typeof scrapes.$inferInsert>) => {
		const rows = await db
			.update(scrapes)
			.set({ ...values, updatedAt: new Date() })
			.where(scrapeClaimPredicate(claim))
			.returning({ id: scrapes.id });
		if (!rows.length) throw new Error("Job lease sudah tidak berlaku.");
	};
	await update({ status: "capturing" });
	if (request.mode === "crawl") {
		const completed = await db
			.select()
			.from(scrapePages)
			.where(
				and(
					eq(scrapePages.scrapeId, claim.id),
					eq(scrapePages.userId, claim.userId),
				),
			);
		const results = await crawlWebsite(request.url, request.settings, {
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
					if (!owner) throw new Error("Job lease sudah tidak berlaku.");
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
					await new Promise((resolve) =>
						setTimeout(resolve, CRAWL_REQUEST_GAP_MS),
					);
					return fetchAsset(url, 0, {
						maxBytes: SCRAPE_MAX_HTML_BYTES,
						allowUrl: (target) =>
							isCrawlScope(
								target,
								request.url,
								request.settings.followSubdomains,
							),
					});
				});
				if (!/^text\/html|application\/xhtml\+xml/i.test(result.contentType))
					throw new Error("Konten bukan HTML.");
				return {
					html: result.body.toString("utf8"),
					status: result.status,
					finalUrl: result.finalUrl,
				};
			},
			robots: async (origin) => {
				const result = await fetchAsset(`${origin}/robots.txt`, 0, {
					maxBytes: CRAWL_ROBOTS_MAX_BYTES,
					allowUrl: (target) => new URL(target).origin === origin,
				});
				if (result.status === 404) return "";
				if (result.status !== 200)
					throw new Error("robots.txt tidak dapat diverifikasi.");
				const content = result.body.toString("utf8");
				if (/<html\b/i.test(content))
					throw new Error("robots.txt bukan dokumen aturan yang valid.");
				if (/crawl-delay\s*:\s*(?:[2-9]|\d{2,})/i.test(content))
					throw new Error(
						"robots.txt meminta crawl delay lebih lama dari kapasitas job ini.",
					);
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
					if (!owner) throw new Error("Job lease sudah tidak berlaku.");
					await tx
						.insert(scrapePages)
						.values({ ...page, userId: claim.userId, scrapeId: claim.id })
						.onConflictDoUpdate({
							target: [
								scrapePages.userId,
								scrapePages.scrapeId,
								scrapePages.url,
							],
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
						visitedPages: pages.length,
						discoveredPages: discovered,
						failedResources: pages.filter((row) => row.status === "failed")
							.length,
						activity: page.url,
					},
				});
			},
		});
		if (!results.some((page) => page.status === "completed"))
			throw new Error("Tidak ada halaman yang berhasil diambil.");
	} else if (request.mode === "images") {
		const captured = await renderPage(request.url, {
			mode: "images",
			...request.settings,
		});
		const images = normalizeImageCandidates(
			captured.images ?? [],
			request.settings.classifyType,
		);
		await update({
			status: "extracting",
			metadata: {
				...scrape.metadata,
				mode: "images",
				processedImages: images.length,
			},
		});
		await db.transaction(async (tx) => {
			const [owner] = await tx
				.select({ id: scrapes.id })
				.from(scrapes)
				.where(scrapeClaimPredicate(claim))
				.for("update")
				.limit(1);
			if (!owner) throw new Error("Job lease sudah tidak berlaku.");
			for (const image of images)
				await tx
					.insert(scrapeImages)
					.values({
						...image,
						pageUrl: captured.finalUrl,
						userId: claim.userId,
						scrapeId: claim.id,
						status: "completed",
					})
					.onConflictDoNothing();
		});
		await update({
			sourceUrl: captured.finalUrl,
			metadata: {
				...scrape.metadata,
				mode: "images",
				processedImages: images.length,
			},
		});
	} else throw new Error("Mode extraction tidak sesuai.");
	await update({ status: "completed" });
}
