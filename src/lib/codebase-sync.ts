import { z } from "zod";
import {
	CODEBASE_CLI_MIN_VERSION,
	CODEBASE_MAX_CHUNK_BYTES,
	CODEBASE_MAX_ERROR_MESSAGE_CHARS,
	CODEBASE_MAX_FILE_BYTES,
	CODEBASE_MAX_SNAPSHOT_BYTES,
} from "./constants";

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

type SyncTransitionMap = Record<
	CodebaseSyncStatus,
	readonly CodebaseSyncStatus[]
>;

const SYNC_TRANSITIONS: SyncTransitionMap = {
	waiting_for_cli: ["connected", "failed", "expired"],
	connected: ["scanning", "failed", "expired"],
	scanning: ["filtering", "failed", "expired"],
	filtering: ["uploading", "failed", "expired"],
	uploading: ["uploaded", "failed", "expired"],
	uploaded: ["analyzing", "failed", "expired"],
	// analyzing → uploaded is the analysis-retry rollback only (Task 6): the
	// snapshot stays `uploaded`, and the next attempt writes a fresh analysis
	// record. Terminal states below keep zero outgoing transitions.
	analyzing: ["uploaded", "ready", "failed", "expired"],
	ready: [],
	failed: [],
	expired: [],
};

export class SyncTransitionError extends Error {
	readonly code = "INVALID_SYNC_TRANSITION" as const;
	readonly from: CodebaseSyncStatus;
	readonly to: CodebaseSyncStatus;

	constructor(from: CodebaseSyncStatus, to: CodebaseSyncStatus) {
		super(`Invalid sync transition: ${from} -> ${to}`);
		this.name = "SyncTransitionError";
		this.from = from;
		this.to = to;
	}
}

export function isTerminalSyncStatus(status: CodebaseSyncStatus): boolean {
	return (CODEBASE_SYNC_TERMINAL_STATUSES as readonly string[]).includes(
		status,
	);
}

// === Active-attempt detection ===
// `waiting_for_cli` is the normal resting state of a session for its entire
// 30-minute life: the user is copying a prompt into a terminal, and no server
// state can change until they do. Every status past it is a state the CLI
// reached by doing real work, and the window between two of them can be short,
// so this is what tells the browser to reconcile quickly.
//
// The CLI handshakes before it prepares source code, so `connected` now spans
// the whole preparation window (see the CLI's sync command) — that window is
// exactly what this predicate makes observable.
const CODEBASE_SYNC_IN_FLIGHT_STATUSES: readonly CodebaseSyncStatus[] = [
	"connected",
	"scanning",
	"filtering",
	"uploading",
	"uploaded",
	"analyzing",
] as const;

export function isSyncStatusInFlight(status: CodebaseSyncStatus): boolean {
	return (CODEBASE_SYNC_IN_FLIGHT_STATUSES as readonly string[]).includes(
		status,
	);
}

// === Sync completion (transport-only capability) ===
// Sync is complete the moment a usable snapshot exists and the transport
// chain finished: `uploaded` (codebase-scoped sessions stay here while the
// model runs), `analyzing` (legacy project-scoped sessions), and `ready`.
// AI analysis status is deliberately NOT part of this predicate: an uploaded
// snapshot is a finished sync whether or not the model has run yet, and an
// analysis failure must never invalidate a usable snapshot. Session creation
// reuses the same set to decide which sessions no longer hold the transport
// open, so the two readings cannot drift.
export const CODEBASE_SYNC_COMPLETE_STATUSES: readonly CodebaseSyncStatus[] = [
	"uploaded",
	"analyzing",
	"ready",
] as const;

export function isSyncStatusComplete(
	status:
		| Pick<SyncStatusResponse, "status" | "snapshotId" | "analysisStatus">
		| null
		| undefined,
): boolean {
	if (!status || !status.snapshotId) return false;
	return (CODEBASE_SYNC_COMPLETE_STATUSES as readonly string[]).includes(
		status.status,
	);
}

export function canTransitionSyncStatus(
	from: CodebaseSyncStatus,
	to: CodebaseSyncStatus,
): boolean {
	return SYNC_TRANSITIONS[from].includes(to);
}

// === CLI handshake evidence ===
// "May the user leave the prompt screen?" is a question only the server can
// answer. A copy click is browser-local UI feedback: it proves nothing about
// whether the agent ran, so it can never gate navigation.
//
// The persisted facts that DO prove a handshake are:
// 1. the session left `waiting_for_cli` — the transition map makes
//    `waiting_for_cli -> connected` reachable ONLY through the CLI handshake
//    route (see `/api/v1/codebases/$id/codebase/sync`), and
// 2. `codebase_sync_sessions.metadata.handshakeAt`, written by that same route
//    inside its handshake transaction.
//
// (1) alone is ambiguous for `failed`/`expired`: both are reachable directly
// from `waiting_for_cli` without any CLI contact, so a terminal status must NOT
// imply a handshake. `metadata.cliVersion` is not proof either — a session can
// expire before the CLI ever runs. That is why the handshake persists its own
// timestamp rather than relying on a status or a version field.
//
// Fast CLI case: a browser whose first poll already observes `uploading` or
// `uploaded` still satisfies (1), so the gate stays correct without ever having
// polled the intermediate `connected` state.

export const CLI_HANDSHAKE_METADATA_KEY = "handshakeAt" as const;

// Reachable from `waiting_for_cli` with no CLI contact (see SYNC_TRANSITIONS),
// so neither one proves a handshake on its own.
const CODEBASE_SYNC_PRE_HANDSHAKE_STATUSES: readonly CodebaseSyncStatus[] = [
	"waiting_for_cli",
	"failed",
	"expired",
] as const;

export function readCliHandshakeAt(metadata: unknown): string | null {
	if (typeof metadata !== "object" || metadata === null) return null;
	const raw = (metadata as Record<string, unknown>)[CLI_HANDSHAKE_METADATA_KEY];
	const parsed = z.string().datetime().safeParse(raw);
	return parsed.success ? parsed.data : null;
}

/**
 * Metadata patch persisted by a successful CLI handshake. The first
 * handshakeAt wins so an idempotent retry cannot push the evidence forward and
 * make a stale session look freshly connected.
 */
export function buildHandshakeMetadata(input: {
	previous: unknown;
	cliVersion: string;
	repositoryName?: string;
	handshakeAt: Date;
}): Record<string, unknown> {
	const previous =
		typeof input.previous === "object" && input.previous !== null
			? (input.previous as Record<string, unknown>)
			: {};
	const existingHandshakeAt = readCliHandshakeAt(previous);
	return {
		...previous,
		cliVersion: input.cliVersion,
		...(input.repositoryName ? { repositoryName: input.repositoryName } : {}),
		[CLI_HANDSHAKE_METADATA_KEY]:
			existingHandshakeAt ?? input.handshakeAt.toISOString(),
	};
}

/**
 * "Has the server observed the CLI actually starting this sync attempt?"
 *
 * True when the session advanced past the pre-handshake states, or when the
 * handshake transaction persisted its timestamp. A terminal session that never
 * handshaked stays false; one that did stays true.
 */
export function hasCliHandshake(status: {
	status: CodebaseSyncStatus;
	cliConnectedAt?: string | null;
}): boolean {
	if (status.cliConnectedAt) return true;
	return !(CODEBASE_SYNC_PRE_HANDSHAKE_STATUSES as readonly string[]).includes(
		status.status,
	);
}

/**
 * Whether the conclusion step may be opened.
 *
 * Transport-only: an uploaded snapshot is a finished sync whether or not the
 * model has run, so "Kesimpulan Codebase" is reachable while analysis is still
 * pending — that step owns the pending state itself.
 *
 * This is also the ONLY thing that unlocks the instruction screen's continue
 * action. Copying the prompt is browser-local feedback and proves nothing about
 * whether the agent ran, so it has no influence here.
 */
export function canOpenSummary(
	status:
		| {
				status: CodebaseSyncStatus;
				snapshotId?: string | null;
				cliConnectedAt?: string | null;
		  }
		| null
		| undefined,
): boolean {
	// No status at all means the browser has not heard from the server, which is
	// never evidence that a snapshot exists.
	if (!status) return false;
	if (!status.snapshotId) return false;
	if (!hasCliHandshake(status)) return false;
	return (CODEBASE_SYNC_COMPLETE_STATUSES as readonly string[]).includes(
		status.status,
	);
}

// === User-facing sync stage mapping ===
// The two sync stages the user can actually observe are the CLI handshake and
// the source upload. AI analysis is a separate capability owned by the summary
// step, so it never becomes a third stage here.
//
// This is the ONE mapping from domain status to user-facing stage copy. It lives
// next to the status vocabulary rather than inside a component so the surfaces
// that render sync progress cannot drift apart: the onboarding step, the
// workspace re-sync step, and any future reader all describe the same server
// state with the same words.

/**
 * How far the real sync lifecycle has actually progressed, in product terms.
 *
 * - `waiting`  the agent has not contacted the server yet
 * - `preparing` the agent is linked and the CLI is preparing source code
 * - `syncing`   files are on the wire
 * - `done`      the server holds a verified snapshot
 *
 * Every one of these is a real step the server already records. Nothing here is
 * a stage invented to make the list look busier, and none of them is a
 * fabricated delay: a fast CLI can legitimately jump straight from `waiting` to
 * `done`, and the view then renders three completed rows with no replayed
 * intermediate.
 */
export type SyncStageProgress = "waiting" | "preparing" | "syncing" | "done";

/**
 * The backend lifecycle expressed as product stages.
 *
 * `connected`, `scanning` and `filtering` are all one user-visible moment — the
 * agent is connected and the CLI is preparing source code — so they share the
 * `preparing` stage instead of leaking three enum names into the UI. The CLI
 * persists no `scanning`/`filtering` state; `connected` is what genuinely spans
 * that local work, because the CLI now handshakes before it prepares. `scanning`
 * and `filtering` remain transition vocabulary, so they are mapped here for a
 * reader that holds one, never written as a durable state.
 */
const SYNC_STAGE_PROGRESS: Readonly<
	Record<CodebaseSyncStatus, SyncStageProgress>
> = {
	waiting_for_cli: "waiting",
	connected: "preparing",
	scanning: "preparing",
	filtering: "preparing",
	uploading: "syncing",
	uploaded: "done",
	analyzing: "done",
	ready: "done",
	failed: "waiting",
	expired: "waiting",
};

export type SyncStageState = "done" | "active" | "waiting" | "failed";

export interface SyncStageRow {
	state: SyncStageState;
	title: string;
	/**
	 * Present only when the row has something worth reading. An inactive stage
	 * gets no description: "this step has not started yet" is filler, and the
	 * user learns nothing from it.
	 */
	detail?: string;
	/** Optional short qualifier rendered beside the row (e.g. a live count). */
	meta?: string;
}

export interface SyncStageView {
	/** False until the browser has received any server state at all. */
	hasStatus: boolean;
	/** True when the attempt ended without finishing. */
	failed: boolean;
	/**
	 * The three product stages, in order. Empty while the state is unknown and
	 * after a failed attempt: on failure the server cannot say how far it got,
	 * so claiming a completed stage would be inventing progress.
	 */
	stages: SyncStageRow[];
	/** Reported only once the server actually has it. */
	excludedCount?: number;
	/**
	 * Server-sourced failure text, safe to render verbatim.
	 *
	 * The status endpoint sources this field from the analysis record as well as
	 * from sync failures, so it is suppressed once the transport finished: on a
	 * completed sync it describes a conclusion problem the summary step owns.
	 */
	errorMessage: string | null;
	/** What the user can do about a failed or expired attempt. */
	retryHint: string;
	/** A failed or expired session cannot resume; it needs a fresh credential. */
	canRetry: boolean;
	/** Transport finished: a usable current snapshot exists. */
	syncComplete: boolean;
}

/** Stable, user-facing row order. Presentation only; the copy is mapped above. */
export const SYNC_STAGE_ORDER = ["agent", "preparing", "syncing"] as const;

export type SyncStageKey = (typeof SYNC_STAGE_ORDER)[number];

export const SYNC_STAGE_TEST_IDS: Readonly<Record<SyncStageKey, string>> = {
	agent: "sync-stage-agent",
	preparing: "sync-stage-preparing",
	syncing: "sync-stage-sync",
};

const AGENT_TITLE = "Menunggu agent";
const AGENT_HINT = "Jalankan prompt dari root repository.";
const PREPARE_TITLE = "Menyiapkan source code";
const SYNC_TITLE = "Menyinkronkan codebase";

function buildAgentRow(progress: SyncStageProgress): SyncStageRow {
	if (progress === "waiting") {
		return { state: "waiting", title: AGENT_TITLE, detail: AGENT_HINT };
	}
	return {
		state: "done",
		title: "Agent terhubung",
		detail: "Agent berhasil tersambung ke VibeEverything.",
	};
}

function buildPreparingRow(progress: SyncStageProgress): SyncStageRow {
	if (progress === "preparing") {
		return {
			state: "active",
			title: `${PREPARE_TITLE}...`,
			detail: "Memeriksa file project yang akan disinkronkan.",
		};
	}
	if (progress === "syncing" || progress === "done") {
		return {
			state: "done",
			title: "Source code siap",
			detail: "File project yang relevan sudah disiapkan.",
		};
	}
	return { state: "waiting", title: PREPARE_TITLE };
}

function buildSyncingRow(
	progress: SyncStageProgress,
	fileCount: number | undefined,
): SyncStageRow {
	if (progress === "done") {
		return {
			state: "done",
			title: "Sinkronisasi selesai",
			detail:
				typeof fileCount === "number"
					? `${fileCount} file berhasil diterima.`
					: "Source code berhasil diterima.",
		};
	}
	if (progress === "syncing") {
		const row: SyncStageRow = {
			state: "active",
			title: `${SYNC_TITLE}...`,
			detail: "Mengirim source code ke VibeEverything.",
		};
		// The count is real server data, so it is shown as soon as there is one
		// rather than inventing a percentage the server never reports.
		if (typeof fileCount === "number") {
			row.meta = `${fileCount} file sedang dikirim.`;
		}
		return row;
	}
	return { state: "waiting", title: SYNC_TITLE };
}

const EXPIRED_RETRY_HINT =
	"Sesi sync sudah kedaluwarsa. Buat token baru untuk melanjutkan.";
const FAILED_RETRY_HINT =
	"Perbaiki masalah di terminal, lalu jalankan ulang prompt.";

export function resolveSyncStageView(
	status:
		| Pick<
				SyncStatusResponse,
				| "status"
				| "snapshotId"
				| "fileCount"
				| "excludedCount"
				| "errorMessage"
				| "cliConnectedAt"
		  >
		| null
		| undefined,
): SyncStageView {
	// No server state yet is not "waiting for the agent": the browser has not
	// asked. Rendering the stage list here would claim the server reported
	// something it never did.
	if (!status) {
		return {
			hasStatus: false,
			failed: false,
			stages: [],
			errorMessage: null,
			retryHint: "",
			canRetry: false,
			syncComplete: false,
		};
	}

	const syncComplete = isSyncStatusComplete(status);
	const errorMessage = syncComplete ? null : (status.errorMessage ?? null);

	if (status.status === "failed" || status.status === "expired") {
		// A failed attempt can break at any step, and the status alone does not
		// record which one. Showing completed checkmarks here would be invented
		// progress, so the stage list is withheld and the failure is reported
		// once, with the way out.
		return {
			hasStatus: true,
			failed: true,
			stages: [],
			errorMessage,
			retryHint:
				status.status === "expired" ? EXPIRED_RETRY_HINT : FAILED_RETRY_HINT,
			canRetry: true,
			syncComplete: false,
		};
	}

	// A `done` status with no snapshot cannot back a finished claim: the upload
	// was never verified, so the attempt is still treated as in flight.
	const progress =
		SYNC_STAGE_PROGRESS[status.status] === "done" && !status.snapshotId
			? "syncing"
			: SYNC_STAGE_PROGRESS[status.status];

	return {
		hasStatus: true,
		failed: false,
		stages: [
			buildAgentRow(progress),
			buildPreparingRow(progress),
			buildSyncingRow(progress, status.fileCount),
		],
		...(status.excludedCount !== undefined
			? { excludedCount: status.excludedCount }
			: {}),
		errorMessage,
		retryHint: "",
		canRetry: false,
		syncComplete,
	};
}

export function assertSyncTransition(
	from: CodebaseSyncStatus,
	to: CodebaseSyncStatus,
): void {
	if (!canTransitionSyncStatus(from, to)) {
		throw new SyncTransitionError(from, to);
	}
}

// === Path safety ===
// Manifest/source payloads must carry repository-relative paths only: no
// absolute paths, no `..` escapes, no empty values, no null bytes.
// Backslashes are normalized to `/` first so Windows absolute (`\abs`,
// `C:\...`), UNC (`\\share`), drive-relative (`C:foo`), and
// backslash-traversal (`foo\..\evil`) payloads cannot bypass the check.

export function isSafeRelativePath(path: string): boolean {
	if (!path || path.length === 0) return false;
	if (path.includes("\0")) return false;
	const normalized = path.replace(/\\/g, "/");
	if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) return false;
	const segments = normalized.split("/");
	for (const segment of segments) {
		if (segment === "" || segment === "." || segment === "..") return false;
	}
	return true;
}

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
	// Latest analysis status for the snapshot (pending while the model runs,
	// ready on success, failed when retryable). Drives the review/retry UI;
	// absent when no analysis has been requested yet.
	analysisStatus: codebaseAnalysisStatusSchema.optional(),
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

// === Generation-context selection ===
// The codebase page asks "which snapshot is newest" — a re-sync must be visible
// immediately, so newest wins. Generation does NOT use this function: each
// feature resolves through its own newest ready analysis
// (`selectNewestReadyAnalysis`), which permanently binds a feature to the
// codebase state it was planned against and stops a later re-sync from
// retroactively changing an existing feature's context.
//
// `selectedId` remains an override for a future explicit snapshot picker.

// Snapshots a feature may be planned against: `uploaded` is the terminal state
// written by completion, `ready` is retained for rows created before the
// codebase model existed.
export const SNAPSHOT_CONTEXT_STATUSES: readonly string[] = [
	"uploaded",
	"ready",
] as const;

export interface SelectableSnapshot {
	id: string;
	status: string;
	createdAt: string;
}

export function selectActiveSnapshot<T extends SelectableSnapshot>(
	snapshots: readonly T[],
	selectedId?: string,
): T | null {
	const usable = [...snapshots]
		.filter((snapshot) => SNAPSHOT_CONTEXT_STATUSES.includes(snapshot.status))
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	if (usable.length === 0) return null;
	if (selectedId) {
		const selected = usable.find((snapshot) => snapshot.id === selectedId);
		if (selected) return selected;
	}
	return usable[0];
}

// === Sync capability scope (Task 4) ===
// Dedicated narrow scope for codebase sync uploads. A sync credential must
// not grant task mutation or unrelated project access, and ordinary auto-CLI
// keys (`read:project`, `write:task:status`, …) must never satisfy a sync
// capability check. Auto-key scopes in
// `src/routes/api/settings/api-keys/auto.ts` stay unchanged.

export const CODEBASE_SYNC_SCOPE = "codebase:sync" as const;

export function hasSyncCapability(
	scopes: readonly string[] | null | undefined,
): boolean {
	if (!scopes) return false;
	return (
		scopes.includes(CODEBASE_SYNC_SCOPE) ||
		scopes.includes("admin") ||
		scopes.includes("*")
	);
}

// === Sync rate-limit convention (Task 4) ===
// CLI transport endpoints (handshake, manifest, files, complete, failure) reuse
// the neighboring `api_call` action from `src/lib/rate-limit.ts` (same
// convention as `/api/ask/options`).

export const CODEBASE_SYNC_RATE_LIMIT_ACTION = "api_call" as const;

// Browser status polling gets a SEPARATE action from the CLI transport. Sharing
// one budget made the observer compete with the observed: `waiting_for_cli` is
// the normal state for a whole session, so a browser tab polling on a 2s
// cadence burned half the shared `general` allowance (60/min) before the CLI
// could upload anything. Reconciliation must be bounded on its own terms and
// must never throttle the transport it reports on.

export const CODEBASE_SYNC_STATUS_RATE_LIMIT_ACTION =
	"sync_status_read" as const;

// === Sync session lifecycle (Task 4; pure, DB-agnostic) ===
// Row shapes are structural so these helpers stay unit-testable without a
// database and importable from isomorphic code (no node:crypto here —
// credential generation/hashing lives in `codebase-sync.server.ts`).

export interface SyncSessionLike {
	id: string;
	// Legacy project linkage; null for codebase-scoped sessions created
	// after the project_id columns became nullable (ownership flows via
	// codebaseId). Usability never reads this field.
	projectId: string | null;
	userId: string;
	// Codebase owner key for sessions minted under /api/codebases.
	// Absent on legacy project-bound rows and in unit fixtures.
	codebaseId?: string | null;
	status: string;
	expiresAt: Date | string;
	consumedAt?: Date | string | null;
	updatedAt?: Date | string | null;
}

export type SessionUsability =
	| { usable: true }
	| {
			usable: false;
			code:
				| "SYNC_SESSION_EXPIRED"
				| "SYNC_CREDENTIAL_REVOKED"
				| "SYNC_SESSION_TERMINAL";
			httpStatus: 401 | 410;
	  };

export function getSessionUsability(
	session: SyncSessionLike,
	now: Date = new Date(),
): SessionUsability {
	if (session.consumedAt) {
		return {
			usable: false,
			code: "SYNC_CREDENTIAL_REVOKED",
			httpStatus: 401,
		};
	}
	if (new Date(session.expiresAt).getTime() <= now.getTime()) {
		return {
			usable: false,
			code: "SYNC_SESSION_EXPIRED",
			httpStatus: 410,
		};
	}
	if (!codebaseSyncStatusSchema.safeParse(session.status).success) {
		return {
			usable: false,
			code: "SYNC_SESSION_TERMINAL",
			httpStatus: 401,
		};
	}
	if (
		(CODEBASE_SYNC_TERMINAL_STATUSES as readonly string[]).includes(
			session.status,
		)
	) {
		return {
			usable: false,
			code: "SYNC_SESSION_TERMINAL",
			httpStatus: 401,
		};
	}
	return { usable: true };
}

export function canAccessSyncSession(
	session: Pick<SyncSessionLike, "projectId" | "userId">,
	userId: string,
	projectId: string,
): boolean {
	return session.userId === userId && session.projectId === projectId;
}

export function isSyncCapableProject(project: {
	projectMode?: string | null;
}): boolean {
	return project?.projectMode === "existing_codebase";
}

// Browser handoff for Home-created existing-codebase projects: the creation
// response carries the one-time sync payload, the Home composer stashes it
// under this per-project sessionStorage key, and the /codebase/$id page
// consumes it once to open the agent modal. The key carries only the project
// id — never credential material.
export function getPendingSyncPayloadKey(projectId: string): string {
	return `prdfy:sync-payload:${projectId}`;
}

// Plan-page recovery pointer: /plan/codebase creates a codebase without a
// route param, so a refresh would otherwise orphan the in-flight sync and mint
// a new codebase. The stored value is only the codebase id/name pointer —
// never the sync token or sync state. Authoritative sync state always comes
// from GET /api/codebases/:id/status; a missing token after refresh is
// replaced via POST /session retry (new credential), never restored from
// storage.
export const PLAN_CODEBASE_ID_STORAGE_KEY = "prdfy:plan-codebase-id";
export const PLAN_CODEBASE_NAME_STORAGE_KEY = "prdfy:plan-codebase-name";
// Onboarding analysis project pointer: /plan/codebase ensures one
// existing-codebase feature project per codebase so the initial analysis can
// run through the existing per-feature analysis boundary. The value is only
// the project id — never sync state, which always comes from GET status and
// GET analysis. Stored alongside the codebase pointer above so refresh
// recovery reuses the project instead of minting duplicates.
export const PLAN_CODEBASE_PROJECT_STORAGE_KEY =
	"prdfy:plan-codebase-project-id";
// Onboarding step pointer: which of the three steps the user was last on.
// The step is a navigation intent, not domain state — sync and analysis state
// always come from GET status and GET analysis. Storing it is what lets a
// refresh return the user to the screen they were reading instead of guessing
// a screen from the server snapshot alone.
export const PLAN_CODEBASE_STEP_STORAGE_KEY = "prdfy:plan-codebase-step";

// One usable credential per project: this predicate is advisory only; session
// creation must re-check under a per-project transaction/advisory lock
// (`pg_advisory_xact_lock(hashtext(projectId))` in `/api/codebase/$projectId/session`)
// so concurrent mints cannot race to issue multiple usable credentials.
// Terminal or expired rows never block a retry — the retry mints a new
// session instead of mutating them.
export function shouldCreateSyncSession(
	existing: readonly SyncSessionLike[],
	now: Date = new Date(),
): boolean {
	return !existing.some((session) => getSessionUsability(session, now).usable);
}

// Revocation is explicit: the row moves to `expired` and records consumption
// so the credential is rejected after completion, expiry, or manual revoke.
// The credential hash is preserved (audit); no raw credential is introduced.
export function applySessionRevocation<T extends SyncSessionLike>(
	session: T,
	now: Date = new Date(),
): T {
	return { ...session, status: "expired", consumedAt: now, updatedAt: now };
}

export interface SyncSessionMetadata {
	sessionId: string;
	projectId: string;
	status: string;
	expiresAt: string;
	createdAt?: string;
	updatedAt?: string;
}

// Browser reads (session GET, status polling) expose metadata only — never
// the credential hash or a raw credential after initial creation.
export function toSessionMetadata(
	session: Omit<SyncSessionLike, "projectId"> & {
		// Metadata always carries a concrete owner id: the project id for
		// legacy routes, the codebase id for /api/codebases routes (the
		// SyncPromptPayload.projectId name is kept, value is the codebase
		// id). Callers spread the row and supply the known id explicitly.
		projectId: string;
		credentialHash?: string;
		createdAt?: Date | string | null;
	},
): SyncSessionMetadata {
	const toIso = (
		value: Date | string | null | undefined,
	): string | undefined => {
		if (!value) return undefined;
		return value instanceof Date ? value.toISOString() : value;
	};
	return {
		sessionId: session.id,
		projectId: session.projectId,
		status: session.status,
		expiresAt: toIso(session.expiresAt) ?? "",
		createdAt: toIso(session.createdAt),
		updatedAt: toIso(session.updatedAt),
	};
}

// === Safe sync errors (Task 4) ===
// Only whitelisted codes reach clients. Unknown/detail errors collapse to
// SYNC_FAILED so tokens, source data, and internals never leak into errors.

export const SYNC_SAFE_ERROR_CODES = [
	"SYNC_FAILED",
	"SYNC_SESSION_ACTIVE",
	"SYNC_SESSION_EXPIRED",
	"SYNC_SESSION_TERMINAL",
	"SYNC_CREDENTIAL_REVOKED",
	"INVALID_SYNC_CREDENTIAL",
	"NO_SYNC_SESSION",
	"CLI_UPDATE_REQUIRED",
	"PROJECT_MODE_MISMATCH",
	"SNAPSHOT_TOO_LARGE",
	"SNAPSHOT_INCOMPLETE",
	"SNAPSHOT_CONFLICT",
	"SNAPSHOT_HASH_MISMATCH",
	"ANALYSIS_FAILED",
	// The CLI handshakes BEFORE it prepares source code, so these two describe
	// a real window that begins only after the server already persisted
	// `connected`. Without them the browser would sit on a stale "preparing"
	// row until the session expired.
	"SCAN_FAILED",
	"BLOCKED_CONTENT",
] as const;

export type SyncSafeErrorCode = (typeof SYNC_SAFE_ERROR_CODES)[number];

export function sanitizeSyncErrorCode(code: unknown): SyncSafeErrorCode {
	if (
		typeof code === "string" &&
		(SYNC_SAFE_ERROR_CODES as readonly string[]).includes(code)
	) {
		return code as SyncSafeErrorCode;
	}
	return "SYNC_FAILED";
}

// === Server-owned failure copy (local preparation window) ===
// The CLI reports only an attempt identity plus a whitelisted code. Every
// user-facing sentence is owned here, because the CLI's own error text embeds
// absolute local paths (`Cannot scan repository root: <abs path>`) and blocked
// file paths. A server-owned string is the only shape that can be persisted
// and rendered without leaking where the repository lives or which files it
// contains.
const SYNC_FAILURE_MESSAGES: Readonly<Record<string, string>> = {
	SYNC_FAILED:
		"Sinkronisasi gagal. Periksa output terminal lalu jalankan ulang prompt.",
	SCAN_FAILED:
		"CLI gagal membaca repository. Pastikan folder ini adalah root repository Git yang bisa dibaca.",
	BLOCKED_CONTENT:
		"Sebagian file ditolak karena terdeteksi konten rahasia. Redaksi atau kecualikan file tersebut lewat .prdfyignore, lalu jalankan ulang.",
	SNAPSHOT_TOO_LARGE:
		"Ukuran snapshot melebihi batas server. Kurangi file yang ikut disinkronkan, lalu jalankan ulang.",
};

export function resolveSyncFailureMessage(code: unknown): string {
	const sanitized = sanitizeSyncErrorCode(code);
	return SYNC_FAILURE_MESSAGES[sanitized] ?? SYNC_FAILURE_MESSAGES.SYNC_FAILED;
}

// === Persisted failure evidence ===
// Stored in `codebase_sync_sessions.metadata` beside the handshake evidence:
// both are facts about this attempt that must outlive the attempt itself so a
// failed session stays explicable after a refresh. The client-supplied message
// is deliberately discarded — only the sanitized code and the server's own
// copy are written.

const SYNC_FAILURE_CODE_KEY = "failureCode" as const;
const SYNC_FAILURE_MESSAGE_KEY = "failureMessage" as const;
const SYNC_FAILURE_AT_KEY = "failedAt" as const;

export interface SyncFailureEvidence {
	code: SyncSafeErrorCode;
	message: string;
}

export function readSyncFailureMetadata(
	metadata: unknown,
): SyncFailureEvidence | null {
	if (typeof metadata !== "object" || metadata === null) return null;
	const record = metadata as Record<string, unknown>;
	const rawCode = record[SYNC_FAILURE_CODE_KEY];
	if (typeof rawCode !== "string") return null;
	const code = sanitizeSyncErrorCode(rawCode);
	return {
		code,
		message: resolveSyncFailureMessage(code),
	};
}

export function buildFailureMetadata(input: {
	previous: unknown;
	rawCode: unknown;
	failedAt: Date;
}): Record<string, unknown> {
	const previous =
		typeof input.previous === "object" && input.previous !== null
			? (input.previous as Record<string, unknown>)
			: {};
	const code = sanitizeSyncErrorCode(input.rawCode);
	return {
		...previous,
		[SYNC_FAILURE_CODE_KEY]: code,
		[SYNC_FAILURE_MESSAGE_KEY]: resolveSyncFailureMessage(code),
		[SYNC_FAILURE_AT_KEY]: input.failedAt.toISOString(),
	};
}

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
});

export type CliHandshakeRequest = z.infer<typeof cliHandshakeRequestSchema>;

export const cliHandshakeResponseSchema = z.object({
	sessionId: z.string().min(1),
	attemptId: z.string().min(1),
	snapshotId: z.string().min(1),
	status: codebaseSyncStatusSchema,
	cliMinVersion: z.string().min(1),
	expiresAt: z.string().datetime(),
});

export type CliHandshakeResponse = z.infer<typeof cliHandshakeResponseSchema>;

// Numeric semver comparison for the server-side version hint. Malformed
// input is treated as unsupported (fail closed).
export function isSupportedCliVersion(
	cliVersion: string,
	minVersion: string = CODEBASE_CLI_MIN_VERSION,
): boolean {
	const parse = (value: string): number[] | null => {
		const parts = value.split(".");
		if (parts.length === 0) return null;
		const numbers: number[] = [];
		for (const part of parts) {
			if (!/^\d+$/.test(part)) return null;
			numbers.push(Number(part));
		}
		return numbers;
	};
	const current = parse(cliVersion);
	const minimum = parse(minVersion);
	if (!current || !minimum) return false;
	for (let i = 0; i < Math.max(current.length, minimum.length); i += 1) {
		const diff = (current[i] ?? 0) - (minimum[i] ?? 0);
		if (diff !== 0) return diff > 0;
	}
	return true;
}

const SAFE_PROJECT_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

// Locked CLI invocation. The raw credential travels in `SyncPromptPayload`
// (`syncToken` field, exposed once); the command embeds only a placeholder so
// the credential never appears in a copyable string by accident. The project id
// must be a safe identifier (alphanumeric, dashes, underscores) to prevent shell
// metacharacter injection when copied into a terminal.
export function buildSyncCommand(projectId: string): string {
	if (!SAFE_PROJECT_ID_PATTERN.test(projectId)) {
		throw new Error(`Invalid project ID format: "${projectId}"`);
	}
	return `vibeeverything codebase sync --project-id ${projectId} --sync-token <token>`;
}

// === External-agent prompt ===
// Self-contained execution document for a local AI coding agent (Claude Code,
// Codex CLI, Gemini CLI, OpenCode, …). The agent must not have to guess where
// it runs, when to install, whether to create `.prdfyignore`, what the CLI
// already handles, what is forbidden, or how to report. Sections follow a fixed
// order: tujuan → project info → prasyarat → command → CLI-otomatis → aturan →
// kegagalan → format laporan.
//
// Boundaries kept deliberately:
// - One command, inline flags, no environment variable, no alternative. The
//   command stays on a single line: a backslash continuation is valid in
//   bash/zsh but is a parse error in PowerShell and cmd.exe, so a multi-line
//   form would break on Windows for no benefit.
// - No minimum-version number: the CLI validates it and prints the update
//   notice. The prompt only states that the CLI does it.
// - The exclusions section names categories with `.env` as the one concrete
//   example (it is a stable, universally understood name) but never enumerates
//   path patterns, which would rot and could contradict the CLI's built-ins.
// - The raw credential appears inline because a single copy-pasteable command
//   is the whole point; every other surface renders `<token>` instead (see
//   `buildSyncCommand`).
export function buildAgentPrompt(
	payload: SyncPromptPayload,
	context?: { projectName?: string },
): string {
	const command = `vibeeverything codebase sync --project-id ${payload.projectId} --sync-token ${payload.syncToken}`;
	const infoLines = [
		`Project ID   : ${payload.projectId}`,
		`Server       : ${payload.apiBaseUrl}`,
		`Sync Token   : ${payload.syncToken}`,
		`Expired At   : ${payload.expiresAt}`,
	];
	// "Nama Fitur" is only rendered when the name is actually known; an empty
	// placeholder would read as a missing value the agent might try to fill in.
	if (context?.projectName) {
		infoLines.unshift(`Nama Fitur   : ${context.projectName}`);
	}

	return [
		"Sinkronkan codebase repositori lokal ini ke project VibeEverything menggunakan CLI resmi.",
		"Fokus hanya pada proses sinkronisasi; jangan melakukan perubahan terhadap source code.",
		"",
		"## Informasi Project",
		...infoLines,
		"",
		"## Prasyarat Eksekusi",
		"1. Pastikan kamu berada di root repositori Git.",
		"2. Periksa ketersediaan Node.js dan npm di sistem (`node -v` dan `npm -v`). Jangan berasumsi Node.js/npm sudah terpasang:",
		"   - Jika `node` atau `npm` belum terpasang atau versinya usang, unduh dan install Node.js versi LTS / stable terbaru (dari https://nodejs.org atau via package manager sistem seperti winget/brew/apt) sampai perintah `npm` siap digunakan.",
		"3. Gunakan VibeEverything CLI untuk menjalankan sinkronisasi.",
		"4. Jika command `vibeeverything` belum tersedia di terminal, install secara global:",
		"   npm i -g @ghazynabiel/vibeeverything",
		"",
		"## Perintah Yang Harus Dieksekusi",
		command,
		"",
		"## Yang Dilakukan CLI Otomatis",
		"Bagian ini bersifat informasi. Jangan kerjakan ulang secara manual.",
		"- Deteksi root repository.",
		"- Validasi versi minimum CLI.",
		"- Pembuatan `.prdfyignore` jika belum ada.",
		"- Penggunaan ignore bawaan.",
		"- Pengecualian file rahasia (termasuk `.env`), secret, dependency, build, dan cache.",
		"- Hashing dan upload hanya file yang diizinkan.",
		"",
		"## Aturan Yang Wajib Dipatuhi",
		"- [ ] Jangan mengubah source code.",
		"- [ ] Jangan membuat commit.",
		"- [ ] Jangan push.",
		"- [ ] Jangan mengedit `.gitignore`.",
		"- [ ] Jangan menulis Sync Token ke file proyek.",
		"- [ ] Jangan menyimpan token ke konfigurasi permanen.",
		"- [ ] Jangan memodifikasi `.prdfyignore` kecuali diminta user.",
		"- [ ] Jangan mengklaim sinkronisasi berhasil tanpa output CLI.",
		"",
		"## Penanganan Kegagalan",
		"Jika sinkronisasi gagal:",
		"- Tampilkan pesan error CLI asli secara lengkap tanpa diringkas atau diubah.",
		"- Jangan mengubah file kode proyek untuk mencoba mengatasi kegagalan sinkronisasi.",
		"- Jangan retry dengan command atau flag di luar panduan resmi.",
		"- Berikan panduan tindakan transparan kepada user sesuai kondisi error:",
		"  * Jika sesi/token kedaluwarsa (`SYNC_EXPIRED` atau 401): Beri tahu user untuk kembali ke browser VibeEverything dan klik 'Coba Lagi' guna mendapatkan token baru.",
		"  * Jika koneksi server gagal (`ECONNREFUSED` atau Network Error): Beri tahu user untuk memeriksa koneksi internet atau ketersediaan server.",
		"  * Jika direktori bukan root git: Ingatkan user agar menjalankan agent tepat di folder root repositori Git.",
		"  * Jika install global npm terkendala izin (`EACCES`): Sarankan alternatif menjalankan via `npx @ghazynabiel/vibeeverything codebase sync ...`.",
		"",
		"## Format Laporan Akhir",
		"Kembalikan laporan kepada user dengan format berikut:",
		"",
		"Status:",
		"Berhasil / Gagal",
		"",
		"Project:",
		payload.projectId,
		"",
		"Server:",
		payload.apiBaseUrl,
		"",
		"CLI Version:",
		"<x.x.x dari output CLI, atau - jika tidak tersedia>",
		"",
		"Hasil CLI:",
		"<output CLI asli secara lengkap>",
		"",
		"Tindakan Untuk User:",
		"<Jika berhasil: 'Sinkronisasi berhasil! Kembali ke tab browser VibeEverything untuk melihat ringkasan analisis codebase.'>",
		"<Jika gagal: sampaikan arahan solusi sesuai diagnosa di atas.>",
	].join("\n");
}

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
	// excludedCount = ALL exclusions (built-in + secret + .prdfyignore +
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

// === Upload session advancement (Task 5) ===
// The CLI persists no `scanning`/`filtering` state of its own: it handshakes
// (waiting_for_cli -> connected), spends `connected` preparing source code
// locally, and then starts the upload. `scanning` and `filtering` remain
// transition-validation vocabulary — nothing writes them, because preparation
// is a single continuous local operation with no server-observable boundary
// inside it, and inventing a network call per phase would report a stage that
// does not exist.
//
// Upload endpoints therefore walk the session through the remaining valid chain
// steps so the persisted history never skips a transition, and persist only
// `uploading`. The browser's real observation of the preparation work is the
// `connected` window itself, which now spans that work (see the CLI sync
// command). Uploads before handshake or after completion are rejected;
// completion has its own uploaded transition.

export function uploadTransitionSteps(
	from: CodebaseSyncStatus,
): Array<[CodebaseSyncStatus, CodebaseSyncStatus]> {
	switch (from) {
		case "connected":
			return [
				["connected", "scanning"],
				["scanning", "filtering"],
				["filtering", "uploading"],
			];
		case "scanning":
			return [
				["scanning", "filtering"],
				["filtering", "uploading"],
			];
		case "filtering":
			return [["filtering", "uploading"]];
		case "uploading":
			return [];
		default:
			throw new SyncTransitionError(from, "uploading");
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

// === Fail-closed CLI version gate (Task 5 carry-over) ===
// Task 4 left the minimum-version check client-only. Upload and handshake
// paths now reject unsupported CLIs server-side: the handshake validates the
// reported version, and upload/complete endpoints validate the version stored
// on the session at handshake time. Malformed versions are rejected (never
// treated as new-enough). The CLI treats 426 as non-retryable and surfaces
// the update guidance.

export class CliVersionError extends Error {
	readonly code = "CLI_UPDATE_REQUIRED" as const;

	constructor() {
		super(
			`This CLI version is below the required minimum ${CODEBASE_CLI_MIN_VERSION}. Update with: npm i -g @ghazynabiel/vibeeverything`,
		);
		this.name = "CliVersionError";
	}
}

export function requireSupportedCliVersion(
	cliVersion: unknown,
	minVersion: string = CODEBASE_CLI_MIN_VERSION,
): void {
	if (
		typeof cliVersion !== "string" ||
		!isSupportedCliVersion(cliVersion, minVersion)
	) {
		throw new CliVersionError();
	}
}

// === Control characters ===
// C0 controls and DEL never belong in user-facing text or in an identifier.
// One rule backs both `sanitizeSyncErrorMessage` (strip them) and repository
// name validation (reject the name), so it lives here instead of in two
// ad-hoc regexes — and is expressed over code points rather than a literal, so
// it stays lint-clean.

export function hasControlCharacters(value: string): boolean {
	return [...value].some((ch) => {
		const code = ch.codePointAt(0) ?? 0;
		return code < 0x20 || code === 0x7f;
	});
}

// === Safe sync error messages (Task 5 carry-over) ===
// Analysis writers (Task 6) must store only safe user-facing strings in
// `errorMessage`. As defense-in-depth, the status read boundary passes stored
// messages through this sanitizer: control characters are stripped, length is
// capped, and empty/non-string values collapse to null. Tokens and source
// content must never reach this field.

export function sanitizeSyncErrorMessage(message: unknown): string | null {
	if (typeof message !== "string") return null;
	const stripped = [...message]
		.filter((ch) => !hasControlCharacters(ch))
		.join("")
		.trim();
	if (!stripped) return null;
	return stripped.length > CODEBASE_MAX_ERROR_MESSAGE_CHARS
		? stripped.slice(0, CODEBASE_MAX_ERROR_MESSAGE_CHARS)
		: stripped;
}
