import { describe, expect, it } from "vitest";
import type { SyncStatusResponse } from "../services/sync";
import { reconcileSyncStatus } from "../services/sync-status-reconciliation";

const at = (second: number) =>
	new Date(Date.UTC(2026, 10, 8, 0, 0, second)).toISOString();
const status = (
	patch: Partial<SyncStatusResponse> = {},
): SyncStatusResponse => ({
	projectId: "repo",
	sessionId: "session",
	status: "uploading",
	updatedAt: at(10),
	...patch,
});

describe("authoritative sync reconciliation", () => {
	it("ignores duplicate deliveries by identity", () => {
		const current = status();
		expect(reconcileSyncStatus(current, { ...current })).toBe(current);
	});
	it("ignores foreign sessions and repositories", () => {
		const current = status();
		for (const patch of [{ sessionId: "old" }, { projectId: "foreign" }]) {
			expect(
				reconcileSyncStatus(current, status({ ...patch, updatedAt: at(30) })),
			).toBe(current);
		}
	});
	it("keeps transport monotonic even when timestamps tie", () => {
		const current = status({ uploadedCount: 9, manifestCount: 20 });
		expect(reconcileSyncStatus(current, status({ status: "connected" }))).toBe(
			current,
		);
		expect(
			reconcileSyncStatus(
				current,
				status({ uploadedCount: 4, manifestCount: 20 }),
			),
		).toBe(current);
		expect(
			reconcileSyncStatus(
				current,
				status({ uploadedCount: 12, manifestCount: 20 }),
			)?.uploadedCount,
		).toBe(12);
	});
	it("keeps a newer analysis retry over an old failure masked by a session timestamp", () => {
		const current = status({
			status: "uploaded",
			snapshotId: "snapshot",
			updatedAt: at(50),
			analysisAttemptId: "new",
			analysisAttemptStatus: "pending",
			analysisAttemptCreatedAt: at(30),
			analysisAttemptUpdatedAt: at(30),
		});
		const old = status({
			...current,
			analysisAttemptId: "old",
			analysisAttemptStatus: "failed",
			analysisAttemptCreatedAt: at(20),
			analysisAttemptUpdatedAt: at(40),
		});
		expect(reconcileSyncStatus(current, old)).toBe(current);
	});
	it("does not rewind a terminal analysis attempt to pending", () => {
		const current = status({
			analysisAttemptId: "attempt",
			analysisAttemptStatus: "ready",
			analysisAttemptCreatedAt: at(5),
			analysisAttemptUpdatedAt: at(10),
		});
		expect(
			reconcileSyncStatus(
				current,
				status({ ...current, analysisAttemptStatus: "pending" }),
			),
		).toBe(current);
	});
	it("accepts the new retry and immediate completion without pacing", () => {
		const failed = status({
			status: "uploaded",
			snapshotId: "snapshot",
			analysisAttemptId: "old",
			analysisAttemptStatus: "failed",
			analysisAttemptCreatedAt: at(1),
			analysisAttemptUpdatedAt: at(5),
		});
		const retry = status({
			...failed,
			analysisAttemptId: "new",
			analysisAttemptStatus: "pending",
			analysisAttemptCreatedAt: at(20),
			analysisAttemptUpdatedAt: at(20),
		});
		expect(reconcileSyncStatus(failed, retry)).toEqual(retry);
		const ready = {
			...retry,
			analysisAttemptStatus: "ready" as const,
			analysisAttemptUpdatedAt: at(21),
		};
		expect(reconcileSyncStatus(retry, ready)).toEqual(ready);
	});
	it("restores fast completion with the entire persisted chronology", () => {
		const complete = status({
			status: "uploaded",
			snapshotId: "snapshot",
			lifecycle: [
				{ kind: "agent_connected", at: at(1) },
				{ kind: "upload_started", at: at(2) },
				{ kind: "snapshot_persisted", at: at(3), count: 1 },
			],
		});
		const restored = reconcileSyncStatus(
			status({ status: "waiting_for_cli", updatedAt: at(0) }),
			complete,
		);
		expect(restored).toEqual(complete);
	});
});
