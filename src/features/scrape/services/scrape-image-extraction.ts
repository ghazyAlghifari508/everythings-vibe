import { setTimeout as wait } from "node:timers/promises";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import type { ScrapeRow } from "@/db/schema";
import { scrapeImages } from "@/db/schema";
import { renderPage } from "@/features/scrape/services/render-page";
import type { ImagesSettings } from "@/features/scrape/types/scrape-contract";
import {
	classifyImageOutcome,
	normalizeImageCandidates,
} from "@/features/scrape/utils/scrape-images";
import {
	designErrorCodeForHttpStatus,
	parseRetryAfterSeconds,
	ScrapeError,
} from "@/lib/design-errors";
import { fetchAsset } from "@/lib/fetch-html";
import {
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
import type { ScrapeJobClaim, ScrapeJobUpdate } from "./scrape-job-service";

// Transient transport failures are retried a bounded number of times. Status
// responses such as 404 or 403 are final answers from the site and are never
// retried, so we do not add load to a server that already refused the request.
const IMAGE_FETCH_ATTEMPTS = 2;
const IMAGE_FETCH_RETRY_DELAY_MS = 400;
const RETRYABLE_FETCH_CODES = new Set(["FETCH_TIMEOUT", "WEBSITE_BLOCKED"]);

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

export async function runImageExtraction(params: {
	scrape: ScrapeRow;
	claim: ScrapeJobClaim;
	url: string;
	settings: ImagesSettings;
	update: ScrapeJobUpdate;
}): Promise<void> {
	const { scrape, claim, url, settings, update } = params;
	const allowUrl = createImageSitePolicy(claim.signal);
	await allowUrl(url);
	// Distinguishes a page that genuinely has no images from a discovery
	// failure. The browser capture already succeeded by this point, so an
	// empty candidate list is a real observation, while a missing list means
	// discovery never ran.
	let captured: Awaited<ReturnType<typeof renderPage>>;
	try {
		captured = await renderPage(url, {
			signal: claim.signal,
			mode: "images",
			...settings,
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
		settings.classifyType,
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
				failure instanceof Error ? failure.message : "Resource gagal diambil.";
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
}
