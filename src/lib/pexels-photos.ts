import { z } from "zod";
import { fetchAsset } from "./fetch-html";

const API = "https://api.pexels.com/v1/search";
const CDN = "https://images.pexels.com";
const SITE = "https://www.pexels.com";
const SEARCH_BYTES = 64 * 1024;
const IMAGE_BYTES = 2 * 1024 * 1024;
const DEADLINE_MS = 2800;
const SEARCH_CACHE_MS = 24 * 60 * 60 * 1000;
const SEARCH_CACHE_SIZE = 128;
const MAX_IN_FLIGHT = 12;
const CANDIDATES = 4;
const MIN_EDGE = 320;
const MAX_EDGE = 2560;

const photoSchema = z.object({
	id: z.number().int().positive(),
	width: z.number().int().min(MIN_EDGE),
	height: z.number().int().min(MIN_EDGE),
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

export interface PexelsPhoto {
	url: string;
	width: number;
	height: number;
	photographer: string;
	source: string;
	alt: string;
}
export type PexelsFailure =
	| "not-configured"
	| "busy"
	| "timeout"
	| "provider-unavailable"
	| "no-match"
	| "invalid-image";
type PhotoRequest = {
	query: string;
	aspect: "landscape" | "portrait" | "square";
};

function providerUrl(
	raw: string,
	origin: string,
	path: RegExp,
): URL | undefined {
	try {
		const url = new URL(raw);
		if (
			url.origin === origin &&
			!url.username &&
			!url.password &&
			!url.hash &&
			path.test(url.pathname)
		)
			return url;
	} catch {
		return undefined;
	}
}

// Inspect JPEG geometry rather than trusting dimensions of the original photo
// (the API returns resized/cropped URLs). Never accept SVG or arbitrary bytes.
function jpegDimensions(body: Buffer) {
	if (
		body.length < 14 ||
		body.readUInt16BE(0) !== 0xffd8 ||
		body.readUInt16BE(body.length - 2) !== 0xffd9
	)
		return;
	for (let i = 2; i + 8 < body.length && body[i] === 0xff; ) {
		const marker = body[i + 1];
		const length = body.readUInt16BE(i + 2);
		if (length < 2 || i + 2 + length > body.length || marker === 0xda) return;
		if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
			if (length < 8) return;
			return {
				width: body.readUInt16BE(i + 7),
				height: body.readUInt16BE(i + 5),
			};
		}
		i += 2 + length;
	}
}

export async function fetchPexelsImage(
	url: string,
	signal: AbortSignal,
	load = fetchAsset,
) {
	if (!providerUrl(url, CDN, /^\/photos\/\d+\/[^/]+$/)) return null;
	const asset = await load(url, 0, {
		signal,
		allowRedirects: false,
		maxBytes: IMAGE_BYTES,
		allowUrl: (raw) => raw === url,
	});
	if (
		asset.status !== 200 ||
		!/^image\/jpeg(?:\s*;|$)/i.test(asset.contentType) ||
		asset.body.length > IMAGE_BYTES
	)
		return null;
	const size = jpegDimensions(asset.body);
	if (
		!size ||
		![size.width, size.height].every((n) => n >= MIN_EDGE && n <= MAX_EDGE)
	)
		return null;
	return { asset, size };
}

export function resolvePexelsPhoto(
	key: string | undefined,
	load = fetchAsset,
	deadlineMs = DEADLINE_MS,
) {
	const pending = new Map<string, Promise<PexelsPhoto | PexelsFailure>>();
	const searches = new Map<string, { expires: number; photos: unknown[] }>();
	return ({
		query,
		aspect,
	}: PhotoRequest): Promise<PexelsPhoto | PexelsFailure> => {
		if (!key) return Promise.resolve("not-configured");
		const normalized = query.trim().replace(/\s+/g, " ").toLowerCase();
		const cacheKey = `${aspect}:${normalized}`;
		const existing = pending.get(cacheKey);
		if (existing) return existing;
		if (pending.size >= MAX_IN_FLIGHT) return Promise.resolve("busy");
		const signal = AbortSignal.timeout(deadlineMs);
		const options = { signal, allowRedirects: false };
		const lookup = async (): Promise<PexelsPhoto | PexelsFailure> => {
			try {
				const cached = searches.get(cacheKey);
				let photos =
					cached && cached.expires > Date.now() ? cached.photos : undefined;
				if (!photos) {
					const url = new URL(API);
					url.search = new URLSearchParams({
						query: normalized,
						orientation: aspect,
						per_page: String(CANDIDATES),
					}).toString();
					const request = () =>
						load(url.href, 0, {
							...options,
							authorization: key,
							maxBytes: SEARCH_BYTES,
							allowUrl: (raw) => raw === url.href,
						});
					let response = await request();
					if (response.status >= 500 && !signal.aborted)
						response = await request();
					if (
						response.status !== 200 ||
						!/^application\/json\b/i.test(response.contentType)
					)
						return "provider-unavailable";
					const parsed = searchSchema.safeParse(
						JSON.parse(response.body.toString("utf8")),
					);
					if (!parsed.success) return "provider-unavailable";
					photos = parsed.data.photos;
					if (searches.size >= SEARCH_CACHE_SIZE)
						searches.delete(searches.keys().next().value ?? "");
					searches.set(cacheKey, {
						photos,
						expires: Date.now() + SEARCH_CACHE_MS,
					});
				}
				let invalid = false;
				const terms = normalized.match(/[\p{L}\p{N}]{3,}/gu) ?? [];
				for (const raw of photos) {
					signal.throwIfAborted();
					const parsed = photoSchema.safeParse(raw);
					if (!parsed.success) continue;
					const photo = parsed.data;
					const description = photo.alt.toLowerCase();
					if (terms.length && !terms.some((term) => description.includes(term)))
						continue;
					const source = providerUrl(
						photo.url,
						SITE,
						new RegExp(`^/photo/[^/]*-${photo.id}/?$`),
					);
					const image = providerUrl(
						photo.src[aspect === "square" ? "large" : aspect] ??
							photo.src.large,
						CDN,
						new RegExp(`^/photos/${photo.id}/[^/]+$`),
					);
					if (!source || !image) continue;
					const imageResponse = await fetchPexelsImage(
						image.href,
						signal,
						load,
					);
					if (imageResponse)
						return {
							...imageResponse.size,
							url: image.href,
							source: source.href,
							photographer: photo.photographer,
							alt: photo.alt,
						};
					invalid = true;
				}
				return invalid ? "invalid-image" : "no-match";
			} catch {
				return signal.aborted ? "timeout" : "provider-unavailable";
			}
		};
		const deadline = Promise.withResolvers<PexelsFailure>();
		const timeout = () => deadline.resolve("timeout");
		signal.addEventListener("abort", timeout, { once: true });
		const operation = Promise.race([lookup(), deadline.promise]).finally(() => {
			signal.removeEventListener("abort", timeout);
			pending.delete(cacheKey);
		});
		pending.set(cacheKey, operation);
		return operation;
	};
}
