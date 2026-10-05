import { describe, expect, it } from "vitest";
import {
	resolveSyncStageView,
	SYNC_STAGE_ORDER,
	SYNC_STAGE_TEST_IDS,
	type SyncStageRow,
	type SyncStatusResponse,
} from "./codebase-sync";

function status(
	overrides: Partial<SyncStatusResponse> = {},
): SyncStatusResponse {
	return {
		projectId: "cb_stage_map",
		sessionId: "sess_stage_map",
		status: "waiting_for_cli",
		snapshotId: null,
		...overrides,
	};
}

function states(view: ReturnType<typeof resolveSyncStageView>): string[] {
	return view.stages.map((row) => row.state);
}

function stage(
	view: ReturnType<typeof resolveSyncStageView>,
	index: number,
): SyncStageRow {
	const row = view.stages[index];
	if (!row) throw new Error(`missing stage at index ${index}`);
	return row;
}

// Backend enum names and the transport vocabulary behind them. None of these may
// reach the user as a label or a description.
const INTERNAL_WORDS = [
	"waiting_for_cli",
	"connected",
	"scanning",
	"filtering",
	"uploading",
	"uploaded",
	"analyzing",
	"failed",
	"expired",
	"handshake",
	"polling",
	"manifest",
	"snapshot",
	"server",
	"state machine",
];

function userFacingCopy(view: ReturnType<typeof resolveSyncStageView>): string {
	return view.stages
		.map((row) => `${row.title} ${row.detail ?? ""} ${row.meta ?? ""}`)
		.join(" ");
}

describe("sync stage vocabulary", () => {
	it("exposes exactly three product stages in a stable order", () => {
		expect(SYNC_STAGE_ORDER).toEqual(["agent", "preparing", "syncing"]);
		expect(Object.keys(SYNC_STAGE_TEST_IDS)).toEqual([
			"agent",
			"preparing",
			"syncing",
		]);
	});

	it("never leaks a backend enum or transport term into user-facing copy", () => {
		const cases: SyncStatusResponse[] = [
			status(),
			status({ status: "connected" }),
			status({ status: "scanning" }),
			status({ status: "filtering" }),
			status({ status: "uploading", fileCount: 37 }),
			status({ status: "uploaded", snapshotId: "snap_1", fileCount: 37 }),
			status({ status: "analyzing", snapshotId: "snap_1" }),
			status({ status: "ready", snapshotId: "snap_1" }),
		];
		for (const input of cases) {
			const copy = userFacingCopy(resolveSyncStageView(input)).toLowerCase();
			for (const word of INTERNAL_WORDS) {
				expect(copy, `${word} leaked for ${input.status}`).not.toContain(word);
			}
		}
	});
});

describe("waiting_for_cli", () => {
	it("puts the agent first and leaves both later stages untouched", () => {
		const view = resolveSyncStageView(status());
		expect(states(view)).toEqual(["waiting", "waiting", "waiting"]);
		expect(stage(view, 0).title).toBe("Menunggu agent");
		expect(stage(view, 0).detail).toBe("Jalankan prompt dari root repository.");
		expect(view.syncComplete).toBe(false);
		expect(view.canRetry).toBe(false);
	});

	it("gives the inactive stages no filler description", () => {
		const view = resolveSyncStageView(status());
		// "This step has not started yet" teaches the user nothing.
		expect(stage(view, 1).detail).toBeUndefined();
		expect(stage(view, 2).detail).toBeUndefined();
		expect(userFacingCopy(view)).not.toMatch(/tahap ini berjalan setelah/i);
		expect(userFacingCopy(view)).not.toMatch(/belum tersinkron/i);
	});
});

describe("connected, scanning and filtering", () => {
	it("share one preparing stage instead of three enum-specific stages", () => {
		for (const value of ["connected", "scanning", "filtering"] as const) {
			const view = resolveSyncStageView(status({ status: value }));
			expect(states(view)).toEqual(["done", "active", "waiting"]);
			expect(stage(view, 0).title).toBe("Agent terhubung");
			expect(stage(view, 1).title).toBe("Menyiapkan source code...");
			expect(stage(view, 1).detail).toBe(
				"Memeriksa file project yang akan disinkronkan.",
			);
			expect(stage(view, 2).title).toBe("Menyinkronkan codebase");
			expect(view.syncComplete).toBe(false);
		}
	});

	it("does not claim files are moving while the project is still being read", () => {
		for (const value of ["connected", "scanning", "filtering"] as const) {
			const view = resolveSyncStageView(status({ status: value }));
			expect(stage(view, 2).state).not.toBe("active");
		}
	});
});

describe("uploading", () => {
	it("completes preparation and moves the sync stage to active", () => {
		const view = resolveSyncStageView(status({ status: "uploading" }));
		expect(states(view)).toEqual(["done", "done", "active"]);
		expect(stage(view, 1).title).toBe("Source code siap");
		expect(stage(view, 1).detail).toBe(
			"File project yang relevan sudah disiapkan.",
		);
		expect(stage(view, 2).title).toBe("Menyinkronkan codebase...");
		expect(stage(view, 2).detail).toBe(
			"Mengirim source code ke VibeEverything.",
		);
	});

	it("shows the real count while files are in flight, and nothing invented", () => {
		const view = resolveSyncStageView(
			status({ status: "uploading", fileCount: 37 }),
		);
		expect(stage(view, 2).meta).toBe("37 file sedang dikirim.");
		expect(userFacingCopy(view)).not.toContain("%");
	});

	it("omits the count when the server has not reported one", () => {
		const view = resolveSyncStageView(status({ status: "uploading" }));
		expect(stage(view, 2).meta).toBeUndefined();
	});
});

describe("completed sync", () => {
	it("marks all three stages done with the received count", () => {
		const view = resolveSyncStageView(
			status({ status: "uploaded", snapshotId: "snap_done", fileCount: 37 }),
		);
		expect(states(view)).toEqual(["done", "done", "done"]);
		expect(stage(view, 2).title).toBe("Sinkronisasi selesai");
		expect(stage(view, 2).detail).toBe("37 file berhasil diterima.");
		expect(view.syncComplete).toBe(true);
	});

	it("completes without a count when the server never reported one", () => {
		const view = resolveSyncStageView(
			status({ status: "uploaded", snapshotId: "snap_nocount" }),
		);
		expect(states(view)).toEqual(["done", "done", "done"]);
		expect(stage(view, 2).detail).toBe("Source code berhasil diterima.");
		expect(stage(view, 2).meta).toBeUndefined();
	});

	it("keeps transport complete while a legacy analyzing session runs", () => {
		const view = resolveSyncStageView(
			status({
				status: "analyzing",
				snapshotId: "snap_an",
				analysisStatus: "pending",
			}),
		);
		expect(states(view)).toEqual(["done", "done", "done"]);
		expect(view.syncComplete).toBe(true);
	});

	it("does not complete on a done status that carries no snapshot", () => {
		// The upload was never verified, so claiming a finished sync would offer
		// a conclusion step that cannot open.
		const view = resolveSyncStageView(
			status({ status: "uploaded", fileCount: 9 }),
		);
		expect(view.syncComplete).toBe(false);
		expect(states(view)).toEqual(["done", "done", "active"]);
	});
});

describe("fast transition", () => {
	it("renders three completed rows with no replayed intermediate state", () => {
		// The browser is not required to observe `connected`, `scanning`,
		// `filtering` or `uploading`; a fast CLI can be first seen as finished.
		const before = resolveSyncStageView(status());
		const after = resolveSyncStageView(
			status({ status: "uploaded", snapshotId: "snap_fast", fileCount: 12 }),
		);
		expect(states(before)).toEqual(["waiting", "waiting", "waiting"]);
		expect(states(after)).toEqual(["done", "done", "done"]);
		expect(stage(after, 0).title).toBe("Agent terhubung");
		expect(stage(after, 1).title).toBe("Source code siap");
		expect(stage(after, 2).title).toBe("Sinkronisasi selesai");
		// Nothing from an intermediate stage survives in the finished copy.
		expect(userFacingCopy(after)).not.toMatch(/Menyiapkan source code\.\.\./);
		expect(userFacingCopy(after)).not.toMatch(/Menyinkronkan codebase\.\.\./);
	});
});

describe("unknown and failed attempts", () => {
	it("withholds the stage list until the server has actually reported", () => {
		const view = resolveSyncStageView(null);
		expect(view.hasStatus).toBe(false);
		expect(view.stages).toEqual([]);
		expect(view.failed).toBe(false);
		expect(view.canRetry).toBe(false);
	});

	it("withholds the stage list on failure instead of inventing progress", () => {
		// The status does not record which step broke, so any completed checkmark
		// here would be a claim the server never made.
		const view = resolveSyncStageView(
			status({
				status: "failed",
				errorCode: "SNAPSHOT_INCOMPLETE",
				errorMessage: "Snapshot tidak lengkap.",
			}),
		);
		expect(view.failed).toBe(true);
		expect(view.stages).toEqual([]);
		expect(view.canRetry).toBe(true);
		expect(view.errorMessage).toBe("Snapshot tidak lengkap.");
		expect(view.retryHint).toContain("jalankan ulang prompt");
	});

	it("gives expiry its own recovery guidance", () => {
		const view = resolveSyncStageView(status({ status: "expired" }));
		expect(view.failed).toBe(true);
		expect(view.retryHint).toContain("kedaluwarsa");
		expect(view.canRetry).toBe(true);
	});

	it("never presents analysis as part of the sync stages", () => {
		for (const value of [
			"waiting_for_cli",
			"connected",
			"uploading",
			"uploaded",
			"analyzing",
			"ready",
		] as const) {
			const view = resolveSyncStageView(
				status({ status: value, snapshotId: "snap_none" }),
			);
			expect(userFacingCopy(view)).not.toMatch(/menganalisis codebase/i);
			expect(userFacingCopy(view)).not.toMatch(/analisis codebase selesai/i);
			expect(userFacingCopy(view)).not.toContain("%");
		}
	});
});

describe("exclusion count", () => {
	it("is reported only once the server has it", () => {
		expect(resolveSyncStageView(status()).excludedCount).toBeUndefined();
		expect(
			resolveSyncStageView(
				status({ status: "uploaded", snapshotId: "snap_x", excludedCount: 6 }),
			).excludedCount,
		).toBe(6);
	});
});
