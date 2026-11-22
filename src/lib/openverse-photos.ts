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

const API = "https://api.openverse.org/v1/images/";
const SEARCH_BYTES = 128 * 1024;
/**
 * Measured on the live service: a query that is not cached by Openverse
 * answered 504, then 500, then 200 in 11.9-15.2 s, and the same query warm in
 * 59 ms. 25 s lets the single retry reach the warm index. The wait is
 * affordable because resolution runs beside generation: the frame only waits
 * for whichever finishes last, and no other frame is blocked.
 */
const DEADLINE_MS = 25_000;
const CANDIDATES = 5;
/**
 * Licence filter, deliberately narrow: CC0 and public-domain marks carry no
 * obligations, CC BY needs attribution, which the credit line provides.
 * Share-alike (by-sa) and non-commercial (by-nc) are excluded so a generated
 * design never inherits a redistribution obligation.
 * ponytail: widen only with an explicit product decision on share-alike.
 */
const LICENSES = "cc0,pdm,by";

const resultSchema = z.object({
	title: z.string().trim().min(1).max(200),
	url: z.string().max(1000),
	width: z.number().int().positive(),
	height: z.number().int().positive(),
	creator: z.string().trim().min(1).max(160).nullable().optional(),
	license: z.string().trim().min(1).max(20),
	license_version: z.string().max(20).nullable().optional(),
	license_url: z.string().max(300).nullable().optional(),
	foreign_landing_url: z.string().max(1000),
});
const searchSchema = z.object({
	results: z.array(z.unknown()).max(CANDIDATES),
});

/** Public https URL, or nothing: a provider must never point Studio at a scheme it cannot guard. */
function publicHttpsUrl(raw: string): URL | undefined {
	try {
		const url = new URL(raw);
		if (url.protocol !== "https:" || url.username || url.password || url.hash)
			return undefined;
		return url;
	} catch {
		return undefined;
	}
}

function licenseName(license: string, version?: string | null) {
	const id = license.toLowerCase();
	return id === "cc0" || id === "pdm"
		? id.toUpperCase()
		: `CC ${id.toUpperCase()}${version ? ` ${version}` : ""}`;
}

/**
 * Openverse is the keyless default: WordPress aggregates openly licensed
 * photographs from Wikimedia Commons, Flickr and others. Its terms require
 * attribution to the work and a visible notice that Openverse was used
 * (https://docs.openverse.org/terms_of_service.html); the credit line carries
 * both. Anonymous use is throttled to 20 requests/minute and 200/day, and the
 * local budget below stays inside that.
 */
export function resolveOpenversePhoto(
	load: typeof fetchAsset = fetchAsset,
	deadlineMs = DEADLINE_MS,
) {
	return createPhotoLookup({
		available: true,
		deadlineMs,
		burst: { limit: 18, windowMs: 60 * 1000 },
		dailyLimit: 180,
		search: async (request: PhotoRequest, signal): Promise<PhotoResult> => {
			const search = new URL(API);
			// Openverse publishes no orientation parameter, so the requested
			// aspect is enforced from the verified pixel geometry instead.
			search.search = new URLSearchParams({
				q: request.query,
				license: LICENSES,
				mature: "false",
				page_size: String(CANDIDATES),
			}).toString();
			const request1 = () =>
				load(search.href, 0, {
					signal,
					maxBytes: SEARCH_BYTES,
					allowRedirects: false,
					allowUrl: (raw) => raw === search.href,
				});
			let response = await request1();
			// Openverse intermittently answers 5xx while its index warms; one
			// bounded retry mirrors the Pexels path.
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
			for (const raw of parsed.data.results) {
				signal.throwIfAborted();
				const candidate = resultSchema.safeParse(raw);
				if (!candidate.success) continue;
				const photo = candidate.data;
				// Keyword search returns near-misses; the title must carry the subject.
				const title = photo.title.toLowerCase();
				if (terms.length && !terms.some((term) => title.includes(term)))
					continue;
				const source = publicHttpsUrl(photo.foreign_landing_url);
				const image = publicHttpsUrl(photo.url);
				if (!source || !image) continue;
				const asset = await fetchVerifiedPhoto({
					url: image.href,
					origin: image.origin,
					path: /\.(?:jpe?g)$/i,
					signal,
					load,
				});
				if (!asset || !matchesAspect(asset.size, request.aspect)) {
					rejected = true;
					continue;
				}
				const licenseUrl = photo.license_url
					? providerUrl(
							photo.license_url,
							"https://creativecommons.org",
							/^\/(?:licenses|publicdomain)\//,
						)
					: undefined;
				return {
					...asset.size,
					url: image.href,
					source: source.href,
					creator: photo.creator ?? "Kontributor Openverse",
					alt: photo.title,
					provider: "Openverse",
					license: {
						name: licenseName(photo.license, photo.license_version),
						url: licenseUrl?.href ?? "https://creativecommons.org/licenses/",
					},
				};
			}
			return rejected ? "invalid-image" : "no-match";
		},
	});
}
