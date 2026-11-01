// Determinate upload progress for the live sync progress view.
//
// Both numbers are read from rows the CLI transport already wrote: the merged
// manifest (announced total) and the chunk table (files whose every chunk has
// landed). Nothing here estimates, interpolates, or timestamps progress — if the
// manifest is empty or no file is complete yet the counters are simply absent and
// the UI falls back to "Mengunggah repository...".
//
// Server-only module: it imports the database client.
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { codebaseSnapshotFiles, codebaseSnapshots } from "@/db/schema";

export interface UploadProgress {
	manifestCount: number;
	uploadedCount: number;
}

/**
 * Progress for the snapshot bound to one session, or null when there is no
 * snapshot to measure. Only called while the session status is `uploading`, so
 * the group-by never runs on a finished or idle attempt.
 */
export async function readUploadProgress(
	sessionId: string,
): Promise<UploadProgress | null> {
	const [snapshot] = await db
		.select({ id: codebaseSnapshots.id, manifest: codebaseSnapshots.manifest })
		.from(codebaseSnapshots)
		.where(eq(codebaseSnapshots.syncSessionId, sessionId))
		.orderBy(desc(codebaseSnapshots.createdAt))
		.limit(1);
	if (!snapshot) return null;

	const manifestCount = Array.isArray(snapshot.manifest)
		? snapshot.manifest.length
		: 0;

	// A file counts as received only when all of its chunks are present; a
	// half-uploaded file must never inflate the counter.
	const complete = await db
		.select({ path: codebaseSnapshotFiles.path })
		.from(codebaseSnapshotFiles)
		.where(eq(codebaseSnapshotFiles.snapshotId, snapshot.id))
		.groupBy(codebaseSnapshotFiles.path)
		.having(sql`count(*) = max(${codebaseSnapshotFiles.chunkTotal})`);

	return { manifestCount, uploadedCount: complete.length };
}
