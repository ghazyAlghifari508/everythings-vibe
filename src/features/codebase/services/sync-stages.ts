import type {
	CodebaseSyncStatus,
	SyncLifecycleEventKind,
	SyncStatusResponse,
} from "../types/sync-schemas";
import { isSyncStatusComplete } from "./sync-lifecycle";

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
	/**
	 * Server-recorded time this stage actually finished. Present only when the
	 * backend persisted a real timestamp for it, so a fast sync can report
	 * WHEN each stage completed instead of replaying it as if still running.
	 */
	completedAt?: string;
	/**
	 * Server-recorded time this stage actually began. Set only for the active
	 * stage, and only from a real prior transition, so an elapsed duration is
	 * measured rather than guessed.
	 */
	startedAt?: string;
}

export interface SyncStageView {
	/** False until the browser has received any server state at all. */
	hasStatus: boolean;
	/**
	 * True only once real sync activity has begun (CLI has progressed beyond
	 * `waiting_for_cli`).
	 */
	hasStarted: boolean;
	/** True when the attempt ended without finishing. */
	failed: boolean;
	/**
	 * The three product stages, in order. Empty while the state is unknown,
	 * before the sync has started (waiting_for_cli), and after a failed attempt:
	 * on failure the server cannot say how far it got, so claiming a completed stage
	 * would be inventing progress.
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

function buildAgentRow(
	progress: SyncStageProgress,
	agentConnectedAt: string | null,
): SyncStageRow {
	if (progress === "waiting") {
		return { state: "waiting", title: AGENT_TITLE, detail: AGENT_HINT };
	}
	return {
		state: "done",
		title: "Agent terhubung",
		detail: "Agent berhasil tersambung ke everythings-vibe.",
		...(agentConnectedAt ? { completedAt: agentConnectedAt } : {}),
	};
}

function buildPreparingRow(
	progress: SyncStageProgress,
	preparationStartedAt: string | null,
): SyncStageRow {
	if (progress === "preparing") {
		return {
			state: "active",
			title: `${PREPARE_TITLE}...`,
			detail: "Memeriksa file project yang akan disinkronkan.",
			// The handshake is when preparation really began: the CLI handshakes
			// BEFORE it walks the repository, so this elapsed window is measured
			// from a persisted fact.
			...(preparationStartedAt ? { startedAt: preparationStartedAt } : {}),
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
	uploadStartedAt: string | null,
	snapshotPersistedAt: string | null,
	snapshotPersistedCount: number | undefined,
): SyncStageRow {
	if (progress === "done") {
		const verifiedCount =
			typeof snapshotPersistedCount === "number"
				? snapshotPersistedCount
				: fileCount;
		return {
			state: "done",
			title: "Sinkronisasi selesai",
			detail:
				typeof verifiedCount === "number"
					? `${verifiedCount} file berhasil diterima.`
					: "Source code berhasil diterima.",
			...(snapshotPersistedAt ? { completedAt: snapshotPersistedAt } : {}),
		};
	}
	if (progress === "syncing") {
		const row: SyncStageRow = {
			state: "active",
			title: `${SYNC_TITLE}...`,
			detail: "Mengirim source code ke everythings-vibe.",
			// Upload start is the persisted moment transport actually began, so
			// the elapsed timer measures real transfer time.
			...(uploadStartedAt ? { startedAt: uploadStartedAt } : {}),
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
				| "snapshotCreatedAt"
				| "lifecycle"
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
			hasStarted: false,
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
			hasStarted: false,
			failed: true,
			stages: [],
			errorMessage,
			retryHint:
				status.status === "expired" ? EXPIRED_RETRY_HINT : FAILED_RETRY_HINT,
			canRetry: true,
			syncComplete: false,
		};
	}

	if (status.status === "waiting_for_cli") {
		// Pre-start standby: the user is copying the prompt into their terminal
		// or agent. No real sync activity has started, so rendering stages would
		// fake a running progress timeline before any work exists.
		return {
			hasStatus: true,
			hasStarted: false,
			failed: false,
			stages: [],
			errorMessage: null,
			retryHint: "",
			canRetry: false,
			syncComplete: false,
		};
	}

	// A `done` status with no snapshot cannot back a finished claim: the upload
	// was never verified, so the attempt is still treated as in flight.
	const progress =
		SYNC_STAGE_PROGRESS[status.status] === "done" && !status.snapshotId
			? "syncing"
			: SYNC_STAGE_PROGRESS[status.status];

	// Real transition timestamps, in order of preference:
	// 1. the persisted lifecycle log, written by the route that performed the
	//    transition — this is what lets a fast sync report WHEN it finished;
	// 2. the handshake evidence column, for sessions created before the log.
	// A missing timestamp stays missing: the row simply renders without one.
	const lifecycle = status.lifecycle ?? [];
	const eventAt = (kind: SyncLifecycleEventKind): string | null =>
		lifecycle.find((event) => event.kind === kind)?.at ?? null;
	const agentConnectedAt =
		eventAt("agent_connected") ?? status.cliConnectedAt ?? null;
	const uploadStartedAt = eventAt("upload_started");
	const snapshotPersistedAt =
		eventAt("snapshot_persisted") ?? status.snapshotCreatedAt ?? null;
	const snapshotPersistedCount = lifecycle.find(
		(event) => event.kind === "snapshot_persisted",
	)?.count;

	return {
		hasStatus: true,
		hasStarted: true,
		failed: false,
		stages: [
			buildAgentRow(progress, agentConnectedAt),
			buildPreparingRow(progress, agentConnectedAt),
			buildSyncingRow(
				progress,
				status.fileCount,
				uploadStartedAt,
				snapshotPersistedAt,
				snapshotPersistedCount,
			),
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
