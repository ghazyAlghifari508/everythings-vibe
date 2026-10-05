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
		projectId: "proj_123",
		sessionId: "sess_123",
		status: "uploading",
		...overrides,
	};
}

function mockFetchSequence(
	responses: Array<SyncStatusResponse | { http: number; body: unknown }>,
) {
	let calls = 0;
	const fetchMock = vi.fn(async (_input: unknown) => {
		const next = responses[Math.min(calls, responses.length - 1)];
		calls += 1;
		if (next && typeof next === "object" && "http" in next) {
			return {
				ok: false,
				status: next.http,
				json: async () => next.body,
			};
		}
		return { ok: true, status: 200, json: async () => next };
	});
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
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
			<SyncStatus projectId="proj_123" pollIntervalMs={15} {...props} />,
		);
	});
	return container;
}

async function settle(ms = 60) {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, ms));
	});
}

describe("SyncStatus", () => {
	it("polls the status endpoint for the project", async () => {
		const fetchMock = mockFetchSequence([statusResponse()]);
		renderStatus();
		await settle();
		expect(fetchMock).toHaveBeenCalled();
		expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
			"/api/codebases/proj_123/status",
		);
	});

	it("uses an explicit statusPath when provided", async () => {
		const fetchMock = mockFetchSequence([statusResponse()]);
		renderStatus({ statusPath: "/api/codebases/cb_123/status" });
		await settle();
		expect(fetchMock).toHaveBeenCalled();
		expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
			"/api/codebases/cb_123/status",
		);
	});

	it("does not show waiting copy while initial status is null/loading", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(() => new Promise(() => {})),
		);
		const c = renderStatus();
		await settle(30);
		expect(c.textContent).toContain("Menghubungi server...");
		expect(c.textContent).not.toContain("CLI Agent Belum Terhubung");
		expect(c.querySelector('[data-testid="cli-waiting-alert"]')).toBeNull();
		expect(c.querySelector('[data-testid="sync-loading"]')).not.toBeNull();
	});

	it("shows polling error instead of waiting when status fetch fails", async () => {
		const onStatus = vi.fn();
		mockFetchSequence([
			{ http: 500, body: { error: "Gagal membaca status sync" } },
		]);
		const c = renderStatus({ onStatus });
		await settle();
		expect(c.textContent).toContain("Gagal memuat status sync");
		expect(c.textContent).not.toContain("CLI Agent Belum Terhubung");
		expect(c.querySelector('[data-testid="cli-waiting-alert"]')).toBeNull();
		expect(c.querySelector('[data-testid="sync-poll-error"]')).not.toBeNull();
		expect(onStatus).not.toHaveBeenCalledWith(null);
	});

	it("shows rate-limit error honestly instead of waiting", async () => {
		mockFetchSequence([
			{ http: 429, body: { error: "Terlalu banyak permintaan" } },
		]);
		const c = renderStatus();
		await settle();
		expect(c.textContent).toContain("Terlalu banyak permintaan");
		expect(c.textContent).not.toContain("CLI Agent Belum Terhubung");
		expect(c.textContent).toContain("Gagal memuat");
	});

	it("recovers on the next poll after a transient error", async () => {
		const onStatus = vi.fn();
		mockFetchSequence([
			{ http: 500, body: { error: "Gagal membaca status sync" } },
			statusResponse({ status: "connected", sessionId: "sess_rec_1" }),
		]);
		const c = renderStatus({ onStatus, pollIntervalMs: 15 });
		await settle(80);
		expect(onStatus).toHaveBeenCalledWith(
			expect.objectContaining({ status: "connected" }),
		);
		expect(c.textContent).toContain("Repository terhubung");
		expect(c.textContent).not.toContain("CLI Agent Belum Terhubung");
	});

	it("transitions waiting to connected without manual refresh", async () => {
		const onStatus = vi.fn();
		let calls = 0;
		const fetchMock = vi.fn(async () => {
			calls += 1;
			const payload =
				calls === 1
					? statusResponse({
							status: "waiting_for_cli",
							sessionId: "sess_tr_1",
						})
					: statusResponse({ status: "connected", sessionId: "sess_tr_1" });
			return { ok: true, status: 200, json: async () => payload };
		});
		vi.stubGlobal("fetch", fetchMock);
		const c = renderStatus({ onStatus, pollIntervalMs: 15 });
		await settle(80);
		expect(c.textContent).toContain("Repository terhubung");
	});

	it("pins polling to the observed sessionId", async () => {
		const fetchMock = mockFetchSequence([
			statusResponse({ status: "uploading", sessionId: "sess_pin_9" }),
			statusResponse({ status: "uploading", sessionId: "sess_pin_9" }),
		]);
		renderStatus({ pollIntervalMs: 15 });
		await settle(80);
		expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
		const secondUrl = String(fetchMock.mock.calls[1]?.[0] ?? "");
		expect(secondUrl).toContain("sessionId=sess_pin_9");
	});

	it("shows uploading then uploaded snapshot stages", async () => {
		let calls = 0;
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				calls += 1;
				const payload =
					calls === 1
						? statusResponse({ status: "uploading", sessionId: "sess_up_1" })
						: statusResponse({
								status: "uploaded",
								sessionId: "sess_up_1",
								snapshotId: "snap_up_1",
								fileCount: 37,
								excludedCount: 5,
							});
				return { ok: true, status: 200, json: async () => payload };
			}),
		);
		const c = renderStatus({ pollIntervalMs: 15 });
		await settle(90);
		expect(c.textContent).toContain("Source code tersinkron");
		expect(c.textContent).toContain("37");
	});

	it("keeps sync complete while analysis is pending and unlocks workspace entry", {
		timeout: 10000,
	}, async () => {
		const onViewReview = vi.fn();
		const onEnterWorkspace = vi.fn();
		mockFetchSequence([
			statusResponse({
				status: "uploaded",
				snapshotId: "snap_an_1",
				analysisStatus: "pending",
			}),
		]);
		const c = renderStatus({ onViewReview, onEnterWorkspace });
		await settle();
		// Sync is finished; analysis is a separate capability, not a stage.
		expect(c.textContent).toContain("Source code tersinkron");
		expect(c.textContent).not.toMatch(/menganalisis codebase/i);
		expect(c.querySelector('[data-testid="sync-stage-analysis"]')).toBeNull();
		const reviewBtn = c.querySelector(
			'[data-testid="plan-continue-to-summary"]',
		) as HTMLButtonElement | null;
		expect(reviewBtn?.disabled).toBe(true);
		const workspaceBtn = c.querySelector(
			'[data-testid="sync-enter-workspace"]',
		) as HTMLButtonElement | null;
		expect(workspaceBtn?.disabled).toBe(false);
		act(() => {
			workspaceBtn?.click();
		});
		expect(onEnterWorkspace).toHaveBeenCalledTimes(1);
		expect(onViewReview).not.toHaveBeenCalled();
	});

	it("shows indeterminate loading without fabricated percentages while active", async () => {
		mockFetchSequence([statusResponse({ status: "uploading" })]);
		const c = renderStatus();
		await settle();
		expect(c.textContent).toMatch(
			/dikirim|menyinkronkan|menghubungkan|menunggu/i,
		);
		expect(c.textContent).not.toContain("%");
	});

	it("shows honest idle standby state without spinning loader when waiting for CLI", {
		timeout: 10000,
	}, async () => {
		mockFetchSequence([statusResponse({ status: "waiting_for_cli" })]);
		const c = renderStatus();
		await settle();
		expect(c.textContent).toContain("CLI Agent Belum Terhubung");
		expect(c.textContent).toContain("Standby");
		expect(c.textContent).toContain(
			"Menunggu agent terhubung ke VibeEverything.",
		);
		// No spinning loaders should be present while in idle standby
		expect(c.querySelector(".animate-spin")).toBeNull();
		const alertEl = c.querySelector('[data-testid="cli-waiting-alert"]');
		expect(alertEl).not.toBeNull();
		expect(alertEl?.querySelector("svg")).not.toBeNull();
	});

	it("displays real counts and timestamps from the server", async () => {
		mockFetchSequence([
			statusResponse({
				status: "uploaded",
				fileCount: 42,
				excludedCount: 7,
				createdAt: "2026-09-19T10:00:00.000Z",
			}),
		]);
		const c = renderStatus();
		await settle();
		expect(c.textContent).toContain("42");
		expect(c.textContent).toContain("7");
	});

	it("shows the completed sync state and stops polling on terminal status", async () => {
		const fetchMock = mockFetchSequence([
			statusResponse({ status: "ready", snapshotId: "snap_ready_1" }),
		]);
		const c = renderStatus();
		await settle();
		expect(c.textContent).toMatch(/sync selesai/i);
		const callsAfterReady = fetchMock.mock.calls.length;
		await settle(60);
		expect(fetchMock.mock.calls.length).toBe(callsAfterReady);
	});

	it("offers and invokes sync retry from the ready state", () => {
		const onRetrySync = vi.fn();
		const c = renderStatus({
			status: statusResponse({ status: "ready", snapshotId: "snap_retry_1" }),
			onRetrySync,
		});
		const retryButton = [...c.querySelectorAll("button")].find((b) =>
			/Sync ulang/i.test(b.textContent ?? ""),
		);

		expect(retryButton).toBeDefined();
		act(() => {
			retryButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onRetrySync).toHaveBeenCalledTimes(1);
	});

	it("never renders an analysis stage or its copy inside the sync checklist", async () => {
		mockFetchSequence([statusResponse({ status: "uploaded" })]);
		const c = renderStatus();
		await settle();

		expect(c.querySelector('[data-testid="sync-stage-analysis"]')).toBeNull();
		expect(c.textContent).not.toMatch(/analisis codebase/i);
	});

	it("offers analysis retry when the session is uploaded but analysis failed", {
		timeout: 10000,
	}, async () => {
		const onRetryAnalysis = vi.fn();
		const onEnterWorkspace = vi.fn();
		const onViewReview = vi.fn();
		mockFetchSequence([
			statusResponse({
				status: "uploaded",
				snapshotId: "snap_123",
				analysisId: "analysis_123",
				analysisStatus: "failed",
				errorMessage: "Analisis codebase gagal. Coba analisis ulang.",
			}),
		]);
		const c = renderStatus({ onRetryAnalysis, onEnterWorkspace, onViewReview });
		await settle();
		// Analysis failure never converts a finished sync back into a failure.
		expect(c.textContent).toContain("Source code tersinkron");
		expect(c.textContent).not.toMatch(/sync gagal/i);
		expect(
			c.querySelector('[data-testid="sync-review-status"]')?.textContent,
		).toBe("Ringkasan belum berhasil disiapkan.");
		const retryButton = [...c.querySelectorAll("button")].find((b) =>
			/coba analisis lagi/i.test(b.textContent ?? ""),
		);
		expect(retryButton).toBeDefined();
		act(() => {
			retryButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onRetryAnalysis).toHaveBeenCalledTimes(1);
		// A failed analysis still leaves the workspace openable.
		const workspaceBtn = c.querySelector(
			'[data-testid="sync-enter-workspace"]',
		) as HTMLButtonElement | null;
		expect(workspaceBtn?.disabled).toBe(false);
		expect(
			(
				c.querySelector(
					'[data-testid="plan-continue-to-summary"]',
				) as HTMLButtonElement | null
			)?.disabled,
		).toBe(true);
	});

	it("shows the safe server error with a retry action on failure", async () => {
		const onRetrySync = vi.fn();
		mockFetchSequence([
			statusResponse({
				status: "failed",
				errorCode: "SNAPSHOT_INCOMPLETE",
				errorMessage: "Snapshot tidak lengkap.",
			}),
		]);
		const c = renderStatus({ onRetrySync });
		await settle();
		expect(c.textContent).toContain("Snapshot tidak lengkap.");
		const retryButton = [...c.querySelectorAll("button")].find((b) =>
			/coba lagi|sync ulang/i.test(b.textContent ?? ""),
		);
		expect(retryButton).toBeDefined();
		act(() => {
			retryButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onRetrySync).toHaveBeenCalledTimes(1);
	});

	it("shows the expired state with recovery guidance", async () => {
		mockFetchSequence([statusResponse({ status: "expired" })]);
		const c = renderStatus();
		await settle();
		expect(c.textContent).toMatch(/kedaluwarsa/i);
	});

	it("does not poll when the parent controls the status", async () => {
		const fetchMock = mockFetchSequence([statusResponse()]);
		const c = renderStatus({
			status: statusResponse({ status: "ready", snapshotId: "snap_parent_1" }),
		});
		await settle();
		expect(fetchMock).not.toHaveBeenCalled();
		expect(c.textContent).toMatch(/sync selesai/i);
	});

	it("polls internally when the parent passes null status", async () => {
		const fetchMock = mockFetchSequence([
			statusResponse({ status: "uploading" }),
		]);
		const c = renderStatus({ status: null });
		await settle();
		expect(fetchMock).toHaveBeenCalled();
		expect(c.textContent).toMatch(
			/dikirim|menyinkronkan|menghubungkan|menunggu/i,
		);
	});

	it("does not report sync complete for a failed session with a stale ready analysis", async () => {
		mockFetchSequence([
			statusResponse({ status: "failed", analysisStatus: "ready" }),
		]);
		const c = renderStatus();
		await settle();
		expect(c.textContent).not.toMatch(/sync selesai/i);
		expect(c.textContent).toMatch(/sync gagal/i);
	});

	it("does not open review or workspace for a failed session holding a snapshot", {
		timeout: 10000,
	}, async () => {
		mockFetchSequence([
			statusResponse({
				status: "failed",
				analysisStatus: "ready",
				snapshotId: "snap_failed_1",
			}),
		]);
		const c = renderStatus({
			onViewReview: vi.fn(),
			onEnterWorkspace: vi.fn(),
		});
		await settle();
		const reviewBtn = c.querySelector(
			'[data-testid="plan-continue-to-summary"]',
		) as HTMLButtonElement | null;
		const workspaceBtn = c.querySelector(
			'[data-testid="sync-enter-workspace"]',
		) as HTMLButtonElement | null;
		expect(reviewBtn?.disabled).toBe(true);
		expect(workspaceBtn?.disabled).toBe(true);
	});

	it("keeps one request in flight so slow responses cannot overlap", {
		timeout: 10000,
	}, async () => {
		let resolveFirst!: (value: unknown) => void;
		const gate = new Promise((resolve) => {
			resolveFirst = resolve;
		});
		const fetchMock = vi.fn(async () => {
			await gate;
			return { ok: true, status: 200, json: async () => statusResponse() };
		});
		vi.stubGlobal("fetch", fetchMock);
		renderStatus();
		await settle(60);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		await act(async () => {
			resolveFirst(null);
		});
		await settle();
	});

	it("notifies the parent of status updates for analysis wiring", async () => {
		const onStatus = vi.fn();
		mockFetchSequence([statusResponse({ status: "analyzing" })]);
		renderStatus({ onStatus });
		await settle();
		expect(onStatus).toHaveBeenCalled();
		const firstCall = onStatus.mock.calls[0]?.[0] as
			| SyncStatusResponse
			| null
			| undefined;
		expect(firstCall?.status).toBe("analyzing");
	});

	it("recovers persisted server state on remount (refresh persistence)", async () => {
		mockFetchSequence([statusResponse({ status: "uploaded", fileCount: 9 })]);
		const first = renderStatus();
		await settle(250);
		expect(first.textContent).toContain("9");
		if (root) {
			const r = root;
			act(() => {
				r.unmount();
			});
			root = null;
		}
		container.remove();
		mockFetchSequence([statusResponse({ status: "uploaded", fileCount: 9 })]);
		const second = renderStatus();
		await settle(250);
		expect(second.textContent).toContain("9");
		expect(second.textContent).not.toContain("%");
	});

	it("renders only two sync stages, each backed by an observable signal", async () => {
		mockFetchSequence([
			statusResponse({
				status: "analyzing",
				snapshotId: "snap_two_stage",
				fileCount: 12,
				excludedCount: 3,
			}),
		]);
		const c = renderStatus();
		await settle();
		// Stage labels that map to real transport signals.
		expect(c.textContent).toContain("Repository terhubung");
		expect(c.textContent).toContain("Source code tersinkron");
		expect(c.textContent).not.toMatch(/menganalisis codebase/i);
		expect(
			c.querySelector('[data-testid="sync-stage-connection"]'),
		).not.toBeNull();
		expect(c.querySelector('[data-testid="sync-stage-upload"]')).not.toBeNull();
		expect(c.querySelector('[data-testid="sync-stage-analysis"]')).toBeNull();
	});

	it("does not claim scan or manifest stages the client never observes", {
		timeout: 10000,
	}, async () => {
		// `scanning`/`filtering` are server bookkeeping the CLI never reports, so
		// no user-facing stage may imply them.
		mockFetchSequence([statusResponse({ status: "uploading" })]);
		const c = renderStatus();
		await settle();
		expect(c.textContent).not.toMatch(/memindai/i);
		expect(c.textContent).not.toMatch(/filtering/i);
		expect(c.textContent).not.toMatch(/package manifest dan framework dibaca/i);
	});

	it("shows the exclusion count only when the server reports it", async () => {
		mockFetchSequence([statusResponse({ status: "uploading" })]);
		const without = renderStatus();
		await settle(250);
		expect(without.textContent).not.toMatch(/dikecualikan otomatis/i);
		if (root) {
			const r = root;
			act(() => {
				r.unmount();
			});
			root = null;
		}
		container.remove();

		mockFetchSequence([
			statusResponse({ status: "uploaded", excludedCount: 7 }),
		]);
		const withCount = renderStatus();
		await settle(250);
		expect(withCount.textContent).toContain("7");
		expect(withCount.textContent).toMatch(/dikecualikan otomatis/i);
	});

	it("disables the review action while the transport is still uploading", async () => {
		const onViewReview = vi.fn();
		mockFetchSequence([statusResponse({ status: "uploading" })]);
		const c = renderStatus({ onViewReview });
		await settle();

		const nextBtn = c.querySelector(
			'[data-testid="plan-continue-to-summary"]',
		) as HTMLButtonElement | undefined;

		expect(nextBtn).not.toBeNull();
		expect(nextBtn?.disabled).toBe(true);
		act(() => {
			nextBtn?.click();
		});
		expect(onViewReview).not.toHaveBeenCalled();
	});

	it("enables the review action only once validated analysis is ready", async () => {
		const onViewReview = vi.fn();
		mockFetchSequence([
			statusResponse({
				status: "uploaded",
				snapshotId: "snap_review_ok",
				analysisStatus: "ready",
			}),
		]);
		const c = renderStatus({ onViewReview });
		await settle(250);

		const nextBtn = c.querySelector(
			'[data-testid="plan-continue-to-summary"]',
		) as HTMLButtonElement | undefined;

		expect(nextBtn).not.toBeNull();
		expect(nextBtn?.disabled).toBe(false);
		act(() => {
			nextBtn?.click();
		});
		expect(onViewReview).toHaveBeenCalledTimes(1);
	});

	it("enables the workspace action as soon as the snapshot is synced", async () => {
		const onEnterWorkspace = vi.fn();
		mockFetchSequence([statusResponse({ status: "uploading" })]);
		const pending = renderStatus({ onEnterWorkspace });
		await settle();
		const pendingBtn = pending.querySelector(
			'[data-testid="sync-enter-workspace"]',
		) as HTMLButtonElement | null;
		expect(pendingBtn?.disabled).toBe(true);

		const fetchMock = mockFetchSequence([
			statusResponse({
				status: "uploaded",
				snapshotId: "snap_ws_ok",
				fileCount: 37,
			}),
		]);
		const ready = renderStatus({ onEnterWorkspace });
		await settle();
		const readyBtn = ready.querySelector(
			'[data-testid="sync-enter-workspace"]',
		) as HTMLButtonElement | null;
		expect(fetchMock).toHaveBeenCalled();
		expect(readyBtn?.disabled).toBe(false);
		act(() => {
			readyBtn?.click();
		});
		expect(onEnterWorkspace).toHaveBeenCalledTimes(1);
	});

	it("invokes onBackToInstructions when previous button in footer is clicked", async () => {
		const onBackToInstructions = vi.fn();
		mockFetchSequence([statusResponse({ status: "uploading" })]);
		const c = renderStatus({ onBackToInstructions });
		await settle();

		const backBtn = [...c.querySelectorAll("button")].find((b) =>
			/Kembali ke Prompt Sync/i.test(b.textContent ?? ""),
		);

		expect(backBtn).toBeDefined();
		act(() => {
			backBtn?.click();
		});
		expect(onBackToInstructions).toHaveBeenCalledTimes(1);
	});
});
