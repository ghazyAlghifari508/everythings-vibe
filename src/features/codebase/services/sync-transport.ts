import {
	CODEBASE_MAX_FILE_BYTES,
	CODEBASE_MAX_SNAPSHOT_BYTES,
} from "@/lib/constants";
import type { ManifestEntry } from "../types/sync-schemas";

// === Idempotency key binding (Task 5) ===
// Keys mirror the CLI `makeIdempotencyKey` format
// (`${attemptId}:${kind}:${index}`) and carry no credentials. A retry reuses
// the same key for the same slot, so replay returns the stored response
// without duplicating records. Key reuse across slots is rejected fail-closed.

export type SyncIdempotencyKind = "manifest" | "file" | "complete" | "failure";

export function buildIdempotencyKey(
	attemptId: string,
	kind: SyncIdempotencyKind,
	index: number,
): string {
	return `${attemptId}:${kind}:${index}`;
}

export function isExpectedIdempotencyKey(
	key: unknown,
	attemptId: string,
	kind: SyncIdempotencyKind,
	index: number,
): boolean {
	return (
		typeof key === "string" &&
		key.length > 0 &&
		key === buildIdempotencyKey(attemptId, kind, index)
	);
}

// Slot-shape binding for file chunks. The CLI numbers file keys by its own
// flat chunk sequence (`makeIdempotencyKey(attemptId, "file", i)` over the
// whole chunk list), which the server cannot reconstruct — so the files
// endpoint binds the `${attemptId}:file:<n>` shape: exact replay still hits
// the stored key byte-for-byte, while cross-attempt and cross-kind key reuse
// is rejected fail-closed.
export function isSlotIdempotencyKey(
	key: unknown,
	attemptId: string,
	kind: SyncIdempotencyKind,
): boolean {
	if (typeof key !== "string" || !attemptId) return false;
	const prefix = `${attemptId}:${kind}:`;
	if (!key.startsWith(prefix)) return false;
	return /^\d+$/.test(key.slice(prefix.length));
}

// === Idempotent replay identity (Task 9 hardening) ===
// On an idempotency-key hit the route returns the stored response WITHOUT
// re-applying the payload. These pure checks verify the replayed payload's
// identity agrees with stored state first; a divergent retry fails closed
// (409 SNAPSHOT_CONFLICT) instead of silently returning success. The CLI
// always resends byte-identical payloads on retry, so true retries pass.

function sameManifestIdentity(
	stored: ManifestEntry,
	replayed: ManifestEntry,
): boolean {
	return (
		stored.size === replayed.size &&
		stored.hash.toLowerCase() === replayed.hash.toLowerCase() &&
		(stored.language ?? undefined) === (replayed.language ?? undefined)
	);
}

/** Containment identity: the stored manifest accumulates every merged batch,
 *  so a legitimate retry of one earlier batch always sees a superset (the CLI
 *  retries the WHOLE batch loop with the same keys after any transient
 *  failure). Every replayed entry must exist in stored with the same
 *  identity; a forged/unknown path, divergent entry, or a batch larger than
 *  the stored manifest fails closed. */
export function isManifestReplayCompatible(
	stored: readonly ManifestEntry[],
	replayed: readonly ManifestEntry[],
): boolean {
	if (replayed.length === 0) return stored.length === 0;
	if (replayed.length > stored.length) return false;
	const byPath = new Map(stored.map((entry) => [entry.path, entry]));
	for (const entry of replayed) {
		const previous = byPath.get(entry.path);
		if (!previous || !sameManifestIdentity(previous, entry)) return false;
	}
	return true;
}

export interface StoredFileChunkLike {
	path: string;
	chunkIndex: number;
	chunkTotal: number;
	contentHash: string;
	data: string;
}

export interface ReplayedFileChunkLike {
	path: string;
	chunkIndex: number;
	chunkTotal: number;
	contentHash: string;
	data: string;
}

/** The replayed chunk must match the stored (path, chunkIndex) row
 *  byte-for-byte. A missing row means stored state desynced from the
 *  idempotency record — fail closed rather than report success. */
export function isFileReplayCompatible(
	storedRows: readonly StoredFileChunkLike[],
	replayed: ReplayedFileChunkLike,
): boolean {
	const row = storedRows.find(
		(candidate) =>
			candidate.path === replayed.path &&
			candidate.chunkIndex === replayed.chunkIndex,
	);
	if (!row) return false;
	return (
		row.chunkTotal === replayed.chunkTotal &&
		row.contentHash.toLowerCase() === replayed.contentHash.toLowerCase() &&
		row.data === replayed.data
	);
}

/** Completion replay must carry the same counts that produced the stored
 *  result; divergent counts mean the client is completing a different
 *  snapshot view. */
export function isCompleteReplayCompatible(
	stored: { fileCount: number; excludedCount: number },
	replayed: { fileCount: number; excludedCount: number },
): boolean {
	return (
		stored.fileCount === replayed.fileCount &&
		stored.excludedCount === replayed.excludedCount
	);
}
// One session is one attempt: attemptId MUST equal the bound session id.
// Anything else is a foreign/wrong-project credential use — rejected with the
// uniform credential error (no oracle, no id echo).

// === Attempt binding (Task 5) ===
export class SyncBindingError extends Error {
	readonly code = "INVALID_SYNC_CREDENTIAL" as const;

	constructor() {
		super("Invalid sync credential");
		this.name = "SyncBindingError";
	}
}

export function assertAttemptBinding(
	sessionId: string,
	attemptId: string,
): void {
	if (!sessionId || !attemptId || sessionId !== attemptId) {
		throw new SyncBindingError();
	}
}

// === Snapshot completion verification (Task 5; pure, DB-agnostic) ===
// Runs on stored manifest + chunk bookkeeping BEFORE any status transition.
// Only a fully verified snapshot may become `uploaded`; partial/failed
// snapshots stay unusable (analysis and generation context select `ready`
// snapshots only, which are produced downstream from `uploaded`).

export type SnapshotCompletionCode =
	| "SNAPSHOT_INCOMPLETE"
	| "SNAPSHOT_CONFLICT"
	| "SNAPSHOT_TOO_LARGE";

export class SnapshotCompletionError extends Error {
	readonly code: SnapshotCompletionCode;

	constructor(code: SnapshotCompletionCode, message: string) {
		super(message);
		this.name = "SnapshotCompletionError";
		this.code = code;
	}
}

export interface CompletionManifestEntry {
	path: string;
	size: number;
	hash: string;
}

export interface CompletionChunkInfo {
	path: string;
	chunkIndex: number;
	chunkTotal: number;
	dataBase64Length: number;
	decodedBytes: number;
}

export interface CompletionCheckResult {
	files: Array<{ path: string; chunkTotal: number; totalBytes: number }>;
	contentSize: number;
}

export function checkSnapshotCompletion(input: {
	manifest: readonly CompletionManifestEntry[];
	chunks: readonly CompletionChunkInfo[];
	fileCount: number;
	excludedCount: number;
}): CompletionCheckResult {
	const { manifest, chunks, fileCount } = input;
	// Locked definition: fileCount MUST equal the eligible manifest entries.
	if (fileCount !== manifest.length) {
		throw new SnapshotCompletionError(
			"SNAPSHOT_INCOMPLETE",
			`fileCount ${fileCount} does not match ${manifest.length} manifest entries`,
		);
	}

	const manifestByPath = new Map<string, CompletionManifestEntry>();
	for (const entry of manifest) {
		if (manifestByPath.has(entry.path)) {
			throw new SnapshotCompletionError(
				"SNAPSHOT_CONFLICT",
				"Manifest contains duplicate paths",
			);
		}
		manifestByPath.set(entry.path, entry);
	}
	const chunksByPath = new Map<string, CompletionChunkInfo[]>();
	for (const chunk of chunks) {
		const group = chunksByPath.get(chunk.path) ?? [];
		group.push(chunk);
		chunksByPath.set(chunk.path, group);
	}

	// Orphan chunks (paths absent from the manifest) indicate a desynced
	// client — fail closed rather than silently dropping or adopting them.
	for (const path of chunksByPath.keys()) {
		if (!manifestByPath.has(path)) {
			throw new SnapshotCompletionError(
				"SNAPSHOT_CONFLICT",
				"Uploaded chunks reference a path absent from the manifest",
			);
		}
	}

	const files: CompletionCheckResult["files"] = [];
	let contentSize = 0;
	for (const entry of manifest) {
		if (entry.size > CODEBASE_MAX_FILE_BYTES) {
			throw new SnapshotCompletionError(
				"SNAPSHOT_TOO_LARGE",
				"Manifest entry exceeds the per-file limit",
			);
		}
		const group = chunksByPath.get(entry.path) ?? [];
		const totals = new Set(group.map((chunk) => chunk.chunkTotal));
		if (
			group.length === 0 ||
			totals.size !== 1 ||
			group.length !== (group[0]?.chunkTotal ?? 0)
		) {
			throw new SnapshotCompletionError(
				group.length > 0 && totals.size !== 1
					? "SNAPSHOT_CONFLICT"
					: "SNAPSHOT_INCOMPLETE",
				"Missing or inconsistent chunks for a manifest entry",
			);
		}
		const indexes = new Set(group.map((chunk) => chunk.chunkIndex));
		const total = group[0]?.chunkTotal ?? 0;
		for (let index = 0; index < total; index += 1) {
			if (!indexes.has(index)) {
				throw new SnapshotCompletionError(
					"SNAPSHOT_INCOMPLETE",
					"Missing or inconsistent chunks for a manifest entry",
				);
			}
		}
		const totalBytes = group.reduce(
			(sum, chunk) => sum + chunk.decodedBytes,
			0,
		);
		if (totalBytes > CODEBASE_MAX_FILE_BYTES) {
			throw new SnapshotCompletionError(
				"SNAPSHOT_TOO_LARGE",
				"Uploaded file exceeds the per-file limit",
			);
		}
		if (totalBytes !== entry.size) {
			throw new SnapshotCompletionError(
				"SNAPSHOT_CONFLICT",
				`Uploaded content size (${totalBytes}) does not match manifest entry size (${entry.size})`,
			);
		}
		files.push({ path: entry.path, chunkTotal: total, totalBytes });
		contentSize += totalBytes;
		if (contentSize > CODEBASE_MAX_SNAPSHOT_BYTES) {
			throw new SnapshotCompletionError(
				"SNAPSHOT_TOO_LARGE",
				"Snapshot exceeds the maximum snapshot size",
			);
		}
	}
	return { files, contentSize };
}
