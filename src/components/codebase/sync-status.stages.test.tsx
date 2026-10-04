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

describe("SyncStatus three user-facing stages", () => {
	it("waiting_for_cli keeps every stage pending with a user-friendly waiting state", async () => {
		mockStatusSequence([statusResponse({ status: "waiting_for_cli" })]);
		const c = renderStatus();
		await settle();
		expect(stageState(c, "sync-stage-connection")).toBe("idle");
		expect(stageState(c, "sync-stage-upload")).toBe("pending");
		expect(stageState(c, "sync-stage-analysis")).toBe("pending");
		expect(c.textContent).toContain("Menunggu agent terhubung");
		expect(c.querySelector('[data-testid="cli-waiting-alert"]')).not.toBeNull();
	});

	it("connected marks repository linked without implying upload progress", async () => {
		mockStatusSequence([statusResponse({ status: "connected" })]);
		const c = renderStatus();
		await settle();
		expect(stageState(c, "sync-stage-connection")).toBe("done");
		expect(stageState(c, "sync-stage-upload")).toBe("pending");
		expect(c.textContent).toContain("Repository terhubung");
	});

	it("scanning, filtering, and uploading all drive the same active sync stage", async () => {
		for (const status of ["scanning", "filtering", "uploading"] as const) {
			mockStatusSequence([statusResponse({ status })]);
			const c = renderStatus();
			await settle();
			expect(stageState(c, "sync-stage-upload")).toBe("active");
			expect(c.textContent).toContain("Source code sedang disinkronkan");
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

	it("uploaded completes the sync stage but never implies analysis is done", async () => {
		const onViewReview = vi.fn();
		mockStatusSequence([
			statusResponse({
				status: "uploaded",
				snapshotId: "snap_stage_up",
				fileCount: 37,
			}),
		]);
		const c = renderStatus({ onViewReview });
		await settle();
		expect(stageState(c, "sync-stage-upload")).toBe("done");
		expect(c.textContent).toContain("Source code tersinkron");
		expect(stageState(c, "sync-stage-analysis")).toBe("pending");
		const nextBtn = c.querySelector(
			'[data-testid="plan-continue-to-summary"]',
		) as HTMLButtonElement | null;
		expect(nextBtn).not.toBeNull();
		expect(nextBtn?.disabled).toBe(true);
		expect(onViewReview).not.toHaveBeenCalled();
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
		expect(doneRow?.textContent).toContain("37 file siap diproses.");
	});

	it("pending analysis activates the analysis stage with analysis copy", async () => {
		mockStatusSequence([
			statusResponse({
				status: "uploaded",
				snapshotId: "snap_stage_an",
				analysisStatus: "pending",
			}),
		]);
		const c = renderStatus();
		await settle();
		expect(stageState(c, "sync-stage-analysis")).toBe("active");
		expect(c.textContent).toContain("Menganalisis codebase...");
	});

	it("ready analysis completes the analysis stage and enables the in-card review CTA", async () => {
		const onViewReview = vi.fn();
		mockStatusSequence([
			statusResponse({
				status: "uploaded",
				snapshotId: "snap_stage_ready",
				analysisStatus: "ready",
			}),
		]);
		const c = renderStatus({ onViewReview });
		await settle();
		expect(stageState(c, "sync-stage-analysis")).toBe("done");
		expect(c.textContent).toContain("Analisis codebase selesai");
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
		expect(onViewReview).toHaveBeenCalledTimes(1);
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
