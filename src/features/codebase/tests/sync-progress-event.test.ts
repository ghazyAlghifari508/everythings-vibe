import { describe, expect, it } from "vitest";
import type { SyncStatusResponse } from "@/features/codebase/services/sync";
import {
	SYNC_PROGRESS_EVENT_NAME,
	SYNC_PROGRESS_HEARTBEAT_FRAME,
	syncProgressEventId,
	syncProgressFrame,
} from "@/features/codebase/services/sync-progress-event";

function status(
	overrides: Partial<SyncStatusResponse> = {},
): SyncStatusResponse {
	return {
		projectId: "cb_stream",
		sessionId: "sess_stream",
		status: "waiting_for_cli",
		snapshotId: null,
		...overrides,
	};
}

describe("sync progress event identity", () => {
	it("takes the newest persisted timestamp, so an id only moves forward", () => {
		const waiting = status({ updatedAt: "2026-02-01T10:00:00.000Z" });
		const connected = status({
			status: "connected",
			updatedAt: "2026-02-01T10:00:05.000Z",
			cliConnectedAt: "2026-02-01T10:00:05.000Z",
		});
		expect(Number(syncProgressEventId(connected))).toBeGreaterThan(
			Number(syncProgressEventId(waiting)),
		);
	});

	it("moves forward when only the analysis attempt changed", () => {
		// The session row does not move when the model finishes, so the analysis
		// timestamps must participate or the frame would keep the old id.
		const pending = status({
			status: "uploaded",
			snapshotId: "snap_1",
			updatedAt: "2026-02-01T10:00:00.000Z",
			analysisAttemptStatus: "pending",
			analysisAttemptUpdatedAt: "2026-02-01T10:00:10.000Z",
		});
		const ready = status({
			status: "uploaded",
			snapshotId: "snap_1",
			updatedAt: "2026-02-01T10:00:00.000Z",
			analysisAttemptStatus: "ready",
			analysisAttemptUpdatedAt: "2026-02-01T10:00:30.000Z",
		});
		expect(Number(syncProgressEventId(ready))).toBeGreaterThan(
			Number(syncProgressEventId(pending)),
		);
	});

	it("reports a stable id when the server recorded no timestamps at all", () => {
		expect(syncProgressEventId(status())).toBe("0");
	});
});

describe("sync progress frames", () => {
	it("carries the full snapshot under a named event", () => {
		const snapshot = status({
			status: "uploading",
			snapshotId: "snap_1",
			updatedAt: "2026-02-01T10:00:05.000Z",
			manifestCount: 69,
			uploadedCount: 31,
		});
		const frame = syncProgressFrame(snapshot);
		expect(frame.startsWith(`id: ${syncProgressEventId(snapshot)}\n`)).toBe(
			true,
		);
		expect(frame).toContain(`event: ${SYNC_PROGRESS_EVENT_NAME}\n`);
		expect(frame.endsWith("\n\n")).toBe(true);

		const dataLine = frame
			.split("\n")
			.find((line) => line.startsWith("data: "));
		expect(dataLine).toBeDefined();
		// Replaying a frame is idempotent: the payload is the whole reconciled state.
		expect(JSON.parse((dataLine as string).slice(6))).toEqual(snapshot);
	});

	it("sends heartbeats as comments so they can never be mistaken for a stage", () => {
		expect(SYNC_PROGRESS_HEARTBEAT_FRAME.startsWith(":")).toBe(true);
		expect(SYNC_PROGRESS_HEARTBEAT_FRAME).not.toContain("data:");
	});
});
