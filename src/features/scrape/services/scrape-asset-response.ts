import { fetchAsset } from "@/features/scrape/services/http-transport";
import { SCRAPE_MAX_ASSET_BYTES } from "@/features/scrape/types/scrape-constants";
import {
	rewritePreviewCss,
	rewritePreviewModule,
} from "@/features/scrape/utils/preview-capabilities";
import { ScrapeError } from "@/lib/design-errors";

export const ASSET_HEADERS: Record<string, string> = {
	"Cache-Control": "private, no-store",
	"X-Content-Type-Options": "nosniff",
	"Content-Security-Policy": "sandbox; default-src 'none'",
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Expose-Headers":
		"Accept-Ranges, Content-Range, Content-Length, Retry-After",
};

export interface AssetResult {
	retryAfter?: string;
	body: Buffer;
	status: number;
	contentType: string;
	finalUrl: string;
	contentRange?: string;
	acceptRanges?: string;
}

export interface ByteRange {
	start: number;
	end?: number;
	suffixLength?: number;
}

export function parseByteRange(raw: string | null): ByteRange | null | false {
	if (raw === null) return null;
	const match = /^bytes=(?:(\d+)-(\d*)|-(\d+))$/.exec(raw.trim());
	if (!match) return false;
	if (match[3]) {
		const suffixLength = Number(match[3]);
		return Number.isSafeInteger(suffixLength) && suffixLength > 0
			? { start: 0, suffixLength }
			: false;
	}
	const start = Number(match[1]);
	const end = match[2] ? Number(match[2]) : undefined;
	return Number.isSafeInteger(start) &&
		start >= 0 &&
		(end === undefined || (Number.isSafeInteger(end) && end >= start))
		? { start, end }
		: false;
}

export const JS_MIME =
	/^(?:text|application)\/(?:javascript|ecmascript|x-javascript)$/i;

export function safeMime(
	contentType: string,
	body: Buffer,
	target: string,
): string | null {
	const mime = contentType.split(";", 1)[0]?.trim().toLowerCase();
	if (
		!mime ||
		/^(?:text\/html|application\/(?:xhtml\+xml|xml)|text\/xml)$/i.test(mime)
	)
		return null;
	if (mime === "image/svg+xml") return mime;
	if (
		/^image\/(?:avif|bmp|gif|jpeg|png|webp|x-icon|vnd\.microsoft\.icon)$/i.test(
			mime,
		)
	)
		return mime;
	if (/^video\/[a-z0-9.+-]+$/i.test(mime)) return mime;
	if (
		/^(?:font\/(?:otf|ttf|woff|woff2)|application\/(?:font-woff2?|vnd\.ms-fontobject|x-font-(?:otf|ttf)))$/i.test(
			mime,
		)
	)
		return mime;
	if (mime === "text/css") return mime;
	if (JS_MIME.test(mime)) return "text/javascript";
	// ponytail: sniff binary/octet-stream by signature and URL extension to classify CDN fonts, images, and modules accurately.
	if (
		mime === "application/octet-stream" ||
		mime === "binary/octet-stream" ||
		mime === "application/x-download"
	) {
		const signature = body.toString("ascii", 0, 4);
		if (signature === "wOF2") return "font/woff2";
		if (signature === "wOFF") return "font/woff";
		if (signature === "OTTO") return "font/otf";
		if (body[0] === 0 && body[1] === 1 && body[2] === 0 && body[3] === 0)
			return "font/ttf";
		if (signature === "ttcf") return "font/collection";
		if (
			body[0] === 0x89 &&
			body[1] === 0x50 &&
			body[2] === 0x4e &&
			body[3] === 0x47
		)
			return "image/png";
		if (body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff)
			return "image/jpeg";
		if (body.toString("ascii", 0, 3) === "GIF") return "image/gif";
		if (
			body.toString("ascii", 0, 4) === "RIFF" &&
			body.toString("ascii", 8, 12) === "WEBP"
		)
			return "image/webp";
		if (/\.(?:mjs|js)(?:$|[?#])/i.test(target)) return "text/javascript";
		if (/\.woff2(?:$|[?#])/i.test(target)) return "font/woff2";
		if (/\.woff(?:$|[?#])/i.test(target)) return "font/woff";
		if (/\.ttf(?:$|[?#])/i.test(target)) return "font/ttf";
		if (/\.otf(?:$|[?#])/i.test(target)) return "font/otf";
		if (/\.svg(?:$|[?#])/i.test(target)) return "image/svg+xml";
		if (/\.png(?:$|[?#])/i.test(target)) return "image/png";
		if (/\.jpe?g(?:$|[?#])/i.test(target)) return "image/jpeg";
		if (/\.webp(?:$|[?#])/i.test(target)) return "image/webp";
		if (/\.css(?:$|[?#])/i.test(target)) return "text/css";
	}
	return null;
}

export function responseHeaders(contentType?: string): Headers {
	const headers = new Headers(ASSET_HEADERS);
	if (contentType) headers.set("Content-Type", contentType);
	return headers;
}

export function assetError(
	status: number,
	code: string,
	retryAfterSeconds?: number,
): Response {
	const headers = responseHeaders("application/json; charset=utf-8");
	if (retryAfterSeconds !== undefined)
		headers.set("Retry-After", String(retryAfterSeconds));
	return new Response(
		JSON.stringify({
			error: {
				code,
				retryable:
					retryAfterSeconds !== undefined ||
					code === "REMOTE_TIMEOUT" ||
					code === "REMOTE_FETCH_FAILED",
				...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
			},
		}),
		{ status, headers },
	);
}

export function retrySeconds(
	value: string | undefined,
	now: number,
): number | undefined {
	if (!value) return undefined;
	const seconds = /^\d+$/.test(value.trim())
		? Number(value)
		: Math.ceil((Date.parse(value) - now) / 1000);
	return Number.isSafeInteger(seconds) && seconds >= 0 ? seconds : undefined;
}

export async function shapeAssetResponse(
	target: string,
	deps: {
		now?: () => number;
		secret?: string;
		fetchAsset?: (
			target: string,
			options?: { maxBytes?: number; range?: ByteRange },
		) => Promise<AssetResult>;
	} = {},
	options: {
		range?: ByteRange;
		capability?: { scrapeId: string; ownerId: string; expiresAt: number };
		appOrigin?: string;
	} = {},
): Promise<Response> {
	const loader =
		deps.fetchAsset ??
		((target: string, opts?: { maxBytes?: number; range?: ByteRange }) =>
			fetchAsset(target, 0, opts));
	const loaded = await loader(target, {
		maxBytes: SCRAPE_MAX_ASSET_BYTES,
		range: options.range,
	}).catch((error: unknown) => {
		if (error instanceof ScrapeError) throw error;
		return null;
	});
	if (!loaded) return assetError(502, "REMOTE_FETCH_FAILED");
	if (loaded.body.length > SCRAPE_MAX_ASSET_BYTES)
		return assetError(413, "ASSET_TOO_LARGE");
	const headers = responseHeaders();
	if (loaded.status === 416) {
		headers.set("Accept-Ranges", loaded.acceptRanges ?? "bytes");
		if (loaded.contentRange && /^bytes \*\/\d+$/.test(loaded.contentRange))
			headers.set("Content-Range", loaded.contentRange);
		return new Response(null, { status: 416, headers });
	}
	if (loaded.status >= 400)
		return assetError(
			loaded.status,
			loaded.status === 429
				? "REMOTE_RATE_LIMITED"
				: loaded.status === 401 || loaded.status === 403
					? "REMOTE_ACCESS_DENIED"
					: loaded.status === 404 || loaded.status === 410
						? "REMOTE_NOT_FOUND"
						: "REMOTE_HTTP_ERROR",
			retrySeconds(loaded.retryAfter, (deps.now ?? Date.now)()),
		);
	const mime = safeMime(loaded.contentType, loaded.body, loaded.finalUrl);
	if (!mime) return assetError(415, "UNSUPPORTED_MIME");
	const cap = options.capability;
	const appOrigin = options.appOrigin ?? new URL(target).origin;
	let body = loaded.body;
	let contentType = mime;
	if (cap && mime === "text/css") {
		body = Buffer.from(
			rewritePreviewCss(body.toString("utf8"), loaded.finalUrl, {
				baseUrl: loaded.finalUrl,
				appOrigin,
				scrapeId: cap.scrapeId,
				ownerId: cap.ownerId,
				secret: deps.secret,
				now: deps.now ? deps.now() : undefined,
				expiresAt: cap.expiresAt,
			}),
			"utf8",
		);
		contentType = "text/css; charset=utf-8";
	} else if (cap && JS_MIME.test(mime)) {
		try {
			body = Buffer.from(
				await rewritePreviewModule(body.toString("utf8"), loaded.finalUrl, {
					baseUrl: loaded.finalUrl,
					appOrigin,
					scrapeId: cap.scrapeId,
					ownerId: cap.ownerId,
					secret: deps.secret,
					now: deps.now ? deps.now() : undefined,
					expiresAt: cap.expiresAt,
				}),
				"utf8",
			);
			contentType = "text/javascript; charset=utf-8";
		} catch {
			return assetError(415, "INVALID_MODULE");
		}
	}
	headers.set("Content-Type", contentType);
	if (options.range && loaded.status === 206) {
		if (
			!loaded.contentRange ||
			!/^bytes \d+-\d+\/\d+$/.test(loaded.contentRange)
		)
			return new Response(null, { status: 502, headers });
		headers.set("Accept-Ranges", "bytes");
		headers.set("Content-Range", loaded.contentRange);
		headers.set("Content-Length", String(body.byteLength));
		return new Response(new Uint8Array(body), { status: 206, headers });
	}
	return new Response(new Uint8Array(body), { status: 200, headers });
}
