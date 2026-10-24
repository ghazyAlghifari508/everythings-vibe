// `/api/scrape/asset` handler: capability-scoped proxy for scraped page assets.
//
// Two access paths: a signed preview capability (scrape owner, rate limited per
// owner+scrape) and a raw `url=` proxy (authenticated, rate limited per IP).
// Everything served is re-typed from the remote response, never passed through
// blindly — HTML/XML stripped, unknown octet-stream sniffed by signature — and
// CSS/JS is rewritten to route its own sub-resources back through this proxy.
import {
	ImageStorageError,
	readStoredScrapeImage,
	validateStoredImage,
} from "@/features/scrape/services/scrape-image-storage";
import { verifyPreviewAssetCapability } from "@/features/scrape/utils/preview-capabilities";
import { parseAndValidateFormat } from "@/features/scrape/utils/url-validator";
import { ScrapeError } from "@/lib/design-errors";
import { requireUser } from "@/lib/session";
import {
	allowAssetRequest,
	getCapabilityOwner,
	rateLimited,
} from "./scrape-asset-access";
import {
	type AssetResult,
	assetError,
	type ByteRange,
	parseByteRange,
	responseHeaders,
	shapeAssetResponse,
} from "./scrape-asset-response";

export type { AssetResult, ByteRange };
export { allowAssetRequest, shapeAssetResponse };

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
