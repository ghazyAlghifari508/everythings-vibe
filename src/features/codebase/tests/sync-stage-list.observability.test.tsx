// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncStatusResponse } from "@/features/codebase/services/sync";
import { SyncStageList } from "../components/workspace/sync-stage-list";

/**
 * The sync screen's honest-progress contract.
 *
 * A fast CLI can finish before the browser's first poll. The list must then
 * report the completed work with its real timestamps — never replay a stage as
 * if it were still running, and never mark a stage active after the backend
 * has already completed it.
 */

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
	(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	if (root) {
		const r = root;
		act(() => {
			r.unmount();
		});
		root = null;
	}
	container?.remove();
	document.body.innerHTML = "";
	vi.useRealTimers();
});

function status(
	overrides: Partial<SyncStatusResponse> = {},
): SyncStatusResponse {
	return {
		projectId: "cb_ui",
		sessionId: "sess_ui",
		status: "waiting_for_cli",
		snapshotId: null,
		...overrides,
	};
}

function render(
	statusValue: SyncStatusResponse | null,
	props: Partial<React.ComponentProps<typeof SyncStageList>> = {},
) {
	act(() => {
		root?.render(<SyncStageList status={statusValue} {...props} />);
	});
}

function states(): Array<string | null> {
	return ["sync-stage-agent", "sync-stage-preparing", "sync-stage-sync"].map(
		(testId) =>
			container
				.querySelector(`[data-testid="${testId}"]`)
				?.getAttribute("data-stage-state") ?? null,
	);
}

describe("SyncStageList fast-sync reporting", () => {
	it("shows completed stages with real clock times instead of fake activity", () => {
		render(
			status({
				status: "uploaded",
				snapshotId: "snap_ui",
				fileCount: 12,
				lifecycle: [
					{ kind: "agent_connected", at: "2026-02-01T10:00:00.000Z" },
					{ kind: "upload_started", at: "2026-02-01T10:00:12.000Z" },
					{
						kind: "snapshot_persisted",
						at: "2026-02-01T10:00:20.000Z",
						count: 12,
					},
				],
			}),
		);
		expect(states()).toEqual(["done", "done", "done"]);
		// No stage is still spinning after the backend finished it.
		expect(container.querySelectorAll(".animate-spin")).toHaveLength(0);
		// Real timestamps are rendered for the stages that have them.
		expect(container.textContent).toMatch(/\d{2}\.\d{2}\.\d{2}/);
	});

	it("shows a measured elapsed timer only for a genuinely active stage", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-02-01T10:00:30.000Z"));
		render(
			status({
				status: "uploading",
				snapshotId: "snap_ui",
				fileCount: 12,
				lifecycle: [
					{ kind: "agent_connected", at: "2026-02-01T10:00:00.000Z" },
					{ kind: "upload_started", at: "2026-02-01T10:00:20.000Z" },
				],
			}),
		);
		expect(states()).toEqual(["done", "done", "active"]);
		const timer = container.querySelector("[role='timer']");
		expect(timer?.textContent).toBe("10.0s");
	});

	it("renders no timer when the server recorded no start", () => {
		render(
			status({ status: "uploading", snapshotId: "snap_ui", fileCount: 4 }),
		);
		expect(states()).toEqual(["done", "done", "active"]);
		expect(container.querySelector("[role='timer']")).toBeNull();
	});

	it("presents a running analysis as active from its persisted attempt", () => {
		render(
			status({
				status: "uploaded",
				snapshotId: "snap_ui",
				fileCount: 4,
				analysisAttemptStatus: "pending",
				analysisAttemptCreatedAt: "2026-02-01T10:00:00.000Z",
			}),
		);
		const analysis = container.querySelector(
			"[data-testid='sync-stage-analysis']",
		);
		expect(analysis?.getAttribute("data-stage-state")).toBe("active");
		expect(analysis?.textContent).toContain("Menganalisis repository");
		expect(analysis?.querySelector("[role='timer']")).not.toBeNull();
	});

	it("keeps a usable ready analysis visible over a newer failed retry", () => {
		render(
			status({
				status: "uploaded",
				snapshotId: "snap_ui",
				fileCount: 4,
				analysisStatus: "ready",
				analysisAttemptStatus: "failed",
			}),
			{ isAnalysisReady: true },
		);
		const analysis = container.querySelector(
			"[data-testid='sync-stage-analysis']",
		);
		expect(analysis?.getAttribute("data-stage-state")).toBe("done");
		expect(analysis?.textContent).toContain("Analisis selesai");
	});

	it("reads a server-ready analysis as preparing until this client holds its output", () => {
		// Status naming a ready row is not the same fact as the browser holding a
		// usable output: the row must not claim success next to a closed
		// conclusion, and it must never report the newer failed retry instead.
		render(
			status({
				status: "uploaded",
				snapshotId: "snap_ui",
				fileCount: 4,
				analysisStatus: "ready",
				analysisAttemptStatus: "failed",
			}),
		);
		const analysis = container.querySelector(
			"[data-testid='sync-stage-analysis']",
		);
		expect(analysis?.getAttribute("data-stage-state")).toBe("waiting");
		expect(analysis?.textContent).toContain("Menyiapkan kesimpulan...");
		expect(analysis?.textContent).not.toContain("Analisis belum berhasil");
	});

	it("repaints a persisted standby session as idle instead of starting motion", () => {
		// Refresh and stream reconnect both replay the current persisted state. A
		// waiting session must stay waiting — no spinner, no timer — rather than
		// appearing to begin a connection the server never observed.
		render(status());
		expect(states()).toEqual(["waiting", "waiting", "waiting"]);
		expect(container.querySelectorAll('[data-testid="spinner"]')).toHaveLength(
			0,
		);
		expect(container.querySelector("[role='timer']")).toBeNull();
		render(status({ updatedAt: "2026-02-01T10:05:00.000Z" }));
		expect(states()).toEqual(["waiting", "waiting", "waiting"]);
		expect(container.querySelectorAll('[data-testid="spinner"]')).toHaveLength(
			0,
		);
	});

	it("keeps a persisted upload running after a repaint", () => {
		const uploading = status({
			status: "uploading",
			snapshotId: "snap_ui",
			fileCount: 12,
			lifecycle: [
				{ kind: "agent_connected", at: "2026-02-01T10:00:00.000Z" },
				{ kind: "upload_started", at: "2026-02-01T10:00:20.000Z" },
			],
		});
		render(uploading);
		expect(states()).toEqual(["done", "done", "active"]);
		// The replayed frame is the same persisted attempt: completed rows stay
		// completed and the active row is still the one genuinely in flight.
		render(uploading);
		expect(states()).toEqual(["done", "done", "active"]);
	});

	it("does not reset completed stages when the finished state is re-delivered", () => {
		const finished = status({
			status: "uploaded",
			snapshotId: "snap_ui",
			fileCount: 12,
			lifecycle: [
				{ kind: "agent_connected", at: "2026-02-01T10:00:00.000Z" },
				{
					kind: "snapshot_persisted",
					at: "2026-02-01T10:00:20.000Z",
					count: 12,
				},
			],
		});
		render(finished);
		expect(states()).toEqual(["done", "done", "done"]);
		render(finished);
		expect(states()).toEqual(["done", "done", "done"]);
		expect(container.querySelectorAll(".animate-spin")).toHaveLength(0);
	});

	it("withholds the list entirely while the server has not answered", () => {
		render(null);
		expect(container.querySelectorAll("[data-stage-state]")).toHaveLength(0);
	});
});
