// `/api/scrape/asset` handler: capability-scoped proxy for scraped page assets.
//
// Two access paths: a signed preview capability (scrape owner, rate limited per
// owner+scrape) and a raw `url=` proxy (authenticated, rate limited per IP).
// Everything served is re-typed from the remote response, never passed through
// blindly — HTML/XML stripped, unknown octet-stream sniffed by signature — and
// CSS/JS is rewritten to route its own sub-resources back through this proxy.
import { and, eq, isNull, sql } from "drizzle-orm";
import { rateLimits, scrapes, users } from "@/db/schema";
import { fetchAsset } from "@/features/scrape/services/http-transport";
import {
	ImageStorageError,
	readStoredScrapeImage,
	validateStoredImage,
} from "@/features/scrape/services/scrape-image-storage";
import {
	SCRAPE_ASSET_RATE_LIMIT,
	SCRAPE_ASSET_RATE_WINDOW_S,
	SCRAPE_MAX_ASSET_BYTES,
} from "@/features/scrape/types/scrape-constants";
import {
	rewritePreviewCss,
	rewritePreviewModule,
	verifyPreviewAssetCapability,
} from "@/features/scrape/utils/preview-capabilities";
import { parseAndValidateFormat } from "@/features/scrape/utils/url-validator";
import { ScrapeError } from "@/lib/design-errors";
import { requireUser } from "@/lib/session";

const ASSET_HEADERS: Record<string, string> = {
	"Cache-Control": "private, no-store",
	"X-Content-Type-Options": "nosniff",
	"Content-Security-Policy": "sandbox; default-src 'none'",
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Expose-Headers":
		"Accept-Ranges, Content-Range, Content-Length, Retry-After",
};

interface AssetResult {
	retryAfter?: string;
	body: Buffer;
	status: number;
	contentType: string;
	finalUrl: string;
	contentRange?: string;
	acceptRanges?: string;
}

interface ByteRange {
	start: number;
	end?: number;
	suffixLength?: number;
}

export type AssetRouteDeps = {
	now?: () => number;
	readStoredScrapeImage?: (
		userId: string,
		scrapeId: string,
		imageId: string,
	) => Promise<{ body: Buffer; mimeType: string; byteLength: number } | null>;
	secret?: string;
	requireUser?: typeof requireUser;
	getCapabilityOwner?: (
		scrapeId: string,
	) => Promise<{ ownerId: string; active: boolean } | null>;
	checkRateLimit?: (key: string) => Promise<boolean>;
	fetchAsset?: (
		target: string,
		options?: { maxBytes?: number; range?: ByteRange },
	) => Promise<AssetResult>;
};

function assetWindowStart(now: Date): Date {
	const windowMs = SCRAPE_ASSET_RATE_WINDOW_S * 1000;
	return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

export async function allowAssetRequest(key: string): Promise<boolean> {
	const { db } = await import("@/db");
	try {
		const [row] = await db
			.insert(rateLimits)
			.values({
				id: crypto.randomUUID(),
				userId: `scrape-asset:${key}`,
				action: "api_call",
				windowStart: assetWindowStart(new Date()),
				count: 1,
			})
			.onConflictDoUpdate({
				target: [rateLimits.userId, rateLimits.action, rateLimits.windowStart],
				set: { count: sql`${rateLimits.count} + 1` },
				where: sql`${rateLimits.count} < ${SCRAPE_ASSET_RATE_LIMIT}`,
			})
			.returning({ count: rateLimits.count });
		return Boolean(row);
	} catch (cause) {
		throw new Error("Asset rate limiter unavailable", { cause });
	}
}

async function getCapabilityOwner(
	scrapeId: string,
	ownerId: string,
): Promise<{ ownerId: string; active: boolean } | null> {
	const { db } = await import("@/db");
	const [row] = await db
		.select({ scrapeId: scrapes.id, ownerId: scrapes.userId })
		.from(scrapes)
		.innerJoin(users, eq(users.id, scrapes.userId))
		.where(
			and(
				eq(scrapes.id, scrapeId),
				eq(scrapes.userId, ownerId),
				isNull(users.bannedAt),
			),
		)
		.limit(1);
	return row ? { ownerId: row.ownerId, active: true } : null;
}

function parseByteRange(raw: string | null): ByteRange | null | false {
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

const JS_MIME =
	/^(?:text|application)\/(?:javascript|ecmascript|x-javascript)$/i;

function safeMime(
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
	if (mime === "application/octet-stream") {
		const signature = body.toString("ascii", 0, 4);
		if (signature === "wOF2") return "font/woff2";
		if (signature === "wOFF") return "font/woff";
		if (signature === "OTTO") return "font/otf";
		if (body[0] === 0 && body[1] === 1 && body[2] === 0 && body[3] === 0)
			return "font/ttf";
		if (/\.(?:mjs|js)(?:$|[?#])/i.test(target)) return "text/javascript";
	}
	return null;
}

function responseHeaders(contentType?: string): Headers {
	const headers = new Headers(ASSET_HEADERS);
	if (contentType) headers.set("Content-Type", contentType);
	return headers;
}

function assetError(
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

function retrySeconds(
	value: string | undefined,
	now: number,
): number | undefined {
	if (!value) return undefined;
	const seconds = /^\d+$/.test(value.trim())
		? Number(value)
		: Math.ceil((Date.parse(value) - now) / 1000);
	return Number.isSafeInteger(seconds) && seconds >= 0 ? seconds : undefined;
}

function rateLimited(deps: AssetRouteDeps): Response {
	const now = (deps.now ?? Date.now)();
	return assetError(
		429,
		"PROXY_RATE_LIMITED",
		Math.ceil(
			(assetWindowStart(new Date(now)).getTime() +
				SCRAPE_ASSET_RATE_WINDOW_S * 1000 -
				now) /
				1000,
		),
	);
}

export async function shapeAssetResponse(
	target: string,
	deps: AssetRouteDeps = {},
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

export async function GET(
	ctx: { request: Request },
	deps: AssetRouteDeps = {},
): Promise<Response> {
	const url = new URL(ctx.request.url);
	const caps = url.searchParams.getAll("cap");
	const urls = url.searchParams.getAll("url");
	if (
		caps.length > 1 ||
		urls.length > 1 ||
		(caps.length > 0 && urls.length > 0)
	)
		return assetError(400, "INVALID_REQUEST");
	const token = caps[0];
	const targetValue = urls[0];
	const headers = ctx.request.headers;
	try {
		if (token !== undefined) {
			const now = (deps.now ?? Date.now)();
			const capability = verifyPreviewAssetCapability(token, deps.secret, {
				now,
				allowExpired: true,
			});
			if (!capability) return assetError(401, "CAPABILITY_INVALID");
			if (capability.expiresAt <= now)
				return assetError(401, "CAPABILITY_EXPIRED");
			const owner = await (
				deps.getCapabilityOwner ??
				((id) => getCapabilityOwner(id, capability.ownerId))
			)(capability.scrapeId);
			if (!owner?.active || owner.ownerId !== capability.ownerId)
				return assetError(401, "OWNERSHIP_DENIED");
			const allowed = await (deps.checkRateLimit ?? allowAssetRequest)(
				`${capability.ownerId}:${capability.scrapeId}`,
			);
			if (!allowed) return rateLimited(deps);
			if (capability.imageId) {
				const stored = await (
					deps.readStoredScrapeImage ?? readStoredScrapeImage
				)(capability.ownerId, capability.scrapeId, capability.imageId);
				if (!stored) return assetError(404, "STORED_BYTES_MISSING");
				if (stored.byteLength !== stored.body.length || !stored.body.length)
					return assetError(502, "STORED_BYTES_INVALID");
				const verified = validateStoredImage(stored.body, stored.mimeType);
				const storedHeaders = responseHeaders(verified.mimeType);
				storedHeaders.set("Content-Length", String(verified.byteLength));
				return new Response(new Uint8Array(stored.body), {
					headers: storedHeaders,
				});
			}
			const range = parseByteRange(headers.get("range"));
			if (range === false) return assetError(416, "INVALID_RANGE");
			return await shapeAssetResponse(capability.target, deps, {
				range: range ?? undefined,
				capability,
				appOrigin: url.origin,
			});
		}
		if (!targetValue) return assetError(400, "INVALID_REQUEST");
		const target = parseAndValidateFormat(targetValue).href;
		const user = await (
			deps.requireUser ?? ((requestHeaders) => requireUser(requestHeaders))
		)(headers);
		const ip =
			ctx.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
			"local";
		if (!(await (deps.checkRateLimit ?? allowAssetRequest)(ip)))
			return rateLimited(deps);
		void user;
		return await shapeAssetResponse(target, deps);
	} catch (error) {
		if (error instanceof ImageStorageError)
			return assetError(
				error.assetCode === "IMAGE_TOO_LARGE" ? 413 : 415,
				error.assetCode === "IMAGE_TOO_LARGE"
					? "ASSET_TOO_LARGE"
					: "UNSUPPORTED_MIME",
			);
		if (error instanceof Error && /Unauthorized|Forbidden/.test(error.message))
			return assetError(401, "AUTHENTICATION_REQUIRED");
		if (error instanceof ScrapeError) {
			if (error.code === "INVALID_URL" || error.code === "PRIVATE_URL_BLOCKED")
				return assetError(400, "URL_BLOCKED");
			if (error.code === "FETCH_TIMEOUT" || error.code === "JOB_TIMEOUT")
				return assetError(504, "REMOTE_TIMEOUT");
			if (error.code === "WEBSITE_BLOCKED")
				return assetError(502, "REMOTE_REDIRECT_BLOCKED");
			if (error.code === "NO_ANALYZABLE_CONTENT")
				return assetError(413, "ASSET_TOO_LARGE");
		}
		return assetError(502, token ? "ASSET_READ_FAILED" : "REMOTE_FETCH_FAILED");
	}
}

export function OPTIONS(): Response {
	const headers = responseHeaders();
	headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
	headers.set("Access-Control-Allow-Headers", "Range");
	return new Response(null, { status: 204, headers });
}
