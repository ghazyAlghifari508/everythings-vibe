import { type FetchedAsset, fetchAsset } from "./fetch-html";

/** A verified photo Studio may place in a generated design. */
export interface PhotoAsset {
	url: string;
	width: number;
	height: number;
	creator: string;
	source: string;
	alt: string;
	provider: string;
	/** Required by some providers; rendered as a licence link next to the credit. */
	license?: { name: string; url: string };
}

export type PhotoFailure =
	| "not-configured"
	| "busy"
	| "throttled"
	| "timeout"
	| "provider-unavailable"
	| "no-match"
	| "invalid-image";

export type PhotoAspect = "landscape" | "portrait" | "square";
export interface PhotoRequest {
	query: string;
	aspect: PhotoAspect;
}
export type PhotoResult = PhotoAsset | PhotoFailure;

/**
 * Verified geometry and bytes. A placeholder thumbnail is not a usable
 * photograph, and neither is an SVG masquerading as one.
 */
export const PHOTO_MIN_EDGE = 320;
export const PHOTO_MAX_EDGE = 2560;
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

export function providerUrl(
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

/**
 * JPEG dimensions from the SOF marker. The provider metadata describes the
 * original photograph, while the URL actually served is resized or cropped, so
 * only the bytes prove what the browser will receive.
 */
export function jpegDimensions(
	body: Buffer,
): { width: number; height: number } | undefined {
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

/**
 * The declared aspect is a layout contract, and providers report orientation
 * inconsistently, so the verified geometry decides. A mild tolerance keeps a
 * near-square photograph usable for a square slot.
 */
export function matchesAspect(
	size: { width: number; height: number },
	aspect: PhotoAspect,
): boolean {
	const ratio = size.width / size.height;
	if (aspect === "landscape") return ratio >= 1.15;
	if (aspect === "portrait") return ratio <= 0.87;
	return ratio > 0.87 && ratio < 1.15;
}

/** Fetches a provider image and proves it is a real, bounded raster photo. */
export async function fetchVerifiedPhoto(options: {
	url: string;
	origin: string;
	path: RegExp;
	signal: AbortSignal;
	load?: typeof fetchAsset;
}): Promise<{
	asset: FetchedAsset;
	size: { width: number; height: number };
} | null> {
	const load = options.load ?? fetchAsset;
	if (
		!providerUrl(options.url, options.origin, options.path) ||
		options.signal.aborted
	)
		return null;
	const asset = await load(options.url, 0, {
		signal: options.signal,
		allowRedirects: false,
		maxBytes: PHOTO_MAX_BYTES,
		allowUrl: (raw) => raw === options.url,
	});
	if (
		asset.status !== 200 ||
		!/^image\/jpeg(?:\s*;|$)/i.test(asset.contentType) ||
		asset.body.length > PHOTO_MAX_BYTES
	)
		return null;
	const size = jpegDimensions(asset.body);
	if (
		!size ||
		![size.width, size.height].every(
			(edge) => edge >= PHOTO_MIN_EDGE && edge <= PHOTO_MAX_EDGE,
		)
	)
		return null;
	return { asset, size };
}

/**
 * Any https image Studio did not originate. Used by the capture proxy, which
 * must serve what the design references without trusting its content type.
 */
export async function fetchVerifiedImage(
	url: string,
	signal: AbortSignal,
	load: typeof fetchAsset = fetchAsset,
) {
	const asset = await load(url, 0, { signal, maxBytes: PHOTO_MAX_BYTES });
	if (
		asset.status !== 200 ||
		!asset.contentType.toLowerCase().startsWith("image/")
	)
		return null;
	return asset;
}

const SEARCH_CACHE_MS = 24 * 60 * 60 * 1000;
const SEARCH_CACHE_SIZE = 128;
const MAX_IN_FLIGHT = 8;

interface LookupOptions {
	/** False when the provider needs a credential Studio does not have. */
	available: boolean;
	deadlineMs: number;
	/** Provider burst limit, e.g. Pexels 200/hour, Openverse 20/minute. */
	burst: { limit: number; windowMs: number };
	/** Provider sustained limit per day, kept below the published ceiling. */
	dailyLimit: number;
	search: (request: PhotoRequest, signal: AbortSignal) => Promise<PhotoResult>;
}

/**
 * One lookup per provider: bounded in-flight work, a deadline, a 24-hour
 * metadata cache and a local budget so a design never burns the provider's
 * quota. Deduplication is by query and aspect, so two screens asking for the
 * same subject share one request.
 */
export function createPhotoLookup(options: LookupOptions) {
	const pending = new Map<string, Promise<PhotoResult>>();
	const cached = new Map<string, { expires: number; value: PhotoAsset }>();
	let burstWindow = 0;
	let burstUsed = 0;
	let dayStart = 0;
	let dayUsed = 0;
	const budget = () => {
		const now = Date.now();
		if (now - burstWindow >= options.burst.windowMs) {
			burstWindow = now;
			burstUsed = 0;
		}
		if (now - dayStart >= 24 * 60 * 60 * 1000) {
			dayStart = now;
			dayUsed = 0;
		}
		if (burstUsed >= options.burst.limit || dayUsed >= options.dailyLimit)
			return false;
		burstUsed++;
		dayUsed++;
		return true;
	};
	return (request: PhotoRequest): Promise<PhotoResult> => {
		if (!options.available) return Promise.resolve("not-configured");
		const query = request.query.trim().replace(/\s+/g, " ").toLowerCase();
		const key = `${request.aspect}:${query}`;
		const hit = cached.get(key);
		if (hit && hit.expires > Date.now()) return Promise.resolve(hit.value);
		const existing = pending.get(key);
		if (existing) return existing;
		if (pending.size >= MAX_IN_FLIGHT || !budget())
			return Promise.resolve("busy");
		const signal = AbortSignal.timeout(options.deadlineMs);
		const deadline = Promise.withResolvers<PhotoFailure>();
		const onAbort = () => deadline.resolve("timeout");
		signal.addEventListener("abort", onAbort, { once: true });
		const lookup = options
			.search({ query, aspect: request.aspect }, signal)
			.then((result): PhotoResult => {
				if (typeof result === "string") return result;
				// Providers publish a cache allowance for their metadata; the
				// resolved URL stays valid far longer than the search response.
				if (cached.size >= SEARCH_CACHE_SIZE)
					cached.delete(cached.keys().next().value ?? "");
				cached.set(key, {
					expires: Date.now() + SEARCH_CACHE_MS,
					value: result,
				});
				return result;
			})
			.catch(
				(): PhotoFailure =>
					signal.aborted ? "timeout" : "provider-unavailable",
			);
		const operation = Promise.race([lookup, deadline.promise]).finally(() => {
			signal.removeEventListener("abort", onAbort);
			pending.delete(key);
		});
		pending.set(key, operation);
		return operation;
	};
}
