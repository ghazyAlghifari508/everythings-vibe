// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SyncStatusResponse } from "@/lib/codebase-sync";
import { SyncStatus } from "./sync-status";

let container: HTMLDivElement;
let root: Root | null = null;

afterEach(() => {
	if (root) {
		const r = root;
		act(() => {
			r.unmount();
		});
		root = null;
	}
	container?.remove();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

function statusResponse(
	overrides: Partial<SyncStatusResponse> = {},
): SyncStatusResponse {
	return {
		projectId: "proj_stage_1",
		sessionId: "sess_stage_1",
		status: "waiting_for_cli",
		...overrides,
	};
}

function mockStatusSequence(responses: SyncStatusResponse[]) {
	let calls = 0;
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => {
			const next = responses[Math.min(calls, responses.length - 1)];
			calls += 1;
			return { ok: true, status: 200, json: async () => next };
		}),
	);
}

function renderStatus(
	props: Partial<React.ComponentProps<typeof SyncStatus>> = {},
) {
	container = document.createElement("div");
	document.body.appendChild(container);
	const nextRoot = createRoot(container);
	root = nextRoot;
	act(() => {
		nextRoot.render(
			<SyncStatus projectId="proj_stage_1" pollIntervalMs={15} {...props} />,
		);
	});
	return container;
}

async function settle(ms = 60) {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, ms));
	});
}

function stageState(c: HTMLDivElement, testid: string): string | null {
	return (
		c
			.querySelector(`[data-testid="${testid}"]`)
			?.getAttribute("data-stage-state") ?? null
	);
}

describe("SyncStatus two sync stages", () => {
	it("waiting_for_cli keeps both sync stages unstarted with an honest waiting state", async () => {
		mockStatusSequence([statusResponse({ status: "waiting_for_cli" })]);
		const c = renderStatus();
		await settle();
		expect(stageState(c, "sync-stage-connection")).toBe("idle");
		expect(stageState(c, "sync-stage-upload")).toBe("pending");
		expect(c.textContent).toContain("Menunggu agent terhubung");
		expect(c.textContent).toContain("Jalankan prompt dari root repository.");
		expect(c.querySelector('[data-testid="cli-waiting-alert"]')).not.toBeNull();
	});

	it("connected marks repository linked without implying upload progress", async () => {
		mockStatusSequence([statusResponse({ status: "connected" })]);
		const c = renderStatus();
		await settle();
		expect(stageState(c, "sync-stage-connection")).toBe("done");
		expect(stageState(c, "sync-stage-upload")).toBe("pending");
		expect(c.textContent).toContain("Repository terhubung");
		expect(c.textContent).toContain(
			"Agent berhasil tersambung ke VibeEverything.",
		);
	});

	it("scanning, filtering, and uploading all drive the same active sync stage", async () => {
		for (const status of ["scanning", "filtering", "uploading"] as const) {
			mockStatusSequence([statusResponse({ status })]);
			const c = renderStatus();
			await settle();
			expect(stageState(c, "sync-stage-upload")).toBe("active");
			expect(c.textContent).toContain("Menyinkronkan source code...");
			expect(c.textContent).toContain("Repository sedang dikirim.");
			if (root) {
				const r = root;
				act(() => {
					r.unmount();
				});
				root = null;
			}
			container.remove();
			vi.unstubAllGlobals();
		}
	});

	it("uploaded completes the sync stage and opens the conclusion step", async () => {
		const onContinueToSummary = vi.fn();
		mockStatusSequence([
			statusResponse({
				status: "uploaded",
				snapshotId: "snap_stage_up",
				fileCount: 37,
			}),
		]);
		const c = renderStatus({ onContinueToSummary });
		await settle();
		expect(stageState(c, "sync-stage-upload")).toBe("done");
		expect(c.textContent).toContain("Source code tersinkron");
		expect(c.textContent).toContain("37 file berhasil diterima.");
		const nextBtn = c.querySelector(
			'[data-testid="plan-continue-to-summary"]',
		) as HTMLButtonElement | null;
		expect(nextBtn).not.toBeNull();
		expect(nextBtn?.textContent).toContain("Lanjut ke Kesimpulan");
		// Transport completion alone opens step 3: analysis pending is that
		// screen's own state, not a reason to keep the user here.
		expect(nextBtn?.disabled).toBe(false);
		expect(onContinueToSummary).not.toHaveBeenCalled();
	});

	it("renders only two sync stages and never an analysis stage", async () => {
		for (const status of [
			"waiting_for_cli",
			"connected",
			"uploading",
			"uploaded",
			"analyzing",
			"ready",
			"failed",
		] as const) {
			mockStatusSequence([
				statusResponse({
					status,
					snapshotId: "snap_two_stage",
					fileCount: 12,
					analysisStatus: "pending",
				}),
			]);
			const c = renderStatus();
			await settle();
			expect(
				c.querySelector('[data-testid="sync-stage-connection"]'),
			).not.toBeNull();
			expect(
				c.querySelector('[data-testid="sync-stage-upload"]'),
			).not.toBeNull();
			expect(c.querySelector('[data-testid="sync-stage-analysis"]')).toBeNull();
			expect(c.textContent).not.toMatch(/menganalisis codebase/i);
			expect(c.textContent).not.toMatch(/analisis codebase selesai/i);
			if (root) {
				const r = root;
				act(() => {
					r.unmount();
				});
				root = null;
			}
			container.remove();
			vi.unstubAllGlobals();
		}
	});

	it("completed stages keep a semantic success marker with normal copy", async () => {
		mockStatusSequence([
			statusResponse({
				status: "uploaded",
				snapshotId: "snap_stage_done",
				fileCount: 37,
			}),
		]);
		const c = renderStatus();
		await settle();
		const doneRow = c.querySelector('[data-testid="sync-stage-upload"]');
		expect(doneRow?.getAttribute("data-stage-state")).toBe("done");
		// Success meaning comes from state + a single check icon, not from
		// a full-surface color treatment (visual tone is human-verified).
		expect(doneRow?.querySelectorAll("svg")).toHaveLength(1);
		expect(doneRow?.textContent).toContain("Source code tersinkron");
		expect(doneRow?.textContent).toContain("37 file berhasil diterima.");
	});

	it("keeps sync complete while analysis is still pending", async () => {
		const onContinueToSummary = vi.fn();
		mockStatusSequence([
			statusResponse({
				status: "uploaded",
				snapshotId: "snap_stage_an",
				analysisStatus: "pending",
			}),
		]);
		const c = renderStatus({ onContinueToSummary });
		await settle();
		// The pending analysis never reverts the sync stage to active.
		expect(stageState(c, "sync-stage-upload")).toBe("done");
		expect(c.textContent).toContain("Source code tersinkron");
		expect(c.textContent).not.toContain("Menyinkronkan source code...");
		// Analysis is not part of this screen at all: no stage, no capability
		// line, no analysis retry.
		expect(c.querySelector('[data-testid="sync-review-status"]')).toBeNull();
		expect(
			[...c.querySelectorAll("button")].some((b) =>
				/coba analisis lagi/i.test(b.textContent ?? ""),
			),
		).toBe(false);
		// The conclusion step opens on transport completion alone.
		const reviewBtn = c.querySelector(
			'[data-testid="plan-continue-to-summary"]',
		) as HTMLButtonElement | null;
		expect(reviewBtn?.disabled).toBe(false);
		expect(onContinueToSummary).not.toHaveBeenCalled();
	});

	it("ready analysis leaves the conclusion step enabled", async () => {
		const onContinueToSummary = vi.fn();
		mockStatusSequence([
			statusResponse({
				status: "uploaded",
				snapshotId: "snap_stage_ready",
				analysisStatus: "ready",
			}),
		]);
		const c = renderStatus({ onContinueToSummary });
		await settle();
		expect(c.querySelector('[data-testid="sync-stage-analysis"]')).toBeNull();
		const card = c.querySelector('[data-testid="sync-card"]');
		expect(card).not.toBeNull();
		const nextBtn = card?.querySelector(
			'[data-testid="plan-continue-to-summary"]',
		) as HTMLButtonElement | null;
		expect(nextBtn).not.toBeNull();
		expect(nextBtn?.disabled).toBe(false);
		act(() => {
			nextBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onContinueToSummary).toHaveBeenCalledTimes(1);
	});

	it("never renders fabricated percentages", { timeout: 10000 }, async () => {
		mockStatusSequence([statusResponse({ status: "uploading" })]);
		const c = renderStatus();
		await settle(200);
		expect(c.textContent).not.toContain("%");
	});

	it("attaches the analysis project to status polling when provided", async () => {
		const fetchMock = vi.fn(async (_input: unknown) => ({
			ok: true,
			status: 200,
			json: async () => statusResponse({ status: "connected" }),
		}));
		vi.stubGlobal("fetch", fetchMock);
		renderStatus({ analysisProjectId: "proj_feature_9" });
		await settle();
		expect(fetchMock).toHaveBeenCalled();
		const firstUrl = String(fetchMock.mock.calls[0]?.[0] ?? "");
		expect(firstUrl).toContain("projectId=proj_feature_9");
	});
});
