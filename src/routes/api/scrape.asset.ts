import { createFileRoute } from "@tanstack/react-router";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { rateLimits, scrapes, users } from "@/db/schema";
import {
	SCRAPE_ASSET_RATE_LIMIT,
	SCRAPE_ASSET_RATE_WINDOW_S,
	SCRAPE_MAX_ASSET_BYTES,
} from "@/lib/constants";
import { ScrapeError } from "@/lib/design-errors";
import { fetchAsset } from "@/lib/fetch-html";
import {
	rewritePreviewCss,
	rewritePreviewModule,
	verifyPreviewAssetCapability,
} from "@/lib/preview-capabilities";
import { requireUser } from "@/lib/session";
import { parseAndValidateFormat } from "@/lib/url-validator";

export const Route = createFileRoute("/api/scrape/asset")({
	server: { handlers: { GET, OPTIONS } },
});

const ASSET_HEADERS: Record<string, string> = {
	"Cache-Control": "private, no-store",
	"X-Content-Type-Options": "nosniff",
	"Content-Security-Policy": "sandbox; default-src 'none'",
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Expose-Headers":
		"Accept-Ranges, Content-Range, Content-Length",
};

interface AssetResult {
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
	} catch {
		return false;
	}
}

async function getCapabilityOwner(
	scrapeId: string,
	ownerId: string,
): Promise<{ ownerId: string; active: boolean } | null> {
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
	});
	const headers = responseHeaders();
	if (loaded.status === 416) {
		headers.set("Accept-Ranges", loaded.acceptRanges ?? "bytes");
		if (loaded.contentRange && /^bytes \*\/\d+$/.test(loaded.contentRange))
			headers.set("Content-Range", loaded.contentRange);
		return new Response(null, { status: 416, headers });
	}
	if (loaded.status >= 400)
		return new Response(null, { status: loaded.status, headers });
	const mime = safeMime(loaded.contentType, loaded.body, loaded.finalUrl);
	if (!mime) return new Response(null, { status: 415, headers });
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
			return new Response(null, { status: 415, headers });
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
		return new Response(null, { status: 400, headers: responseHeaders() });
	const token = caps[0];
	const targetValue = urls[0];
	const headers = ctx.request.headers;
	try {
		if (token !== undefined) {
			const capability = verifyPreviewAssetCapability(token, deps.secret);
			if (!capability)
				return new Response(null, { status: 401, headers: responseHeaders() });
			const owner = await (
				deps.getCapabilityOwner ??
				((id) => getCapabilityOwner(id, capability.ownerId))
			)(capability.scrapeId);
			if (!owner?.active || owner.ownerId !== capability.ownerId)
				return new Response(null, { status: 401, headers: responseHeaders() });
			const allowed = await (deps.checkRateLimit ?? allowAssetRequest)(
				`${capability.ownerId}:${capability.scrapeId}`,
			);
			if (!allowed)
				return new Response(null, { status: 429, headers: responseHeaders() });
			const range = parseByteRange(headers.get("range"));
			if (range === false)
				return new Response(null, { status: 416, headers: responseHeaders() });
			return await shapeAssetResponse(capability.target, deps, {
				range: range ?? undefined,
				capability,
				appOrigin: url.origin,
			});
		}
		if (!targetValue)
			return new Response(null, { status: 400, headers: responseHeaders() });
		const target = parseAndValidateFormat(targetValue).href;
		const user = await (
			deps.requireUser ?? ((requestHeaders) => requireUser(requestHeaders))
		)(headers);
		const ip =
			ctx.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
			"local";
		if (!(await (deps.checkRateLimit ?? allowAssetRequest)(ip)))
			return new Response(null, { status: 429, headers: responseHeaders() });
		void user;
		return await shapeAssetResponse(target, deps);
	} catch (error) {
		if (error instanceof Error && /Unauthorized|Forbidden/.test(error.message))
			return new Response(null, { status: 401, headers: responseHeaders() });
		const status =
			error instanceof ScrapeError &&
			(error.code === "INVALID_URL" || error.code === "PRIVATE_URL_BLOCKED")
				? 400
				: 502;
		return new Response(null, { status, headers: responseHeaders() });
	}
}

export function OPTIONS(): Response {
	const headers = responseHeaders();
	headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
	headers.set("Access-Control-Allow-Headers", "Range");
	return new Response(null, { status: 204, headers });
}
