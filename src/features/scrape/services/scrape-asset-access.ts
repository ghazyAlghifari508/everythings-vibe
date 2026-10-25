import { and, eq, isNull, sql } from "drizzle-orm";
import { rateLimits, scrapes, users } from "@/db/schema";
import {
	SCRAPE_ASSET_RATE_LIMIT,
	SCRAPE_ASSET_RATE_WINDOW_S,
} from "@/features/scrape/types/scrape-constants";
import { assetError } from "./scrape-asset-response";

export function assetWindowStart(now: Date): Date {
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

export async function getCapabilityOwner(
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

export function rateLimited(deps: { now?: () => number }): Response {
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
