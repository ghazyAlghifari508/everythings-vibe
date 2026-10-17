import { setTimeout as wait } from "node:timers/promises";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
	type ScrapeRow,
	scrapeImages,
	scrapePages,
	scrapes,
} from "@/db/schema";
import { crawlWebsite, isCrawlScope } from "@/features/scrape/services/crawl-website";
import {
	designErrorCodeForHttpStatus,
	parseRetryAfterSeconds,
	ScrapeError,
} from "@/lib/design-errors";
import { fetchAsset } from "@/lib/fetch-html";
import { renderPage } from "@/features/scrape/services/render-page";
import { SCRAPE_LIMITS, scrapeRequestSchema } from "@/features/scrape/types/scrape-contract";
import {
	classifyImageOutcome,
	normalizeImageCandidates,
} from "@/features/scrape/utils/scrape-images";
import {
	classifyCrawlFailures,
	classifyImageFailures,
	type FailedResourceEvidence,
} from "./scrape-failure-summary";
import {
	createImageSitePolicy,
	imageResultCounts,
} from "./scrape-image-policy";
import {
	ImageStorageError,
	persistScrapeImage,
	validateStoredImage,
} from "./scrape-image-storage";
import {
	type ScrapeJobClaim,
	scrapeClaimPredicate,
} from "./scrape-job-service";

const CRAWL_REQUEST_GAP_MS = 1000;
const CRAWL_ROBOTS_MAX_BYTES = 512000;
// Transient transport failures are retried a bounded number of times. Status
// responses such as 404 or 403 are final answers from the site and are never
// retried, so we do not add load to a server that already refused the request.
const IMAGE_FETCH_ATTEMPTS = 2;
const IMAGE_FETCH_RETRY_DELAY_MS = 400;
const RETRYABLE_FETCH_CODES = new Set(["FETCH_TIMEOUT", "WEBSITE_BLOCKED"]);

import { SCRAPE_MAX_HTML_BYTES } from "@/lib/constants";

export interface ImageFetchPlan {
	attempts: number;
	retryDelayMs: number;
	retryableCodes: ReadonlySet<string>;
}

export const IMAGE_FETCH_PLAN: ImageFetchPlan = {
	attempts: IMAGE_FETCH_ATTEMPTS,
	retryDelayMs: IMAGE_FETCH_RETRY_DELAY_MS,
	retryableCodes: RETRYABLE_FETCH_CODES,
};

// A site that answered with a final status is never retried; only transport
// faults and 5xx responses, which may be transient, get another attempt.
export function shouldRetryImageFetch(
	attempt: number,
	status: number | null,
	errorCode: string | null,
	plan: ImageFetchPlan = IMAGE_FETCH_PLAN,
): boolean {
	if (attempt >= plan.attempts - 1) return false;
	if (status !== null) return status >= 500;
	return errorCode !== null && plan.retryableCodes.has(errorCode);
}

async function fetchImageAsset(
	url: string,
	signal: AbortSignal | undefined,
	allowUrl: (url: string) => Promise<boolean>,
): Promise<Awaited<ReturnType<typeof fetchAsset>>> {
	let lastError: unknown;
	for (let attempt = 0; attempt < IMAGE_FETCH_ATTEMPTS; attempt += 1) {
		if (attempt > 0)
			await wait(IMAGE_FETCH_RETRY_DELAY_MS, undefined, { signal });
		try {
			const asset = await fetchAsset(url, 0, { signal, allowUrl });
			if (shouldRetryImageFetch(attempt, asset.status, null)) continue;
			return asset;
		} catch (error) {
			lastError = error;
			const code =
				error instanceof ScrapeError ? error.code : "UNEXPECTED_ERROR";
			if (!shouldRetryImageFetch(attempt, null, code)) throw error;
		}
	}
	throw lastError;
}

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
		if (!rows.length)
			throw new ScrapeError("STORAGE_FAILED", "Job lease sudah tidak berlaku.");
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
							isCrawlScope(
								target,
								request.url,
								request.settings.followSubdomains,
							),
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
	} else if (request.mode === "images") {
		const allowUrl = createImageSitePolicy(claim.signal);
		await allowUrl(request.url);
		// Distinguishes a page that genuinely has no images from a discovery
		// failure. The browser capture already succeeded by this point, so an
		// empty candidate list is a real observation, while a missing list means
		// discovery never ran.
		let captured: Awaited<ReturnType<typeof renderPage>>;
		try {
			captured = await renderPage(request.url, {
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
		} catch (error) {
			if (claim.signal?.aborted) throw error;
			await update({
				metadata: {
					...scrape.metadata,
					mode: "images",
					imageDiscovery: "capture-failed",
				},
			});
			throw error;
		}
		if (!Array.isArray(captured.images)) {
			await update({
				metadata: {
					...scrape.metadata,
					mode: "images",
					imageDiscovery: "discovery-failed",
				},
			});
			throw new ScrapeError(
				"NO_ANALYZABLE_CONTENT",
				"Discovery gambar tidak menghasilkan daftar kandidat. Capture tidak dapat dipakai.",
			);
		}
		const images = normalizeImageCandidates(
			captured.images,
			request.settings.classifyType,
		);
		const validImages: typeof images = [];
		let failedImages = 0;
		const failedResources: FailedResourceEvidence[] = [];
		const loadResults = () =>
			db
				.select({
					url: scrapeImages.url,
					assetId: scrapeImages.assetId,
					failureCode: scrapeImages.failureCode,
					httpStatus: scrapeImages.httpStatus,
				})
				.from(scrapeImages)
				.where(
					and(
						eq(scrapeImages.userId, claim.userId),
						eq(scrapeImages.scrapeId, claim.id),
					),
				);
		const initialCounts = imageResultCounts(await loadResults(), images);
		await update({
			status: "extracting",
			metadata: {
				...scrape.metadata,
				mode: "images",
				imageDiscovery: images.length ? "found" : "none",
				imageStorage: "postgres-private",
				...initialCounts,
			},
		});
		for (const image of images) {
			let error: string | null = null;
			let imageAsset: Awaited<ReturnType<typeof fetchAsset>> | undefined;
			let failureCode: string | null = null;
			let failureEvidence: FailedResourceEvidence = {
				code: null,
				httpStatus: null,
			};
			try {
				const asset = await fetchImageAsset(image.url, claim.signal, allowUrl);
				if (asset.status < 200 || asset.status >= 300)
					throw new ScrapeError(
						designErrorCodeForHttpStatus(asset.status),
						`HTTP ${asset.status}`,
						{
							httpStatus: asset.status,
							retryAfterSeconds: parseRetryAfterSeconds(asset.retryAfter),
						},
					);
				const verified = validateStoredImage(asset.body, asset.contentType);
				image.format = verified.mimeType
					.split(";")[0]
					.replace(/^image\//i, "")
					.replace("svg+xml", "svg")
					.replace("jpeg", "jpg");
				await persistScrapeImage(
					claim,
					{
						...image,
						pageUrl: captured.finalUrl,
						status: "completed",
						error: null,
						failureCode: null,
						httpStatus: asset.status,
					},
					asset,
				);
				imageAsset = asset;
				validImages.push(image);
			} catch (failure) {
				if (claim.signal?.aborted) throw failure;
				failedImages += 1;
				failureCode =
					failure instanceof ImageStorageError
						? failure.assetCode
						: failure instanceof ScrapeError
							? failure.code
							: "STORAGE_FAILED";
				error =
					failure instanceof Error
						? failure.message
						: "Resource gagal diambil.";
				// Only parsed statuses and typed codes are recorded, so the
				// aggregate classification never reads message text.
				failureEvidence = {
					code: failure instanceof ScrapeError ? failure.code : null,
					httpStatus:
						failure instanceof ScrapeError && failure.httpStatus !== undefined
							? failure.httpStatus
							: null,
				};
				failedResources.push(failureEvidence);
			}
			if (!imageAsset) {
				const saved = await persistScrapeImage(claim, {
					...image,
					pageUrl: captured.finalUrl,
					status: "failed",
					error,
					failureCode,
					httpStatus: failureEvidence.httpStatus,
				});
				if (saved.assetId) {
					failedImages -= 1;
					failedResources.pop();
					validImages.push(image);
				}
			}
			await update({
				metadata: {
					...scrape.metadata,
					mode: "images",
					...imageResultCounts(await loadResults(), images),
					activity: image.url,
					activityStartedAt: new Date().toISOString(),
				},
			});
		}
		// Every distinct outcome is reported honestly instead of collapsing into
		// one generic completion: an empty page, a partial result and a total
		// verification failure are different facts about the run. When every
		// asset failed, the failure is classified from the evidence each fetch
		// actually produced instead of one generic message.
		const finalRows = await loadResults();
		const finalCounts = imageResultCounts(finalRows, images);
		const imageOutcome = classifyImageOutcome(
			finalCounts.discoveredImages,
			finalCounts.savedImages,
		);
		if (imageOutcome === "all-failed") {
			const failure = classifyImageFailures(
				finalRows
					.filter((row) => !row.assetId)
					.map((row) => ({
						code: row.failureCode?.endsWith("STORAGE_QUOTA")
							? "STORAGE_FAILED"
							: row.failureCode,
						httpStatus: row.httpStatus,
					})),
			);
			throw new ScrapeError(
				failure.code,
				`Seluruh ${failedImages} resource gambar gagal diverifikasi. Detail kegagalan tersimpan.`,
				{
					...(failure.httpStatus === undefined
						? {}
						: { httpStatus: failure.httpStatus }),
				},
			);
		}
		await update({
			sourceUrl: captured.finalUrl,
			metadata: {
				...scrape.metadata,
				mode: "images",
				imageOutcome,
				...finalCounts,
			},
		});
	} else
		throw new ScrapeError("UNEXPECTED_ERROR", "Mode extraction tidak sesuai.");
	await update({ status: "completed" });
}
