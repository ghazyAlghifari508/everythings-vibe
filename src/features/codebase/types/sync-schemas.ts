import { z } from "zod";
import {
	CODEBASE_CLI_MIN_VERSION,
	CODEBASE_MAX_CHUNK_BYTES,
	CODEBASE_MAX_FILE_BYTES,
} from "@/features/codebase/types/codebase-constants";
import { isSafeRelativePath } from "../services/sync-validation";

// === Project mode ===
// NOTE: `projects.mode` ("ai_auto" | "manual") is the generation mode and is
// unrelated. `projectMode` below distinguishes greenfield from
// existing-codebase projects; existing projects default to greenfield.

export const EXISTING_CODEBASE_PROJECT_MODES = [
	"greenfield",
	"existing_codebase",
] as const;

export type ExistingCodebaseProjectMode =
	(typeof EXISTING_CODEBASE_PROJECT_MODES)[number];

export const existingCodebaseProjectModeSchema = z.enum(
	EXISTING_CODEBASE_PROJECT_MODES,
);

// === Sync status state machine ===
// Linear chain: waiting_for_cli → connected → scanning → filtering →
// uploading → uploaded → analyzing → ready. Any active state may move to
// failed or expired (session expiry is time-based, not CLI-reported).
// Terminal states (ready, failed, expired) have no outgoing transitions; a
// sync retry creates a new session/attempt instead of mutating a terminal
// record. One documented exception: analyzing → uploaded. An analysis attempt
// is not an upload — when the model call fails, the snapshot underneath is
// still uploaded and valid, so the session returns to `uploaded` where a
// fresh analysis record (never an in-place update) may be requested. Sync
// transport failures still move to `failed` and require a new session.

export const CODEBASE_SYNC_STATUSES = [
	"waiting_for_cli",
	"connected",
	"scanning",
	"filtering",
	"uploading",
	"uploaded",
	"analyzing",
	"ready",
	"failed",
	"expired",
] as const;

export type CodebaseSyncStatus = (typeof CODEBASE_SYNC_STATUSES)[number];

export const codebaseSyncStatusSchema = z.enum(CODEBASE_SYNC_STATUSES);

export const CODEBASE_SYNC_TERMINAL_STATUSES: readonly CodebaseSyncStatus[] = [
	"ready",
	"failed",
	"expired",
] as const;

// === Persisted row vocabularies ===
// `codebase_snapshots.status` mirrors the sync flow from upload onward;
// `codebase_analyses.status` is a separate small lifecycle. Both are
// documented here so schema defaults never drift into unlisted literals.

export const CODEBASE_SNAPSHOT_STATUSES = [
	"uploading",
	"uploaded",
	"analyzing",
	"ready",
	"failed",
	"expired",
] as const;

export type CodebaseSnapshotStatus =
	(typeof CODEBASE_SNAPSHOT_STATUSES)[number];

export const CODEBASE_ANALYSIS_STATUSES = [
	"pending",
	"ready",
	"failed",
] as const;

export type CodebaseAnalysisStatus =
	(typeof CODEBASE_ANALYSIS_STATUSES)[number];

export const codebaseAnalysisStatusSchema = z.enum(CODEBASE_ANALYSIS_STATUSES);

// === Persisted lifecycle event log (vocabulary) ===
// Why this exists: the CLI can finish several real transitions between two
// browser polls. Polling alone then observes only the terminal state, so the
// UI can honestly say "all stages done" but cannot say WHEN each one happened
// or how long it took. Recording each real transition with its own timestamp
// on the session row turns "we missed it" into "here is what actually
// happened", without replaying a stage or inventing a delay.
//
// The log is append-only and bounded, stored beside the handshake/failure
// evidence in `codebase_sync_sessions.metadata` (jsonb) so no new table is
// needed. Every entry is written by the same route that performs the real
// transition; nothing else may append to it.
//
// Declared here (before the status DTO below) because the status response
// validates the log against this same vocabulary.

export const SYNC_LIFECYCLE_EVENT_KINDS = [
	"agent_connected",
	"upload_started",
	"snapshot_persisted",
	"failed",
] as const;

export type SyncLifecycleEventKind =
	(typeof SYNC_LIFECYCLE_EVENT_KINDS)[number];

/** Bound on retained events: a linear lifecycle produces a handful, and the
 *  jsonb column must never grow without limit. */
export const SYNC_LIFECYCLE_MAX_EVENTS = 24;

// === DTOs (Zod boundary validation) ===

export const manifestEntrySchema = z.object({
	path: z.string().refine(isSafeRelativePath, {
		message: "Manifest path must be a safe repository-relative path",
	}),
	size: z.number().int().nonnegative().max(CODEBASE_MAX_FILE_BYTES),
	hash: z.string().regex(/^[0-9a-f]{64}$/i, {
		message: "Manifest hash must be SHA-256 hex",
	}),
	language: z.string().min(1).optional(),
});

export type ManifestEntry = z.infer<typeof manifestEntrySchema>;

export const syncPromptPayloadSchema = z.object({
	projectId: z.string().min(1),
	apiBaseUrl: z.string().url(),
	// Raw credential transferred once to the local agent. Never persisted.
	syncToken: z.string().min(1),
	cliMinVersion: z.string().min(1).default(CODEBASE_CLI_MIN_VERSION),
	syncCommand: z.string().min(1),
	expiresAt: z.string().datetime(),
});

export type SyncPromptPayload = z.infer<typeof syncPromptPayloadSchema>;

export const syncStatusResponseSchema = z.object({
	projectId: z.string().min(1),
	sessionId: z.string().min(1),
	status: codebaseSyncStatusSchema,
	// Canonical persisted display name for the codebase. Polling surfaces it so
	// an open onboarding page can drop the creation placeholder once the CLI has
	// reported the real repository name, instead of keeping a stale name on
	// screen. Omitted only when a caller reads a status for a codebase whose
	// name it could not resolve.
	codebaseName: z.string().min(1).optional(),
	fileCount: z.number().int().nonnegative().optional(),
	excludedCount: z.number().int().nonnegative().optional(),
	errorCode: z.string().min(1).nullable().optional(),
	errorMessage: z.string().min(1).nullable().optional(),
	// Latest snapshot bound to the polled session, when one exists. Lets the
	// review page scope its analysis read to the current attempt so a
	// retry-sync never renders a stale review from a previous session.
	snapshotId: z.string().min(1).nullable().optional(),
	// Timestamp the CLI handshake transaction persisted for this session
	// (`codebase_sync_sessions.metadata.handshakeAt`). Present only when the
	// agent actually contacted the server, so it stays meaningful even for a
	// session that failed or expired afterwards. Drives `canOpenSummary`.
	cliConnectedAt: z.string().datetime().optional(),
	// Snapshot creation timestamp ("Waktu sync" in the review page).
	snapshotCreatedAt: z.string().datetime().optional(),
	analysisId: z.string().min(1).nullable().optional(),
	// The analysis whose content the workspace renders: the newest ready record
	// for the snapshot. It survives a newer failed or still-running attempt, and
	// stays present once the CLI session that produced the snapshot is gone.
	analysisStatus: codebaseAnalysisStatusSchema.optional(),
	// The newest stored attempt for that snapshot, which may be a failed or
	// pending retry. Reported separately so the failure stays visible without
	// discarding the ready analysis above.
	analysisAttemptId: z.string().min(1).nullable().optional(),
	analysisAttemptStatus: codebaseAnalysisStatusSchema.optional(),
	// When the newest attempt was created and last written. Real timestamps
	// only: the conclusion step derives elapsed time from them instead of from
	// a client-side guess, and omits the timer when they are absent.
	analysisAttemptCreatedAt: z.string().datetime().optional(),
	analysisAttemptUpdatedAt: z.string().datetime().optional(),
	// Ordered log of the real sync transitions this attempt performed, each
	// with the timestamp the server persisted at that moment. Lets a browser
	// that polls after a fast CLI finished report WHAT happened and WHEN,
	// instead of replaying a stage that already completed.
	lifecycle: z
		.array(
			z.object({
				kind: z.enum(SYNC_LIFECYCLE_EVENT_KINDS),
				at: z.string().datetime(),
				count: z.number().int().nonnegative().optional(),
			}),
		)
		.optional(),
	createdAt: z.string().datetime().optional(),
	updatedAt: z.string().datetime().optional(),
	expiresAt: z.string().datetime().optional(),
});

export type SyncStatusResponse = z.infer<typeof syncStatusResponseSchema>;

export const snapshotContextSchema = z.object({
	snapshotId: z.string().min(1),
	projectId: z.string().min(1),
	branch: z.string().min(1).nullable().optional(),
	commitSha: z.string().min(1).nullable().optional(),
	fileCount: z.number().int().nonnegative(),
	excludedCount: z.number().int().nonnegative().optional(),
	relevantPaths: z.array(z.string().min(1)).optional(),
	createdAt: z.string().datetime().optional(),
});

export type SnapshotContext = z.infer<typeof snapshotContextSchema>;

// === CLI handshake DTOs (Task 4) ===
// Mirrors `packages/cli/src/lib/sync-client.ts`: the CLI POSTs `{cliVersion}`
// with the sync token as Bearer auth and expects the bound session/attempt/
// snapshot identity plus the minimum CLI version (the CLI enforces the gate
// client-side via `CLI_UPDATE_REQUIRED`).
//
// `repositoryName` is optional and advisory: a CLI older than this contract
// omits it and keeps working. The field stays `unknown` on purpose — it is
// untrusted cosmetic metadata, so its full validation lives in
// `normalizeRepositoryName` and an unusable value is ignored rather than
// rejected. A malformed repository name must never fail an otherwise valid
// repository upload.

export const cliHandshakeRequestSchema = z.object({
	cliVersion: z.string().min(1).max(64),
	repositoryName: z.unknown().optional(),
	// Normalized Git remote identity. Untrusted cosmetic metadata like
	// `repositoryName`: validated by `normalizeRepositoryIdentity`, and an
	// unusable value is ignored rather than failing an otherwise valid upload.
	repositoryIdentity: z.unknown().optional(),
});

export type CliHandshakeRequest = z.infer<typeof cliHandshakeRequestSchema>;

export const cliHandshakeResponseSchema = z.object({
	sessionId: z.string().min(1),
	attemptId: z.string().min(1),
	snapshotId: z.string().min(1),
	status: codebaseSyncStatusSchema,
	cliMinVersion: z.string().min(1),
	expiresAt: z.string().datetime(),
	// Present only when the codebase already holds a different identity, so an
	// upload into the wrong repository is visible to the user instead of silent.
	repositoryIdentityMismatch: z.boolean().optional(),
});

export type CliHandshakeResponse = z.infer<typeof cliHandshakeResponseSchema>;

// === Upload transport DTOs (Task 5) ===
// These schemas mirror `packages/cli/src/lib/sync-client.ts` request shapes
// EXACTLY. The CLI POSTs manifest batches as
// `{ sessionId, attemptId, batchIndex, batchTotal, entries, idempotencyKey }`,
// file chunks as
// `{ sessionId, attemptId, path, chunkIndex, chunkTotal, encoding, data,
// contentHash, idempotencyKey }`, and completion as
// `{ sessionId, attemptId, fileCount, excludedCount, idempotencyKey }`.
// Unknown extra fields are stripped (never rejected) so a newer CLI that
// attaches advisory metadata keeps working against this server.

const idempotencyKeySchema = z.string().min(1).max(128);

const sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/i, {
	message: "Hash must be SHA-256 hex",
});

export const manifestBatchRequestSchema = z
	.object({
		sessionId: z.string().min(1),
		attemptId: z.string().min(1),
		batchIndex: z.number().int().nonnegative(),
		batchTotal: z.number().int().positive(),
		// Empty batches are legal: the CLI sends one empty batch when the
		// repository has zero eligible files.
		entries: z.array(manifestEntrySchema),
		idempotencyKey: idempotencyKeySchema,
	})
	.refine((body) => body.batchIndex < body.batchTotal, {
		message: "batchIndex must be within batchTotal",
	});

export type ManifestBatchRequest = z.infer<typeof manifestBatchRequestSchema>;

// Strict base64 shape (canonical alphabet, correct padding). Full byte-level
// verification happens server-side in `verifyFileContentHash`.
export function isStrictBase64(value: string): boolean {
	if (!value || value.length % 4 !== 0) return false;
	return /^[A-Za-z0-9+/]*={0,2}$/.test(value);
}

export const fileChunkRequestSchema = z
	.object({
		sessionId: z.string().min(1),
		attemptId: z.string().min(1),
		path: z.string().refine(isSafeRelativePath, {
			message: "Chunk path must be a safe repository-relative path",
		}),
		chunkIndex: z.number().int().nonnegative(),
		chunkTotal: z.number().int().positive(),
		encoding: z.literal("base64"),
		// Base64 text only (binaries are excluded client-side, never uploaded).
		// Char length is capped at the transport bound; decoded bytes are
		// strictly smaller, so this conservatively enforces the 256 KiB limit.
		data: z
			.string()
			.min(1)
			.max(CODEBASE_MAX_CHUNK_BYTES)
			.refine(isStrictBase64, { message: "Chunk data must be base64" }),
		contentHash: sha256HexSchema,
		idempotencyKey: idempotencyKeySchema,
	})
	.refine((body) => body.chunkIndex < body.chunkTotal, {
		message: "chunkIndex must be within chunkTotal",
	});

export type FileChunkRequest = z.infer<typeof fileChunkRequestSchema>;

export const snapshotCompleteRequestSchema = z.object({
	sessionId: z.string().min(1),
	attemptId: z.string().min(1),
	// Locked count definition: fileCount = eligible manifest entries,
	// excludedCount = ALL exclusions (built-in + secret + custom ignore +
	// unreadable + binary). The server verifies fileCount against the stored
	// manifest; excludedCount is CLI-reported and stored as-is.
	fileCount: z.number().int().nonnegative(),
	excludedCount: z.number().int().nonnegative(),
	idempotencyKey: idempotencyKeySchema,
});

export type SnapshotCompleteRequest = z.infer<
	typeof snapshotCompleteRequestSchema
>;

// === Local preparation failure report (CLI -> server) ===
// Sent when the CLI fails AFTER the handshake already persisted `connected`:
// root/ignore preparation, the repository walk, hashing, or the blocked-content
// refusal. The payload is deliberately the narrowest possible shape — attempt
// identity plus an idempotency key.
//
// `errorCode` is accepted and then ignored. Zod's default object behavior
// strips unknown keys, so the server derives the persisted code and message
// from the attempt itself. That is what guarantees no client-supplied string
// (a local absolute path, a blocked file path, source content) can reach
// `codebase_sync_sessions` or the browser. The key stays declared so a newer
// CLI may send it without being rejected by a strict schema.
export const syncFailureRequestSchema = z.object({
	sessionId: z.string().min(1),
	attemptId: z.string().min(1),
	idempotencyKey: idempotencyKeySchema,
	errorCode: z.string().min(1).optional(),
});

export type SyncFailureRequest = z.infer<typeof syncFailureRequestSchema>;
