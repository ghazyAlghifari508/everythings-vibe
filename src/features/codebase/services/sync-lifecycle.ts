import { z } from "zod";
import {
	CODEBASE_SYNC_TERMINAL_STATUSES,
	type CodebaseSyncStatus,
	SYNC_LIFECYCLE_EVENT_KINDS,
	SYNC_LIFECYCLE_MAX_EVENTS,
	type SyncLifecycleEventKind,
	type SyncStatusResponse,
} from "../types/sync-schemas";

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

export function assertSyncTransition(
	from: CodebaseSyncStatus,
	to: CodebaseSyncStatus,
): void {
	if (!canTransitionSyncStatus(from, to)) {
		throw new SyncTransitionError(from, to);
	}
}

// === Persisted lifecycle event log ===
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

export const SYNC_LIFECYCLE_METADATA_KEY = "lifecycle" as const;

export interface SyncLifecycleEvent {
	kind: SyncLifecycleEventKind;
	at: string;
	/**
	 * Optional verified count attached to the event (files received for
	 * `snapshot_persisted`). Never a percentage or an estimate.
	 */
	count?: number;
}

const syncLifecycleEventSchema = z.object({
	kind: z.enum(SYNC_LIFECYCLE_EVENT_KINDS),
	at: z.string().datetime(),
	count: z.number().int().nonnegative().optional(),
});

const syncLifecycleEventListSchema = z.array(syncLifecycleEventSchema);

/**
 * Read the persisted lifecycle log. The metadata column is untrusted jsonb:
 * malformed entries are dropped rather than throwing, so a corrupt row
 * degrades to "no history" instead of breaking status polling.
 */
export function readSyncLifecycle(metadata: unknown): SyncLifecycleEvent[] {
	if (typeof metadata !== "object" || metadata === null) return [];
	const raw = (metadata as Record<string, unknown>)[
		SYNC_LIFECYCLE_METADATA_KEY
	];
	const parsed = syncLifecycleEventListSchema.safeParse(raw);
	return parsed.success ? parsed.data.slice(0, SYNC_LIFECYCLE_MAX_EVENTS) : [];
}

/**
 * Append one real transition to the log. Idempotent by kind: the first event
 * of a kind wins, so a repeated handshake or a replayed completion cannot
 * move an already-recorded timestamp forward (same rule the handshake
 * evidence uses). Returns the metadata patch to persist.
 */
export function appendSyncLifecycleEvent(input: {
	previous: unknown;
	kind: SyncLifecycleEventKind;
	at: Date;
	count?: number;
}): Record<string, unknown> {
	const previous =
		typeof input.previous === "object" && input.previous !== null
			? (input.previous as Record<string, unknown>)
			: {};
	const existing = readSyncLifecycle(previous);
	if (existing.some((event) => event.kind === input.kind)) {
		return { ...previous, [SYNC_LIFECYCLE_METADATA_KEY]: existing };
	}
	const event: SyncLifecycleEvent = {
		kind: input.kind,
		at: input.at.toISOString(),
		...(typeof input.count === "number" ? { count: input.count } : {}),
	};
	const next = [...existing, event].slice(-SYNC_LIFECYCLE_MAX_EVENTS);
	return { ...previous, [SYNC_LIFECYCLE_METADATA_KEY]: next };
}

/** Timestamp of one recorded event, or null when it never happened. */
export function readSyncLifecycleAt(
	metadata: unknown,
	kind: SyncLifecycleEventKind,
): string | null {
	const found = readSyncLifecycle(metadata).find(
		(event) => event.kind === kind,
	);
	return found?.at ?? null;
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
