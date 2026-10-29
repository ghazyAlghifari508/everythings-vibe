import { setTimeout as wait } from "node:timers/promises";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import type { ScrapeRow } from "@/db/schema";
import { scrapeImages } from "@/db/schema";
import { fetchAsset } from "@/features/scrape/services/http-transport";
import { renderPage } from "@/features/scrape/services/render-page";
import type { ImagesSettings } from "@/features/scrape/types/scrape-contract";
import {
	classifyImageOutcome,
	normalizeImageCandidates,
	normalizeImageCandidateUrl,
} from "@/features/scrape/utils/scrape-images";
import {
	designErrorCodeForHttpStatus,
	parseRetryAfterSeconds,
	ScrapeError,
} from "@/lib/design-errors";
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

// Retries only transient transport faults and 5xx answers; final 4xx status answers are never retried.
const IMAGE_FETCH_ATTEMPTS = 2;
const IMAGE_FETCH_RETRY_DELAY_MS = 400;
const RETRYABLE_FETCH_CODES = new Set(["FETCH_TIMEOUT"]);

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
	plan: ImageFetchPlan = IMAGE_FETCH_PLAN,
): Promise<Awaited<ReturnType<typeof fetchAsset>>> {
	let lastError: unknown;
	for (let attempt = 0; attempt < plan.attempts; attempt += 1) {
		if (attempt > 0)
			await wait(plan.retryDelayMs * attempt, undefined, { signal });
		try {
			const asset = await fetchAsset(url, 0, { signal, allowUrl });
			if (shouldRetryImageFetch(attempt, asset.status, null, plan)) continue;
			return asset;
		} catch (error) {
			lastError = error;
			const code =
				error instanceof ScrapeError ? error.code : "UNEXPECTED_ERROR";
			if (!shouldRetryImageFetch(attempt, null, code, plan)) throw error;
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
	const validCandidates = captured.images.flatMap((candidate) => {
		const normalizedUrl = normalizeImageCandidateUrl(
			candidate.url,
			captured.finalUrl,
		);
		return normalizedUrl ? [{ ...candidate, url: normalizedUrl }] : [];
	});
	const images = normalizeImageCandidates(
		validCandidates,
		settings.classifyType,
	);
	type ResultRow = {
		url: string;
		assetId: string | null;
		failureCode: string | null;
		httpStatus: number | null;
	};
	const fallbackRows = new Map<string, ResultRow>();
	const loadResults = async (): Promise<ResultRow[]> => {
		const persisted = await db
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
		if (fallbackRows.size === 0) return persisted;
		const merged = new Map<string, ResultRow>(fallbackRows);
		for (const row of persisted) merged.set(row.url, row);
		return [...merged.values()];
	};
	const initialRows = await loadResults();
	const savedUrls = new Set(
		initialRows.filter((row) => row.assetId).map((row) => row.url),
	);
	const initialCounts = imageResultCounts(initialRows, validCandidates);
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
	let quotaFailure: ImageStorageError | undefined;
	const rateLimitedOrigins = new Map<string, ScrapeError>();
	let retryAfterSeconds: number | undefined;
	for (const image of images) {
		if (savedUrls.has(image.url)) continue;
		let stage: "fetch" | "validation" | "storage" = "fetch";
		let error: string | null = null;
		let imageAsset: Awaited<ReturnType<typeof fetchAsset>> | undefined;
		let failureCode: string | null = null;
		let httpStatus: number | null = null;
		let failureEvidence: FailedResourceEvidence = {
			code: null,
			httpStatus: null,
		};
		try {
			if (quotaFailure) throw quotaFailure;
			const rateLimited = rateLimitedOrigins.get(new URL(image.url).origin);
			if (rateLimited)
				throw new ScrapeError("WEBSITE_RATE_LIMITED", undefined, {
					retryAfterSeconds: rateLimited.retryAfterSeconds,
				});
			const asset = await fetchImageAsset(image.url, claim.signal, allowUrl);
			httpStatus = asset.status;
			if (asset.status < 200 || asset.status >= 300)
				throw new ScrapeError(
					designErrorCodeForHttpStatus(asset.status),
					`HTTP ${asset.status}`,
					{
						httpStatus: asset.status,
						retryAfterSeconds: parseRetryAfterSeconds(asset.retryAfter),
					},
				);
			stage = "validation";
			const verified = validateStoredImage(asset.body, asset.contentType);
			image.format = verified.mimeType
				.split(";")[0]
				.replace(/^image\//i, "")
				.replace("svg+xml", "svg")
				.replace("jpeg", "jpg");
			stage = "storage";
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
			fallbackRows.delete(image.url);
			imageAsset = asset;
		} catch (failure) {
			if (claim.signal?.aborted) throw failure;
			if (
				failure instanceof ScrapeError &&
				failure.failureReason === "lease-lost"
			)
				throw failure;
			if (failure instanceof ScrapeError && failure.httpStatus === 429)
				rateLimitedOrigins.set(new URL(image.url).origin, failure);
			if (
				failure instanceof ScrapeError &&
				failure.retryAfterSeconds !== undefined
			)
				retryAfterSeconds = Math.max(
					retryAfterSeconds ?? 0,
					failure.retryAfterSeconds,
				);
			if (
				failure instanceof ImageStorageError &&
				failure.code === "STORAGE_FAILED"
			)
				quotaFailure = failure;
			failureCode =
				failure instanceof ScrapeError &&
				failure.failureReason === "asset-too-large"
					? "IMAGE_TOO_LARGE"
					: failure instanceof ImageStorageError
						? failure.assetCode
						: failure instanceof ScrapeError
							? failure.code
							: stage === "storage"
								? "STORAGE_FAILED"
								: "NETWORK_FAILURE";
			error =
				failure instanceof ImageStorageError
					? failure.message
					: stage === "storage"
						? "Gambar tidak dapat disimpan."
						: "Resource gambar tidak dapat diambil atau diverifikasi.";
			// Only parsed statuses and typed codes are recorded, so the
			// aggregate classification never reads message text.
			failureEvidence = {
				code: failure instanceof ScrapeError ? failure.code : null,
				httpStatus:
					failure instanceof ScrapeError && failure.httpStatus !== undefined
						? failure.httpStatus
						: httpStatus,
			};
		}
		if (!imageAsset) {
			try {
				await persistScrapeImage(claim, {
					...image,
					pageUrl: captured.finalUrl,
					status: "failed",
					error,
					failureCode,
					httpStatus: failureEvidence.httpStatus,
				});
			} catch (persistFailure) {
				if (claim.signal?.aborted) throw persistFailure;
				if (
					persistFailure instanceof ScrapeError &&
					persistFailure.failureReason === "lease-lost"
				)
					throw persistFailure;
				fallbackRows.set(image.url, {
					url: image.url,
					assetId: null,
					failureCode: failureCode ?? "STORAGE_FAILED",
					httpStatus: failureEvidence.httpStatus,
				});
			}
		}
		await update({
			metadata: {
				...scrape.metadata,
				mode: "images",
				...imageResultCounts(await loadResults(), validCandidates),
				activity: image.url,
				activityStartedAt: new Date().toISOString(),
			},
		});
	}
	// Classifies all-failed runs from the structured HTTP/code evidence each resource produced.
	const finalRows = await loadResults();
	const finalCounts = imageResultCounts(finalRows, validCandidates);
	const imageOutcome = classifyImageOutcome(
		finalCounts.discoveredImages,
		finalCounts.savedImages,
	);
	await update({
		sourceUrl: captured.finalUrl,
		metadata: {
			...scrape.metadata,
			mode: "images",
			imageOutcome,
			...finalCounts,
			...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
		},
	});
	if (imageOutcome === "all-failed") {
		const failure = classifyImageFailures(
			finalRows
				.filter((row) => !row.assetId)
				.map((row) => ({
					code:
						row.failureCode === "STORAGE_FAILED" ||
						row.failureCode?.endsWith("STORAGE_QUOTA")
							? "STORAGE_FAILED"
							: row.failureCode,
					httpStatus: row.httpStatus,
				})),
		);
		throw new ScrapeError(
			failure.code,
			`Seluruh ${finalCounts.failedResources} resource gambar tidak dapat disimpan. Detail kegagalan tersimpan.`,
			{
				retryAfterSeconds,
				...(failure.httpStatus === undefined
					? {}
					: { httpStatus: failure.httpStatus }),
			},
		);
	}
}
