import { z } from "zod";
import { fetchAsset } from "./fetch-html";
import {
	createPhotoLookup,
	fetchVerifiedPhoto,
	matchesAspect,
	type PhotoRequest,
	type PhotoResult,
	providerUrl,
} from "./photo-asset";

const API = "https://api.pexels.com/v1/search";
const CDN = "https://images.pexels.com";
const SITE = "https://www.pexels.com";
const SEARCH_BYTES = 64 * 1024;
const DEADLINE_MS = 2800;
const CANDIDATES = 4;

const photoSchema = z.object({
	id: z.number().int().positive(),
	width: z.number().int().positive(),
	height: z.number().int().positive(),
	url: z.string().max(500),
	photographer: z.string().trim().min(1).max(160),
	alt: z.string().trim().min(1).max(300),
	src: z.object({
		large: z.string().max(800),
		portrait: z.string().max(800).optional(),
		landscape: z.string().max(800).optional(),
	}),
});
const searchSchema = z.object({ photos: z.array(z.unknown()).max(CANDIDATES) });

/**
 * Pexels is optional and preferred when a credential exists: it needs no
 * attribution, its rate limit is 200/hour and 20,000/month, and caching its
 * metadata for 24 hours is expressly allowed
 * (https://help.pexels.com/hc/en-us/articles/900006470063).
 */
export function resolvePexelsPhoto(
	key: string | undefined,
	load: typeof fetchAsset = fetchAsset,
	deadlineMs = DEADLINE_MS,
) {
	return createPhotoLookup({
		available: Boolean(key),
		deadlineMs,
		burst: { limit: 180, windowMs: 60 * 60 * 1000 },
		dailyLimit: 600,
		search: async (request: PhotoRequest, signal): Promise<PhotoResult> => {
			const search = new URL(API);
			search.search = new URLSearchParams({
				query: request.query,
				orientation: request.aspect,
				per_page: String(CANDIDATES),
			}).toString();
			const request1 = () =>
				load(search.href, 0, {
					signal,
					// The credential is scoped to this request and never follows a redirect.
					authorization: key,
					maxBytes: SEARCH_BYTES,
					allowRedirects: false,
					allowUrl: (raw) => raw === search.href,
				});
			let response = await request1();
			if (response.status >= 500 && !signal.aborted)
				response = await request1();
			if (
				response.status !== 200 ||
				!/^application\/json\b/i.test(response.contentType)
			)
				return "provider-unavailable";
			const parsed = searchSchema.safeParse(
				JSON.parse(response.body.toString("utf8")),
			);
			if (!parsed.success) return "provider-unavailable";
			const terms = request.query.match(/[\p{L}\p{N}]{3,}/gu) ?? [];
			let rejected = false;
			for (const raw of parsed.data.photos) {
				signal.throwIfAborted();
				const candidate = photoSchema.safeParse(raw);
				if (!candidate.success) continue;
				const photo = candidate.data;
				const description = photo.alt.toLowerCase();
				// Keyword search returns near-misses; the caption must carry the subject.
				if (terms.length && !terms.some((term) => description.includes(term)))
					continue;
				const source = providerUrl(
					photo.url,
					SITE,
					new RegExp(`^/photo/[^/]*-${photo.id}/?$`),
				);
				const image = providerUrl(
					photo.src[request.aspect === "square" ? "large" : request.aspect] ??
						photo.src.large,
					CDN,
					new RegExp(`^/photos/${photo.id}/[^/]+$`),
				);
				if (!source || !image) continue;
				const asset = await fetchVerifiedPhoto({
					url: image.href,
					origin: CDN,
					path: new RegExp(`^/photos/${photo.id}/`),
					signal,
					load,
				});
				if (!asset || !matchesAspect(asset.size, request.aspect)) {
					rejected = true;
					continue;
				}
				return {
					...asset.size,
					url: image.href,
					source: source.href,
					creator: photo.photographer,
					alt: photo.alt,
					provider: "Pexels",
				};
			}
			return rejected ? "invalid-image" : "no-match";
		},
	});
}
