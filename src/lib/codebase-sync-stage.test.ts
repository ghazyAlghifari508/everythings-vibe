import { describe, expect, it } from "vitest";
import {
	isSyncTransportActive,
	resolveSyncStageView,
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

describe("isSyncTransportActive", () => {
	it("counts only the upload chain as transport work", () => {
		expect(isSyncTransportActive("scanning")).toBe(true);
		expect(isSyncTransportActive("filtering")).toBe(true);
		expect(isSyncTransportActive("uploading")).toBe(true);
	});

	it("never counts the handshake or a finished snapshot as transport work", () => {
		// `connected` is the trap: the handshake alone is not upload progress, so
		// treating it as active would claim files are moving before any do.
		expect(isSyncTransportActive("connected")).toBe(false);
		expect(isSyncTransportActive("waiting_for_cli")).toBe(false);
		expect(isSyncTransportActive("uploaded")).toBe(false);
		expect(isSyncTransportActive("analyzing")).toBe(false);
		expect(isSyncTransportActive("ready")).toBe(false);
		expect(isSyncTransportActive("failed")).toBe(false);
		expect(isSyncTransportActive("expired")).toBe(false);
	});
});

describe("resolveSyncStageView waiting", () => {
	it("reports an honest standby when the server waits for the CLI", () => {
		const view = resolveSyncStageView(status());
		expect(view.hasStatus).toBe(true);
		expect(view.repository.state).toBe("idle");
		expect(view.repository.title).toBe("Menunggu agent terhubung");
		expect(view.repository.detail).toBe(
			"Jalankan prompt dari root repository.",
		);
		expect(view.source.state).toBe("pending");
		expect(view.syncComplete).toBe(false);
		expect(view.canRetry).toBe(false);
	});

	it("does not claim a linked repository before any handshake", () => {
		const view = resolveSyncStageView(status({ status: "failed" }));
		expect(view.repository.state).toBe("failed");
	});

	it("separates 'browser has not asked yet' from 'server says no CLI'", () => {
		const view = resolveSyncStageView(null);
		expect(view.hasStatus).toBe(false);
		expect(view.repository.state).toBe("pending");
		expect(view.repository.title).not.toContain("Menunggu agent terhubung");
		expect(view.syncComplete).toBe(false);
	});
});

describe("resolveSyncStageView connected", () => {
	it("marks the repository linked as soon as the handshake is observed", () => {
		const view = resolveSyncStageView(status({ status: "connected" }));
		expect(view.repository.state).toBe("done");
		expect(view.repository.title).toBe("Repository terhubung");
		expect(view.repository.detail).toBe(
			"Agent berhasil tersambung ke VibeEverything.",
		);
		// A handshake is not upload work.
		expect(view.source.state).toBe("pending");
		expect(view.syncComplete).toBe(false);
	});

	it("accepts a persisted handshake timestamp with no intermediate poll", () => {
		const view = resolveSyncStageView(
			status({
				status: "uploading",
				cliConnectedAt: "2026-09-19T10:00:00.000Z",
				fileCount: 12,
			}),
		);
		expect(view.repository.state).toBe("done");
		expect(view.source.state).toBe("active");
		expect(view.source.title).toBe("Menyinkronkan source code...");
		expect(view.source.detail).toBe("Repository sedang dikirim.");
		expect(view.source.meta).toBe("12 file");
	});

	it("drives the same active source stage across the whole upload chain", () => {
		for (const statusValue of ["scanning", "filtering", "uploading"] as const) {
			const view = resolveSyncStageView(status({ status: statusValue }));
			expect(view.repository.state).toBe("done");
			expect(view.source.state).toBe("active");
			expect(view.source.title).toBe("Menyinkronkan source code...");
		}
	});
});

describe("resolveSyncStageView complete", () => {
	it("completes both stages on an uploaded snapshot and reports the count", () => {
		const view = resolveSyncStageView(
			status({
				status: "uploaded",
				snapshotId: "snap_done",
				fileCount: 37,
				excludedCount: 6,
			}),
		);
		expect(view.repository.state).toBe("done");
		expect(view.source.state).toBe("done");
		expect(view.source.title).toBe("Source code tersinkron");
		expect(view.source.detail).toBe("37 file berhasil diterima.");
		expect(view.excludedCount).toBe(6);
		expect(view.syncComplete).toBe(true);
		expect(view.errorMessage).toBeNull();
	});

	it("completes without a count when the server never reported one", () => {
		const view = resolveSyncStageView(
			status({ status: "uploaded", snapshotId: "snap_nocount" }),
		);
		expect(view.source.state).toBe("done");
		expect(view.source.detail).toBe("Repository berhasil diterima.");
		expect(view.source.meta).toBeUndefined();
	});

	it("keeps transport complete while a legacy analyzing session runs", () => {
		const view = resolveSyncStageView(
			status({
				status: "analyzing",
				snapshotId: "snap_an",
				analysisStatus: "pending",
			}),
		);
		expect(view.source.state).toBe("done");
		expect(view.syncComplete).toBe(true);
	});

	it("does not complete on an uploaded row that carries no snapshot", () => {
		// `uploaded` without a snapshot id is a contradictory server row. Claiming
		// a finished sync there would hand the user a step that cannot be opened.
		const view = resolveSyncStageView(
			status({ status: "uploaded", fileCount: 9 }),
		);
		expect(view.syncComplete).toBe(false);
		expect(view.source.state).not.toBe("done");
		expect(view.source.meta).toBe("9 file");
	});
});

describe("resolveSyncStageView failure", () => {
	it("reports a failed transport as a failure on both stages", () => {
		const view = resolveSyncStageView(
			status({
				status: "failed",
				errorCode: "SNAPSHOT_INCOMPLETE",
				errorMessage: "Snapshot tidak lengkap.",
			}),
		);
		expect(view.repository.state).toBe("failed");
		expect(view.repository.title).toBe("Sinkronisasi belum berhasil");
		expect(view.repository.detail).toBe("Snapshot tidak lengkap.");
		expect(view.source.state).toBe("failed");
		expect(view.canRetry).toBe(true);
		expect(view.syncComplete).toBe(false);
		expect(view.errorMessage).toBe("Snapshot tidak lengkap.");
	});

	it("falls back to generic copy when the server sent no safe message", () => {
		const view = resolveSyncStageView(status({ status: "failed" }));
		expect(view.repository.detail).toBe("Repository gagal dikirim.");
	});

	it("gives expiry its own recovery guidance", () => {
		const view = resolveSyncStageView(status({ status: "expired" }));
		expect(view.repository.state).toBe("failed");
		expect(view.repository.detail).toContain("kedaluwarsa");
		expect(view.canRetry).toBe(true);
	});

	it("suppresses an analysis-sourced message once the transport finished", () => {
		// The status endpoint reuses `errorMessage` for analysis failures. On a
		// completed sync that is a conclusion problem, not a transport one.
		const view = resolveSyncStageView(
			status({
				status: "uploaded",
				snapshotId: "snap_an_err",
				analysisStatus: "failed",
				errorMessage: "Analisis codebase gagal.",
			}),
		);
		expect(view.syncComplete).toBe(true);
		expect(view.errorMessage).toBeNull();
	});

	it("never fabricates an analysis stage", () => {
		for (const statusValue of [
			"waiting_for_cli",
			"connected",
			"uploading",
			"uploaded",
			"analyzing",
			"ready",
			"failed",
			"expired",
		] as const) {
			const view = resolveSyncStageView(
				status({ status: statusValue, snapshotId: "snap_none" }),
			);
			const rendered = `${view.repository.title} ${view.source.title}`;
			expect(rendered).not.toMatch(/menganalisis codebase/i);
			expect(rendered).not.toMatch(/analisis codebase selesai/i);
			expect(rendered).not.toContain("%");
		}
	});
});
