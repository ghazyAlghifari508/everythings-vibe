import { describe, expect, it } from "vitest";
import {
	resolveSyncStageView,
	SYNC_STAGE_ORDER,
	type SyncStatusResponse,
} from "@/features/codebase/services/sync";

function status(
	overrides: Partial<SyncStatusResponse> = {},
): SyncStatusResponse {
	return {
		projectId: "cb_progress",
		sessionId: "sess_progress",
		status: "waiting_for_cli",
		snapshotId: null,
		...overrides,
	};
}

function syncRow(snapshot: SyncStatusResponse) {
	return resolveSyncStageView(snapshot).stages[
		SYNC_STAGE_ORDER.indexOf("syncing")
	];
}

describe("upload progress counters", () => {
	it("reports determinate progress from persisted files received", () => {
		const row = syncRow(
			status({
				status: "uploading",
				snapshotId: "snap_1",
				manifestCount: 69,
				uploadedCount: 31,
			}),
		);
		expect(row?.state).toBe("active");
		expect(row?.meta).toBe("31 dari 69 file");
		// Never a percentage the server never reported.
		expect(row?.meta).not.toContain("%");
	});

	it("counts a partially uploaded file as not received", () => {
		// The backend only counts a path once every chunk landed, so a file at 0
		// uploaded of 69 announced must not be described as done.
		const row = syncRow(
			status({
				status: "uploading",
				snapshotId: "snap_1",
				manifestCount: 69,
				uploadedCount: 0,
			}),
		);
		expect(row?.meta).toBe("0 dari 69 file");
	});

	it("never invents a zero count when the server reported no total", () => {
		// A freshly handshaken snapshot carries `fileCount: 0`; describing that as
		// "0 file sedang dikirim" would be a fabricated measurement.
		const row = syncRow(
			status({ status: "uploading", snapshotId: "snap_1", fileCount: 0 }),
		);
		expect(row?.state).toBe("active");
		expect(row?.title).toBe("Mengunggah repository...");
		expect(row?.meta).toBeUndefined();
	});

	it("keeps the announced total visible while nothing has landed yet", () => {
		const row = syncRow(
			status({
				status: "uploading",
				snapshotId: "snap_1",
				manifestCount: 12,
			}),
		);
		expect(row?.meta).toBeUndefined();
	});

	it("drops the live counters once the snapshot is verified", () => {
		const row = syncRow(
			status({
				status: "uploaded",
				snapshotId: "snap_1",
				fileCount: 69,
				manifestCount: 69,
				uploadedCount: 69,
			}),
		);
		expect(row?.state).toBe("done");
		expect(row?.detail).toBe("69 file berhasil diterima.");
		expect(row?.meta).toBeUndefined();
	});
});
