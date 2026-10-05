import { describe, expect, it, vi } from "vitest";
import {
	resolveSyncStageView,
	SYNC_STAGE_ORDER,
	SYNC_STAGE_TEST_IDS,
	type SyncStatusResponse,
} from "@/lib/codebase-sync";

/**
 * Presentation only: this file proves that whatever status the browser receives
 * maps to the three product stages without leaking an internal enum name.
 *
 * It deliberately does NOT claim that production can observe every status — that
 * is the temporal contract covered by the CLI/server ordering tests and the
 * reconciliation hook tests. A mapper test that fed `connected` by hand proves
 * nothing about whether a real session ever spends time there.
 */

function status(
	overrides: Partial<SyncStatusResponse> = {},
): SyncStatusResponse {
	return {
		projectId: "cb_temporal_map",
		sessionId: "sess_temporal_map",
		status: "waiting_for_cli",
		snapshotId: null,
		...overrides,
	};
}

describe("preparation is described by the work it covers, not by an enum name", () => {
	it("names the local preparation the connected window actually spans", () => {
		const view = resolveSyncStageView(status({ status: "connected" }));
		const preparing = view.stages[SYNC_STAGE_ORDER.indexOf("preparing")];
		expect(preparing?.state).toBe("active");
		// The copy must describe preparing source code, which is the real work
		// the CLI performs while the session sits at `connected`.
		expect(preparing?.title).toBe("Menyiapkan source code...");
		expect(preparing?.detail).toContain("Memeriksa file project");
	});

	it("completes the agent row once the handshake is persisted", () => {
		const view = resolveSyncStageView(status({ status: "connected" }));
		const agent = view.stages[SYNC_STAGE_ORDER.indexOf("agent")];
		expect(agent?.state).toBe("done");
		expect(agent?.title).toBe("Agent terhubung");
	});

	it("leaves the sync row untouched while source is still being prepared", () => {
		const view = resolveSyncStageView(status({ status: "connected" }));
		const syncing = view.stages[SYNC_STAGE_ORDER.indexOf("syncing")];
		expect(syncing?.state).toBe("waiting");
		expect(syncing?.title).toBe("Menyinkronkan codebase");
	});
});

describe("the upload stage matches real transport", () => {
	it("claims files are moving only once the server persisted uploading", () => {
		const view = resolveSyncStageView(
			status({ status: "uploading", snapshotId: "snap_1", fileCount: 37 }),
		);
		const syncing = view.stages[SYNC_STAGE_ORDER.indexOf("syncing")];
		expect(syncing?.state).toBe("active");
		expect(syncing?.title).toBe("Menyinkronkan codebase...");
		expect(syncing?.detail).toContain("Mengirim source code");
		// The count is server data, so it is shown rather than invented.
		expect(syncing?.meta).toContain("37");
	});

	it("completes preparation only once transport has begun", () => {
		const view = resolveSyncStageView(
			status({ status: "uploading", snapshotId: "snap_1" }),
		);
		const preparing = view.stages[SYNC_STAGE_ORDER.indexOf("preparing")];
		expect(preparing?.state).toBe("done");
		expect(preparing?.title).toBe("Source code siap");
	});
});

describe("completion requires a verified snapshot, not a status string alone", () => {
	it("reports the received count when the server verified the snapshot", () => {
		const view = resolveSyncStageView(
			status({ status: "uploaded", snapshotId: "snap_1", fileCount: 37 }),
		);
		expect(view.syncComplete).toBe(true);
		const syncing = view.stages[SYNC_STAGE_ORDER.indexOf("syncing")];
		expect(syncing?.state).toBe("done");
		expect(syncing?.detail).toContain("37 file berhasil diterima");
	});

	it("will not complete on an uploaded status that carries no snapshot", () => {
		const view = resolveSyncStageView(status({ status: "uploaded" }));
		expect(view.syncComplete).toBe(false);
	});
});

describe("a fast sync stays truthful", () => {
	it("renders three completed rows straight from waiting to uploaded", () => {
		const view = resolveSyncStageView(
			status({ status: "uploaded", snapshotId: "snap_1", fileCount: 37 }),
		);
		expect(view.stages.map((row) => row.state)).toEqual([
			"done",
			"done",
			"done",
		]);
		// No replayed intermediate: nothing claims a stage the server skipped.
		expect(
			view.stages.some(
				(row) =>
					row.title.includes("Menyiapkan") ||
					row.title.includes("Menyinkronkan"),
			),
		).toBe(false);
	});
});

describe("a reported preparation failure converges on a real failure state", () => {
	it("withholds stages and surfaces the server-owned failure copy", () => {
		const view = resolveSyncStageView(
			status({
				status: "failed",
				errorCode: "SCAN_FAILED",
				errorMessage: "CLI gagal membaca repository.",
			}),
		);
		expect(view.failed).toBe(true);
		expect(view.stages).toEqual([]);
		expect(view.errorMessage).toBe("CLI gagal membaca repository.");
		expect(view.canRetry).toBe(true);
	});
});

describe("presentation surfaces never invent a stage", () => {
	it("renders nothing at all before the server has answered", () => {
		expect(resolveSyncStageView(null).stages).toEqual([]);
	});

	it("keeps every internal enum out of the rendered copy", () => {
		const internals = [
			"waiting_for_cli",
			"connected",
			"scanning",
			"filtering",
			"uploading",
			"uploaded",
			"analyzing",
			"handshake",
		];
		for (const current of [
			"waiting_for_cli",
			"connected",
			"uploading",
		] as const) {
			const view = resolveSyncStageView(
				status({
					status: current,
					snapshotId: current === "waiting_for_cli" ? null : "snap_1",
				}),
			);
			const copy = view.stages
				.map((row) => `${row.title} ${row.detail ?? ""} ${row.meta ?? ""}`)
				.join(" ");
			for (const word of internals) {
				expect(copy.toLowerCase(), `${current}/${word}`).not.toContain(word);
			}
		}
	});
});

describe("stage rows are addressable and stable", () => {
	it("exposes a test id per product stage", () => {
		expect(Object.keys(SYNC_STAGE_TEST_IDS).sort()).toEqual(
			[...SYNC_STAGE_ORDER].sort(),
		);
	});
});

describe("no fake pacing exists in the presentation layer", () => {
	it("renders synchronously from the status it is given", () => {
		vi.useFakeTimers();
		try {
			const view = resolveSyncStageView(status({ status: "connected" }));
			// No timer was scheduled and no state advanced: advancing the clock
			// changes nothing about what the mapper reports.
			vi.advanceTimersByTime(60_000);
			expect(
				resolveSyncStageView(status({ status: "connected" })).stages,
			).toEqual(view.stages);
		} finally {
			vi.useRealTimers();
		}
	});
});
