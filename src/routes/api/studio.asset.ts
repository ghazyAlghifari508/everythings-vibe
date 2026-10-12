import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { studioAssets } from "@/db/schema";
import { getSessionFromHeaders } from "@/lib/session";
import { verifyStudioAssetCapability } from "@/lib/studio-asset-capability";

export const Route = createFileRoute("/api/studio/asset")({
	server: { handlers: { GET, OPTIONS } },
});

const ASSET_HEADERS: Record<string, string> = {
	"Cache-Control": "private, max-age=86400",
	"X-Content-Type-Options": "nosniff",
	"Content-Security-Policy": "default-src 'none'",
	"Access-Control-Allow-Origin": "*",
};

export interface StudioAssetRouteDeps {
	secret?: string;
	dbSelectAsset?: (
		id: string,
		userId: string,
	) => Promise<{
		id: string;
		mimeType: string;
		byteLength: number;
		data: string;
	} | null>;
	getUserFromSession?: (
		headers: Headers,
	) => Promise<{ user?: { id: string } } | null>;
}

export async function GET(
	ctx: { request: Request },
	deps: StudioAssetRouteDeps = {},
): Promise<Response> {
	const url = new URL(ctx.request.url);
	const id = url.searchParams.get("id");
	const cap = url.searchParams.get("cap");

	if (!id) {
		return new Response(JSON.stringify({ error: "Missing asset id" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	let targetOwnerId: string | null = null;

	if (cap) {
		const claims = verifyStudioAssetCapability(cap, deps.secret);
		if (!claims || claims.assetId !== id) {
			return new Response(JSON.stringify({ error: "Invalid capability" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			});
		}
		targetOwnerId = claims.ownerId;
	} else {
		const session = deps.getUserFromSession
			? await deps.getUserFromSession(ctx.request.headers)
			: await getSessionFromHeaders(ctx.request.headers);
		if (!session?.user?.id) {
			return new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			});
		}
		targetOwnerId = session.user.id;
	}

	const asset = deps.dbSelectAsset
		? await deps.dbSelectAsset(id, targetOwnerId)
		: ((
				await db
					.select({
						id: studioAssets.id,
						mimeType: studioAssets.mimeType,
						byteLength: studioAssets.byteLength,
						data: studioAssets.data,
					})
					.from(studioAssets)
					.where(
						and(
							eq(studioAssets.id, id),
							eq(studioAssets.userId, targetOwnerId),
						),
					)
					.limit(1)
			)[0] ?? null);

	if (!asset) {
		return new Response(JSON.stringify({ error: "Asset not found" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		});
	}

	const buf = Buffer.from(asset.data, "base64");
	const headers = new Headers(ASSET_HEADERS);
	headers.set("Content-Type", asset.mimeType);
	headers.set("Content-Length", String(buf.byteLength));

	return new Response(new Uint8Array(buf), {
		status: 200,
		headers,
	});
}

export function OPTIONS(): Response {
	const headers = new Headers(ASSET_HEADERS);
	headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
	return new Response(null, { status: 204, headers });
}
