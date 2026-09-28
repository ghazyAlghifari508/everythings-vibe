import { createFileRoute } from "@tanstack/react-router";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";
import {
	SCRAPE_ASSET_RATE_LIMIT,
	SCRAPE_ASSET_RATE_WINDOW_S,
} from "@/lib/constants";
import { ScrapeError } from "@/lib/design-errors";
import { fetchAsset } from "@/lib/fetch-html";
import { rewriteCssUrls } from "@/lib/preview-html";
import { requireUser } from "@/lib/session";

export const Route = createFileRoute("/api/scrape/asset")({
	server: {
		handlers: { GET },
	},
});

const ASSET_HEADERS: Record<string, string> = {
	"Cache-Control": "public, max-age=3600",
	"X-Content-Type-Options": "nosniff",
	"Content-Security-Policy": "sandbox; default-src 'none'",
	"Access-Control-Allow-Origin": "*",
};

export type AssetRouteDeps = {
	checkRateLimit?: typeof allowAssetRequest;
	fetchAsset?: typeof fetchAsset;
};

function assetWindowStart(now: Date): Date {
	const windowMs = SCRAPE_ASSET_RATE_WINDOW_S * 1000;
	return new Date(
		Math.floor(now.getTime() / windowMs) * windowMs,
	);
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

export async function shapeAssetResponse(
	target: string,
	deps: AssetRouteDeps = {},
): Promise<Response> {
	const checkRateLimit = deps.checkRateLimit ?? allowAssetRequest;
	const loadAsset = deps.fetchAsset ?? fetchAsset;
	const { body, status, contentType } = await loadAsset(target);
	const isCss = /text\/css/i.test(contentType);
	const payload =
		status >= 400
			? ""
			: isCss
				? rewriteCssUrls(body.toString("utf8"), target)
				: new Uint8Array(body);
	return new Response(payload, {
		status: status >= 400 ? status : 200,
		headers: { ...ASSET_HEADERS, "Content-Type": contentType },
	});
}

export async function GET(
	ctx: { request: Request },
	deps: AssetRouteDeps = {},
): Promise<Response> {
	const target = new URL(ctx.request.url).searchParams.get("url");
	if (!target)
		return new Response("Missing url", { status: 400, headers: ASSET_HEADERS });

	try {
		const headers = getRequestHeaders();
		await requireUser(headers);
		const ip =
			ctx.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
			"local";
		const allowed = await (deps.checkRateLimit ?? allowAssetRequest)(ip);
		if (!allowed)
			return new Response("Rate limited", {
				status: 429,
				headers: ASSET_HEADERS,
			});
		return await shapeAssetResponse(target, deps);
	} catch (error) {
		if (error instanceof Error && /Unauthorized|Forbidden/.test(error.message))
			return new Response("Unauthorized", {
				status: 401,
				headers: ASSET_HEADERS,
			});
		const status =
			error instanceof ScrapeError &&
			(error.code === "INVALID_URL" || error.code === "PRIVATE_URL_BLOCKED")
				? 400
				: 502;
		return new Response("", { status, headers: ASSET_HEADERS });
	}
}
