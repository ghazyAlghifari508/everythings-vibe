import { describe, expect, it } from "vitest";
import {
	appendSyncLifecycleEvent,
	readSyncLifecycle,
	readSyncLifecycleAt,
	resolveSyncStageView,
	SYNC_LIFECYCLE_MAX_EVENTS,
	type SyncStatusResponse,
} from "@/lib/codebase-sync";

/**
 * Fast-sync observability contract.
 *
 * The browser cannot poll fast enough to observe every real transition of a
 * quick CLI run. These tests pin the honest answer: the server records each
 * transition with its own timestamp, the mapper surfaces those timestamps on
 * the stages they belong to, and nothing is ever marked active once the
 * backend has already completed it.
 */

const T0 = new Date("2026-02-01T10:00:00.000Z");
const T1 = new Date("2026-02-01T10:00:12.000Z");
const T2 = new Date("2026-02-01T10:00:20.000Z");

function status(
	overrides: Partial<SyncStatusResponse> = {},
): SyncStatusResponse {
	return {
		projectId: "cb_obs",
		sessionId: "sess_obs",
		status: "waiting_for_cli",
		snapshotId: null,
		...overrides,
	};
}

describe("persisted lifecycle log", () => {
	it("appends real transitions in order with their timestamps", () => {
		let metadata = appendSyncLifecycleEvent({
			previous: null,
			kind: "agent_connected",
			at: T0,
		});
		metadata = appendSyncLifecycleEvent({
			previous: metadata,
			kind: "upload_started",
			at: T1,
		});
		metadata = appendSyncLifecycleEvent({
			previous: metadata,
			kind: "snapshot_persisted",
			at: T2,
			count: 37,
		});
		const log = readSyncLifecycle(metadata);
		expect(log.map((event) => event.kind)).toEqual([
			"agent_connected",
			"upload_started",
			"snapshot_persisted",
		]);
		expect(log.map((event) => event.at)).toEqual([
			T0.toISOString(),
			T1.toISOString(),
			T2.toISOString(),
		]);
		expect(log[2].count).toBe(37);
	});

	it("is idempotent per kind so a replay cannot move a timestamp forward", () => {
		let metadata = appendSyncLifecycleEvent({
			previous: null,
			kind: "agent_connected",
			at: T0,
		});
		metadata = appendSyncLifecycleEvent({
			previous: metadata,
			kind: "agent_connected",
			at: T2,
		});
		expect(readSyncLifecycle(metadata)).toHaveLength(1);
		expect(readSyncLifecycleAt(metadata, "agent_connected")).toBe(
			T0.toISOString(),
		);
	});

	it("preserves unrelated metadata written by earlier writers", () => {
		const metadata = appendSyncLifecycleEvent({
			previous: { handshakeAt: T0.toISOString(), custom: "kept" },
			kind: "upload_started",
			at: T1,
		});
		expect(metadata.custom).toBe("kept");
		expect(metadata.handshakeAt).toBe(T0.toISOString());
	});

	it("drops corrupt entries instead of throwing", () => {
		expect(
			readSyncLifecycle({ lifecycle: [{ kind: "not-a-kind", at: "x" }] }),
		).toEqual([]);
		expect(readSyncLifecycle({ lifecycle: "nope" })).toEqual([]);
		expect(readSyncLifecycle(null)).toEqual([]);
	});

	it("stays bounded", () => {
		let metadata: unknown = null;
		for (let index = 0; index < SYNC_LIFECYCLE_MAX_EVENTS + 10; index += 1) {
			metadata = {
				...((metadata as Record<string, unknown>) ?? {}),
				lifecycle: [
					...(readSyncLifecycle(metadata) as unknown[]),
					{ kind: "upload_started", at: T0.toISOString() },
				],
			};
		}
		expect(readSyncLifecycle(metadata).length).toBeLessThanOrEqual(
			SYNC_LIFECYCLE_MAX_EVENTS,
		);
	});
});

describe("stage view reports real history for a fast sync", () => {
	it("attaches the recorded completion time to each finished stage", () => {
		const view = resolveSyncStageView(
			status({
				status: "uploaded",
				snapshotId: "snap_1",
				fileCount: 37,
				lifecycle: [
					{ kind: "agent_connected", at: T0.toISOString() },
					{ kind: "upload_started", at: T1.toISOString() },
					{
						kind: "snapshot_persisted",
						at: T2.toISOString(),
						count: 37,
					},
				],
			}),
		);
		expect(view.stages.map((row) => row.state)).toEqual([
			"done",
			"done",
			"done",
		]);
		expect(view.stages[0].completedAt).toBe(T0.toISOString());
		expect(view.stages[2].completedAt).toBe(T2.toISOString());
		// The verified count from the persisted event wins over the polled field.
		expect(view.stages[2].detail).toBe("37 file berhasil diterima.");
		// Nothing is still claimed active after the backend finished it.
		expect(view.stages.some((row) => row.state === "active")).toBe(false);
	});

	it("measures the active stage from the recorded start, not from mount", () => {
		const view = resolveSyncStageView(
			status({
				status: "uploading",
				snapshotId: "snap_1",
				fileCount: 12,
				lifecycle: [
					{ kind: "agent_connected", at: T0.toISOString() },
					{ kind: "upload_started", at: T1.toISOString() },
				],
			}),
		);
		expect(view.stages[1].state).toBe("done");
		expect(view.stages[2].state).toBe("active");
		expect(view.stages[2].startedAt).toBe(T1.toISOString());
	});

	it("still shows preparation as active while only the handshake is recorded", () => {
		const view = resolveSyncStageView(
			status({
				status: "connected",
				snapshotId: "snap_1",
				lifecycle: [{ kind: "agent_connected", at: T0.toISOString() }],
			}),
		);
		expect(view.stages.map((row) => row.state)).toEqual([
			"done",
			"active",
			"waiting",
		]);
		expect(view.stages[1].startedAt).toBe(T0.toISOString());
	});

	it("renders no timestamp when the server never recorded one", () => {
		const view = resolveSyncStageView(
			status({ status: "uploaded", snapshotId: "snap_1", fileCount: 5 }),
		);
		for (const row of view.stages) {
			expect(row.completedAt).toBeUndefined();
			expect(row.startedAt).toBeUndefined();
		}
	});

	it("falls back to the persisted handshake column for older sessions", () => {
		const view = resolveSyncStageView(
			status({
				status: "connected",
				snapshotId: "snap_1",
				cliConnectedAt: T1.toISOString(),
			}),
		);
		expect(view.stages[0].completedAt).toBe(T1.toISOString());
		expect(view.stages[1].startedAt).toBe(T1.toISOString());
	});
});
