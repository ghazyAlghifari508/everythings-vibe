import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { scrapes } from "@/db/schema";
import { SCRAPE_HISTORY_BULK_DELETE_MAX_IDS } from "@/features/scrape/types/scrape-constants";
import type {
	ScrapeHistoryBulkDeleteResult,
	ScrapeHistoryBulkSelection,
} from "@/features/scrape/types/scrape-contract";
import { ScrapeError } from "@/lib/design-errors";
import {
	listScrapeHistoryIds,
	type ScrapeHistoryQuery,
} from "./scrape-history-service";

export function dedupeScrapeIds(ids: readonly string[]): string[] {
	const unique = new Set<string>();
	for (const id of ids) {
		const trimmed = id.trim();
		if (trimmed) unique.add(trimmed);
	}
	return [...unique];
}

// One id deletes by equality so the ownership predicate keeps the exact shape
// of the original one-item delete; a batch deletes by membership so a single
// statement removes the whole set without one round trip per row. Both carry
// the owning user, so a client-supplied id can never reach another tenant.
function ownedScrapeFilter(ids: readonly string[], userId: string) {
	const idFilter =
		ids.length === 1 ? eq(scrapes.id, ids[0]) : inArray(scrapes.id, [...ids]);
	return and(idFilter, eq(scrapes.userId, userId), isNull(scrapes.deletedAt));
}

// Unbilled results retain cascade cleanup. Billed jobs keep their ledger FK.
export async function deleteOwnedScrapes(
	ids: readonly string[],
	userId: string,
): Promise<ScrapeHistoryBulkDeleteResult> {
	const unique = dedupeScrapeIds(ids);
	if (unique.length === 0) return { deleted: 0, skipped: 0, deletedIds: [] };
	if (unique.length > SCRAPE_HISTORY_BULK_DELETE_MAX_IDS)
		throw new ScrapeError(
			"STORAGE_FAILED",
			"Terlalu banyak hasil untuk dihapus sekaligus.",
		);
	const removed = await db.transaction(async (tx) => {
		const scope = ownedScrapeFilter(unique, userId);
		const rows = await tx
			.select()
			.from(scrapes)
			.where(scope)
			.orderBy(scrapes.id)
			.for("update");
		const { settleScrapeTrial } = await import("./scrape-trial-settlement");
		const { findScrapeCharge } = await import("./scrape-credit.server");
		const hardDelete: string[] = [];
		const tombstones: string[] = [];
		for (const row of rows) {
			await settleScrapeTrial(tx, row, "cancelled");
			if (await findScrapeCharge(tx, row)) tombstones.push(row.id);
			else hardDelete.push(row.id);
		}
		if (tombstones.length)
			await tx
				.update(scrapes)
				.set({ deletedAt: new Date(), jobToken: null, leaseExpiresAt: null })
				.where(and(scope, inArray(scrapes.id, tombstones)));
		if (hardDelete.length)
			return [
				...rows.filter((row) => tombstones.includes(row.id)),
				...(await tx
					.delete(scrapes)
					.where(ownedScrapeFilter(hardDelete, userId))
					.returning({ id: scrapes.id })),
			];
		return rows;
	});
	const deletedIds = removed.map((row) => row.id);
	return {
		deleted: deletedIds.length,
		skipped: unique.length - deletedIds.length,
		deletedIds,
	};
}

// The scope is prepared on the server from the validated filter and returned as
// an explicit id snapshot. The delete then carries those ids instead of the
// filter, so a scrape created after the snapshot can never join a confirmed
// deletion, and a filter change can never silently widen the deletion target.
export async function prepareScrapeHistoryBulkSelection(
	userId: string,
	query: ScrapeHistoryQuery = {},
): Promise<ScrapeHistoryBulkSelection> {
	const page = await listScrapeHistoryIds(userId, query);
	return {
		ids: page.ids,
		total: page.total,
		truncated: page.total > page.ids.length,
	};
}
