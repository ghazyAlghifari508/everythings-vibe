import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { codebaseSnapshotFiles } from "@/db/schema";
import { CODEBASE_GENERATION_MAX_CONTEXT_CHARS } from "../types/codebase-constants";
import { manifestEntrySchema } from "../types/sync-schemas";
import { revisionReferencesFit } from "./revision-references";
import {
	assembleSnapshotFileChunks,
	isDisplayableTextContent,
} from "./snapshot-preview";
import { verifyFileContentHash } from "./sync.server";

export type RevisionReferenceContents =
	| { ok: true; contents: Array<{ path: string; content: string }> }
	| { ok: false; code: "REFERENCE_UNAVAILABLE" };

/**
 * Read the files a revision asked to reference, from the snapshot the plan was
 * verified against. Every reference must exist in the manifest, reassemble into
 * complete chunks, hash to the manifest hash, decode as UTF-8 text, and stay
 * inside the shared context budget. Anything less fails closed: a revision must
 * never be grounded on content we cannot prove belongs to this snapshot.
 */
export async function readRevisionReferences(input: {
	snapshotId: string;
	paths: readonly string[];
	manifest: unknown;
}): Promise<RevisionReferenceContents> {
	const parsedManifest = manifestEntrySchema.array().safeParse(input.manifest);
	if (!parsedManifest.success)
		return { ok: false, code: "REFERENCE_UNAVAILABLE" };
	const entries = parsedManifest.data;
	if (input.paths.some((path) => !entries.some((entry) => entry.path === path)))
		return { ok: false, code: "REFERENCE_UNAVAILABLE" };
	// Checked against the manifest before any chunk is loaded, so an oversized
	// request is refused instead of read and then discarded.
	if (!revisionReferencesFit(input.paths, entries))
		return { ok: false, code: "REFERENCE_UNAVAILABLE" };
	if (!input.paths.length) return { ok: true, contents: [] };

	const chunks = await db
		.select({
			path: codebaseSnapshotFiles.path,
			chunkIndex: codebaseSnapshotFiles.chunkIndex,
			chunkTotal: codebaseSnapshotFiles.chunkTotal,
			data: codebaseSnapshotFiles.data,
		})
		.from(codebaseSnapshotFiles)
		.where(
			and(
				eq(codebaseSnapshotFiles.snapshotId, input.snapshotId),
				inArray(codebaseSnapshotFiles.path, [...input.paths]),
			),
		);

	const contents: Array<{ path: string; content: string }> = [];
	let totalBytes = 0;
	for (const path of input.paths) {
		const entry = entries.find((item) => item.path === path);
		const assembled = assembleSnapshotFileChunks(
			chunks.filter((chunk) => chunk.path === path),
		);
		if (!entry || !assembled || !verifyFileContentHash(assembled, entry.hash))
			return { ok: false, code: "REFERENCE_UNAVAILABLE" };
		const bytes = Buffer.from(assembled, "base64");
		totalBytes += bytes.length;
		const content = bytes.toString("utf8");
		if (
			bytes.length !== entry.size ||
			totalBytes > CODEBASE_GENERATION_MAX_CONTEXT_CHARS ||
			!Buffer.from(content, "utf8").equals(bytes) ||
			!isDisplayableTextContent(content)
		)
			return { ok: false, code: "REFERENCE_UNAVAILABLE" };
		contents.push({ path, content });
	}
	return { ok: true, contents };
}
