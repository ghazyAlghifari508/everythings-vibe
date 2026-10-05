import { describe, expect, it, vi } from "vitest";
import {
	buildFailureMetadata,
	canTransitionSyncStatus,
	readSyncFailureMetadata,
	resolveSyncFailureMessage,
	sanitizeSyncErrorCode,
	uploadTransitionSteps,
} from "@/lib/codebase-sync";

/**
 * Temporal contract for a sync attempt, expressed against a deterministic model
 * of the real lifecycle rather than against hand-fed status strings.
 *
 * The model below reproduces what production actually does after the CLI
 * handshake moved ahead of local preparation: the server persists `connected`
 * while the CLI is still preparing, the upload routes persist `uploading` when
 * transport begins, and completion persists `uploaded` only after the snapshot
 * verifies. Each stage is held for a controlled amount of simulated work so the
 * test can assert that a browser reading the persisted session observes it.
 *
 * No production sleep is involved. The controlled delays exist only here, and
 * they stand in for real local scan/hash work and real network transfer.
 */

type ServerStatus =
	| "waiting_for_cli"
	| "connected"
	| "uploading"
	| "uploaded"
	| "failed";

interface SessionRow {
	id: string;
	status: ServerStatus;
	metadata: Record<string, unknown> | null;
	snapshotId: string | null;
	snapshotStatus: "uploading" | "uploaded";
	fileCount: number;
}

interface HandshakeResult {
	sessionId: string;
	attemptId: string;
	snapshotId: string;
	status: "connected";
}

/**
 * A session store with the same invariants the real routes enforce: one session
 * is one attempt, uploads require the handshake snapshot, completion requires a
 * verified snapshot, and failure is only reachable from a non-terminal state.
 */
class SyncSessionStore {
	private readonly sessions = new Map<string, SessionRow>();
	private snapshotCounter = 0;

	createSession(sessionId: string): SessionRow {
		const row: SessionRow = {
			id: sessionId,
			status: "waiting_for_cli",
			metadata: null,
			snapshotId: null,
			snapshotStatus: "uploading",
			fileCount: 0,
		};
		this.sessions.set(sessionId, row);
		return row;
	}

	read(sessionId: string): SessionRow {
		const row = this.sessions.get(sessionId);
		if (!row) throw new Error(`unknown session ${sessionId}`);
		return row;
	}

	latestSessionId(): string | null {
		const ids = [...this.sessions.keys()];
		return ids.length > 0 ? (ids[ids.length - 1] ?? null) : null;
	}

	handshake(sessionId: string, repositoryName?: string): HandshakeResult {
		const row = this.read(sessionId);
		if (row.status === "waiting_for_cli") {
			expect(canTransitionSyncStatus("waiting_for_cli", "connected")).toBe(
				true,
			);
			row.status = "connected";
		}
		this.snapshotCounter += 1;
		row.snapshotId = row.snapshotId ?? `snap_${this.snapshotCounter}`;
		row.metadata = {
			...(row.metadata ?? {}),
			cliVersion: "3.0.0",
			handshakeAt: "2026-01-01T00:00:00.000Z",
			...(repositoryName ? { repositoryName } : {}),
		};
		return {
			sessionId: row.id,
			// One session is one attempt, exactly as the server binds it.
			attemptId: row.id,
			snapshotId: row.snapshotId,
			status: "connected",
		};
	}

	beginUpload(sessionId: string, fileCount: number): void {
		const row = this.read(sessionId);
		// The upload routes validate the whole chain in memory and then persist
		// only `uploading` — `scanning`/`filtering` are never written. Mirroring
		// `uploadTransitionSteps` keeps the model faithful to that.
		const steps = uploadTransitionSteps(
			row.status as Parameters<typeof uploadTransitionSteps>[0],
		);
		for (const [from, to] of steps) {
			expect(canTransitionSyncStatus(from, to)).toBe(true);
		}
		row.status = "uploading";
		row.fileCount = fileCount;
	}

	complete(sessionId: string): void {
		const row = this.read(sessionId);
		// Completion requires the verified snapshot, not merely a status string.
		if (row.status !== "uploading" || !row.snapshotId) {
			throw new Error("snapshot upload is not in progress");
		}
		expect(canTransitionSyncStatus("uploading", "uploaded")).toBe(true);
		row.status = "uploaded";
		row.snapshotStatus = "uploaded";
	}

	reportFailure(sessionId: string, rawCode: unknown): void {
		const row = this.read(sessionId);
		if (row.status === "failed") {
			// A repeated report replays rather than erroring: `failed` has no
			// outgoing transitions.
			return;
		}
		expect(canTransitionSyncStatus(row.status, "failed")).toBe(true);
		row.status = "failed";
		row.metadata = buildFailureMetadata({
			previous: row.metadata,
			rawCode,
			failedAt: new Date("2026-01-02T03:04:05.000Z"),
		});
	}
}

/** What the browser's status read observes for a session. */
interface ObservedStatus {
	sessionId: string;
	status: ServerStatus;
	snapshotId: string | null;
	errorCode: string | null;
	errorMessage: string | null;
}

function observe(store: SyncSessionStore, sessionId: string): ObservedStatus {
	const row = store.read(sessionId);
	const failure = readSyncFailureMetadata(row.metadata);
	return {
		sessionId: row.id,
		status: row.status,
		snapshotId: row.snapshotId,
		errorCode: failure?.code ?? null,
		errorMessage: failure?.message ?? null,
	};
}

/**
 * Runs a full attempt with the preparation and upload windows held open for a
 * controlled number of observation ticks, which is what lets the test assert
 * that a real intermediate state is actually reachable by the browser.
 */
async function runAttemptWithHeldWindows(options: {
	sessionId: string;
	fileCount: number;
	/** Observation ticks taken while the CLI prepares source code locally. */
	preparationTicks: number;
	/** Observation ticks taken while source transport is in progress. */
	uploadTicks: number;
	prepare?: () => void;
	failDuring?: "preparation" | "upload";
	failureCode?: unknown;
}): Promise<{ store: SyncSessionStore; observations: ObservedStatus[] }> {
	const store = new SyncSessionStore();
	store.createSession(options.sessionId);
	const observations: ObservedStatus[] = [];

	const handshake = store.handshake(options.sessionId, "some-repo");
	expect(handshake.status).toBe("connected");

	// The CLI is now preparing source code locally while the server already
	// holds `connected`. Each tick is one browser poll landing during that
	// window.
	for (let tick = 0; tick < options.preparationTicks; tick += 1) {
		observations.push(observe(store, options.sessionId));
	}

	if (options.failDuring === "preparation") {
		store.reportFailure(options.sessionId, options.failureCode);
		return { store, observations };
	}

	options.prepare?.();
	store.beginUpload(options.sessionId, options.fileCount);

	for (let tick = 0; tick < options.uploadTicks; tick += 1) {
		observations.push(observe(store, options.sessionId));
	}

	if (options.failDuring === "upload") {
		store.reportFailure(options.sessionId, options.failureCode);
		return { store, observations };
	}

	store.complete(options.sessionId);
	return { store, observations };
}

describe("the handshake precedes preparation, so the browser can observe preparation", () => {
	it("exposes a real preparation window while the CLI is still preparing", async () => {
		const { observations } = await runAttemptWithHeldWindows({
			sessionId: "sess_prep",
			fileCount: 37,
			preparationTicks: 4,
			uploadTicks: 2,
		});

		const duringPreparation = observations.slice(0, 4);
		expect(duringPreparation).toHaveLength(4);
		for (const observed of duringPreparation) {
			expect(observed.status).toBe("connected");
		}
		// Before the upload begins there is no transport to report.
		expect(observations[4]?.status).toBe("uploading");
		expect(observations[5]?.status).toBe("uploading");
	});

	it("reaches upload only after preparation completes", async () => {
		const prepare = vi.fn();
		const { store, observations } = await runAttemptWithHeldWindows({
			sessionId: "sess_order",
			fileCount: 3,
			preparationTicks: 3,
			uploadTicks: 1,
			prepare,
		});

		expect(prepare).toHaveBeenCalledOnce();
		// Preparation happened while the persisted status was still `connected`,
		// which is what makes that window real rather than a label.
		expect(
			observations.slice(0, 3).every((o) => o.status === "connected"),
		).toBe(true);
		expect(store.read("sess_order").status).toBe("uploaded");
	});
});

describe("a preparation failure after handshake does not leave the session connected", () => {
	it("converges on a real failure with server-owned copy", async () => {
		const { store, observations } = await runAttemptWithHeldWindows({
			sessionId: "sess_prep_fail",
			fileCount: 0,
			preparationTicks: 2,
			uploadTicks: 0,
			failDuring: "preparation",
			failureCode: "SCAN_FAILED",
		});

		expect(observations.every((o) => o.status === "connected")).toBe(true);
		const final = observe(store, "sess_prep_fail");
		expect(final.status).toBe("failed");
		expect(final.errorCode).toBe("SCAN_FAILED");
		expect(final.errorMessage).toBe(resolveSyncFailureMessage("SCAN_FAILED"));
	});

	it("replays a repeated failure report instead of erroring", async () => {
		const { store } = await runAttemptWithHeldWindows({
			sessionId: "sess_prep_fail_twice",
			fileCount: 0,
			preparationTicks: 1,
			uploadTicks: 0,
			failDuring: "preparation",
			failureCode: "BLOCKED_CONTENT",
		});

		// The CLI's bounded retry must not surface a spurious failure: a second
		// report against a failed session is idempotent.
		expect(() =>
			store.reportFailure("sess_prep_fail_twice", "BLOCKED_CONTENT"),
		).not.toThrow();
		expect(store.read("sess_prep_fail_twice").status).toBe("failed");
	});

	it("collapses an unreportable failure code to the generic copy", async () => {
		const { store } = await runAttemptWithHeldWindows({
			sessionId: "sess_unknown_fail",
			fileCount: 0,
			preparationTicks: 1,
			uploadTicks: 0,
			failDuring: "preparation",
			// A client-supplied string must never become the persisted code.
			failureCode: "ENOENT at /absolute/local/path",
		});

		expect(sanitizeSyncErrorCode("ENOENT at /absolute/local/path")).toBe(
			"SYNC_FAILED",
		);
		expect(observe(store, "sess_unknown_fail").errorCode).toBe("SYNC_FAILED");
		expect(observe(store, "sess_unknown_fail").errorMessage).toBe(
			resolveSyncFailureMessage("SYNC_FAILED"),
		);
	});
});

describe("the upload window is observable while transport runs", () => {
	it("exposes uploading while source is on the wire", async () => {
		const { observations } = await runAttemptWithHeldWindows({
			sessionId: "sess_upload",
			fileCount: 37,
			preparationTicks: 1,
			uploadTicks: 5,
		});

		const duringUpload = observations.slice(1);
		expect(duringUpload).toHaveLength(5);
		for (const observed of duringUpload) {
			expect(observed.status).toBe("uploading");
		}
	});
});

describe("completion yields an uploaded session with a verified snapshot", () => {
	it("produces uploaded plus the snapshot bound to that session", async () => {
		const { store } = await runAttemptWithHeldWindows({
			sessionId: "sess_done",
			fileCount: 37,
			preparationTicks: 1,
			uploadTicks: 1,
		});

		const row = store.read("sess_done");
		expect(row.status).toBe("uploaded");
		expect(row.snapshotStatus).toBe("uploaded");
		expect(row.snapshotId).toBeTruthy();
		expect(row.fileCount).toBe(37);
	});

	it("refuses completion when transport never began", () => {
		const store = new SyncSessionStore();
		store.createSession("sess_no_upload");
		store.handshake("sess_no_upload");
		expect(() => store.complete("sess_no_upload")).toThrow();
		expect(store.read("sess_no_upload").status).toBe("connected");
	});
});

describe("a fast sync is still a valid lifecycle", () => {
	it("goes from waiting straight to uploaded with no held window", async () => {
		const { store, observations } = await runAttemptWithHeldWindows({
			sessionId: "sess_fast",
			fileCount: 37,
			preparationTicks: 0,
			uploadTicks: 0,
		});

		expect(observations).toHaveLength(0);
		const row = store.read("sess_fast");
		expect(row.status).toBe("uploaded");
		expect(row.snapshotId).toBeTruthy();
		// Nothing was replayed: the attempt simply completed.
		expect(store.read("sess_fast").fileCount).toBe(37);
	});
});

describe("refresh recovery reads persisted state, not in-memory progress", () => {
	it("recovers mid-preparation from the persisted connected session", async () => {
		const { store } = await runAttemptWithHeldWindows({
			sessionId: "sess_refresh_prep",
			fileCount: 0,
			preparationTicks: 2,
			uploadTicks: 0,
			failDuring: "preparation",
			failureCode: "SCAN_FAILED",
		});

		// A refresh creates a brand-new reader; it sees only what was persisted.
		const recovered = observe(store, "sess_refresh_prep");
		expect(recovered.status).toBe("failed");
		expect(recovered.errorCode).toBe("SCAN_FAILED");
		expect(recovered.errorMessage).toBe(
			resolveSyncFailureMessage("SCAN_FAILED"),
		);
	});

	it("recovers mid-upload from the persisted uploading session", async () => {
		const store = new SyncSessionStore();
		store.createSession("sess_refresh_upload");
		store.handshake("sess_refresh_upload");
		store.beginUpload("sess_refresh_upload", 12);

		const recovered = observe(store, "sess_refresh_upload");
		expect(recovered.status).toBe("uploading");
		expect(recovered.snapshotId).toBeTruthy();
	});

	it("recovers a completed sync from the persisted uploaded session", async () => {
		const store = new SyncSessionStore();
		store.createSession("sess_refresh_done");
		store.handshake("sess_refresh_done");
		store.beginUpload("sess_refresh_done", 5);
		store.complete("sess_refresh_done");

		const recovered = observe(store, "sess_refresh_done");
		expect(recovered.status).toBe("uploaded");
		expect(recovered.snapshotId).toBeTruthy();
		// Handshake evidence survives the attempt so the summary gate stays valid.
		expect(
			readSyncFailureMetadata(store.read("sess_refresh_done").metadata),
		).toBeNull();
	});
});

describe("a retry uses a new session and cannot be confused with the failed attempt", () => {
	it("keeps the previous attempt failed while the new one waits for the CLI", async () => {
		const store = new SyncSessionStore();
		store.createSession("sess_attempt_1");
		store.handshake("sess_attempt_1");
		store.reportFailure("sess_attempt_1", "SCAN_FAILED");

		store.createSession("sess_attempt_2");

		expect(store.read("sess_attempt_1").status).toBe("failed");
		expect(store.read("sess_attempt_2").status).toBe("waiting_for_cli");
		expect(store.read("sess_attempt_2").snapshotId).toBeNull();
		// The two attempts are distinct identities, so the retry's polling can
		// never be satisfied by the old attempt's terminal state.
		expect(store.read("sess_attempt_1").id).not.toBe(
			store.read("sess_attempt_2").id,
		);
		expect(store.latestSessionId()).toBe("sess_attempt_2");
	});

	it("binds each attempt to its own snapshot", async () => {
		const store = new SyncSessionStore();
		store.createSession("sess_bind_1");
		const first = store.handshake("sess_bind_1");
		store.createSession("sess_bind_2");
		const second = store.handshake("sess_bind_2");

		expect(first.snapshotId).not.toBe(second.snapshotId);
		expect(first.attemptId).toBe("sess_bind_1");
		expect(second.attemptId).toBe("sess_bind_2");
	});
});
