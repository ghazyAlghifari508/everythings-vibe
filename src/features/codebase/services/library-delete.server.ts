// Batch deletion domain for saved repositories.
//
// Server-import exception: top-level `@/db` and `.server` imports are correct
// here — server handlers only, no client component. Never import this module
// from client code.
import { db } from "@/db";
import {
	CODEBASE_LIBRARY_BULK_DELETE_LIMIT_ERROR,
	CODEBASE_LIBRARY_BULK_DELETE_MAX_IDS,
} from "../types/codebase-constants";
import { type CodebaseBulkDeleteResult, dedupeCodebaseIds } from "./library";
import { deleteOwnedCodebase } from "./library-item-route.server";

/**
 * Delete a batch of the caller's repositories in one transaction.
 *
 * Reuses `deleteOwnedCodebase` so the cascade semantics (purging project
 * artifacts, tombstoning projects, clearing FKs, cascading sessions/snapshots)
 * match the single-delete endpoint exactly. Ids that belong to another tenant
 * or no longer exist are skipped rather than causing a failure.
 */
export async function deleteOwnedCodebases(
	ids: readonly string[],
	userId: string,
): Promise<CodebaseBulkDeleteResult> {
	const unique = dedupeCodebaseIds(ids);
	if (unique.length === 0) return { deleted: 0, skipped: 0, deletedIds: [] };
	if (unique.length > CODEBASE_LIBRARY_BULK_DELETE_MAX_IDS) {
		throw new Error(CODEBASE_LIBRARY_BULK_DELETE_LIMIT_ERROR);
	}
	return db.transaction(async (tx) => {
		const deletedIds: string[] = [];
		for (const codebaseId of unique) {
			const outcome = await deleteOwnedCodebase(tx, {
				codebaseId,
				userId,
				confirm: true,
			});
			if (outcome.kind === "deleted") deletedIds.push(codebaseId);
		}
		return {
			deleted: deletedIds.length,
			skipped: unique.length - deletedIds.length,
			deletedIds,
		};
	});
}
