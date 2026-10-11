import { setTimeout as wait } from "node:timers/promises";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
	type ScrapeRow,
	scrapeImages,
	scrapePages,
	scrapes,
} from "@/db/schema";
import { crawlWebsite, isCrawlScope } from "@/lib/crawl-website";
import { ScrapeError } from "@/lib/design-errors";
import { fetchAsset } from "@/lib/fetch-html";
import { renderPage } from "@/lib/render-page";
import { SCRAPE_LIMITS, scrapeRequestSchema } from "@/lib/scrape-contract";
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
		if (values.status)
			values.metadata = {
				...scrape.metadata,
				...values.metadata,
				stage: values.status,
				stageStartedAt: new Date().toISOString(),
			};
		if (values.metadata)
			scrape.metadata = { ...scrape.metadata, ...values.metadata };
		const rows = await db
			.update(scrapes)
			.set({ ...values, updatedAt: new Date() })
			.where(scrapeClaimPredicate(claim))
			.returning({ id: scrapes.id });
		if (!rows.length) throw new Error("Job lease sudah tidak berlaku.");
	};
	await update({ status: "capturing" });
	if (request.mode === "crawl") {
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
		const results = await crawlWebsite(request.url, request.settings, {
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
					await wait(
						crawlDelays.get(new URL(url).origin) ?? CRAWL_REQUEST_GAP_MS,
						undefined,
						{ signal: claim.signal },
					);
					return fetchAsset(url, 0, {
						maxBytes: SCRAPE_MAX_HTML_BYTES,
						signal: claim.signal,
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
					signal: claim.signal,
					allowUrl: (target) => new URL(target).origin === origin,
				});
				if (result.status === 404) return "";
				if (result.status !== 200)
					throw new Error("robots.txt tidak dapat diverifikasi.");
				const content = result.body.toString("utf8");
				if (/<html\b/i.test(content))
					throw new Error("robots.txt bukan dokumen aturan yang valid.");
				const delay =
					Number(
						content.match(/crawl-delay\s*:\s*(\d+(?:\.\d+)?)/i)?.[1] ?? "0",
					) * 1000;
				if (delay > SCRAPE_LIMITS.maxCrawlDelayMs)
					throw new Error("Crawl delay robots.txt melampaui batas job.");
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
						visitedPages: pages.filter((row) => row.status !== "queued").length,
						completedPages: pages.filter((row) => row.status === "completed")
							.length,
						skippedPages: pages.filter((row) => row.status === "skipped")
							.length,
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
			signal: claim.signal,
			mode: "images",
			...request.settings,
			onActivity: async (activity) =>
				update({
					metadata: {
						...scrape.metadata,
						mode: "images",
						activity,
						activityStartedAt: new Date().toISOString(),
					},
				}),
		});
		const images = normalizeImageCandidates(
			captured.images ?? [],
			request.settings.classifyType,
		);
		const validImages: typeof images = [];
		let failedImages = 0;
		await update({
			status: "extracting",
			metadata: {
				...scrape.metadata,
				mode: "images",
				discoveredImages: images.length,
				processedImages: 0,
			},
		});
		for (const image of images) {
			let error: string | null = null;
			try {
				const asset = await fetchAsset(image.url, 0, { signal: claim.signal });
				if (asset.status < 200 || asset.status >= 300)
					throw new Error(`HTTP ${asset.status}`);
				if (!/^image\//i.test(asset.contentType) || !asset.body.length)
					throw new Error("Resource bukan gambar yang valid.");
				image.format = asset.contentType
					.split(";")[0]
					.replace(/^image\//i, "")
					.replace("svg+xml", "svg")
					.replace("jpeg", "jpg");
				validImages.push(image);
			} catch (failure) {
				if (claim.signal?.aborted) throw failure;
				failedImages += 1;
				error =
					failure instanceof Error
						? failure.message
						: "Resource gagal diambil.";
			}
			await db.transaction(async (tx) => {
				const [owner] = await tx
					.select({ id: scrapes.id })
					.from(scrapes)
					.where(scrapeClaimPredicate(claim))
					.for("update")
					.limit(1);
				if (!owner) throw new Error("Job lease sudah tidak berlaku.");
				await tx
					.insert(scrapeImages)
					.values({
						...image,
						pageUrl: captured.finalUrl,
						userId: claim.userId,
						scrapeId: claim.id,
						status: error ? "failed" : "completed",
						error,
					})
					.onConflictDoUpdate({
						target: [
							scrapeImages.userId,
							scrapeImages.scrapeId,
							scrapeImages.url,
						],
						set: { ...image, status: error ? "failed" : "completed", error },
					});
			});
			await update({
				metadata: {
					...scrape.metadata,
					mode: "images",
					discoveredImages: images.length,
					processedImages: validImages.length + failedImages,
					savedImages: validImages.length,
					failedResources: failedImages,
					activity: image.url,
					activityStartedAt: new Date().toISOString(),
				},
			});
		}
		if (images.length && !validImages.length)
			throw new ScrapeError(
				"NO_ANALYZABLE_CONTENT",
				`Seluruh ${failedImages} resource gambar gagal diverifikasi. Detail kegagalan tersimpan.`,
			);
		await update({
			sourceUrl: captured.finalUrl,
			metadata: {
				...scrape.metadata,
				mode: "images",
				discoveredImages: images.length,
				processedImages: validImages.length + failedImages,
				savedImages: validImages.length,
				failedResources: failedImages,
			},
		});
	} else throw new Error("Mode extraction tidak sesuai.");
	await update({ status: "completed" });
}
