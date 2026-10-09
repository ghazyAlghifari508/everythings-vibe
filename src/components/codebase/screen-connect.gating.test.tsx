// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
	SyncPromptPayload,
	SyncStatusResponse,
} from "@/lib/codebase-sync";
import { ScreenConnect } from "./screen-connect";

const samplePayload: SyncPromptPayload = {
	projectId: "proj_gate_1",
	apiBaseUrl: "https://prdfy.example.com",
	syncToken: "tok_gate",
	cliMinVersion: "2.0.0",
	syncCommand: "vibeeverything codebase sync",
	expiresAt: new Date(Date.now() + 60000).toISOString(),
};

function status(
	overrides: Partial<SyncStatusResponse> = {},
): SyncStatusResponse {
	return {
		projectId: "proj_gate_1",
		sessionId: "sess_gate_1",
		status: "waiting_for_cli",
		snapshotId: null,
		...overrides,
	};
}

const STAGE_TEST_IDS = [
	"sync-stage-agent",
	"sync-stage-preparing",
	"sync-stage-sync",
] as const;

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
	vi.unstubAllGlobals();
});

function renderConnect(
	props: Partial<React.ComponentProps<typeof ScreenConnect>> = {},
) {
	act(() => {
		root?.render(
			<ScreenConnect
				projectName="Test App"
				payload={samplePayload}
				status={status()}
				canContinueToSummary={false}
				onContinueToSummary={() => {}}
				{...props}
			/>,
		);
	});
	return container;
}

function summaryButton(): HTMLButtonElement | undefined {
	return [...container.querySelectorAll("button")].find((b) =>
		/Lanjut ke Kesimpulan/i.test(b.textContent ?? ""),
	);
}

function copyButton(): HTMLButtonElement | undefined {
	return [...container.querySelectorAll("button")].find((b) =>
		/^Salin$|Tersalin/i.test(b.textContent?.trim() ?? ""),
	);
}

function stageState(testId: string): string | null {
	return (
		container
			.querySelector(`[data-testid="${testId}"]`)
			?.getAttribute("data-stage-state") ?? null
	);
}

function allStageStates(): Array<string | null> {
	return STAGE_TEST_IDS.map((testId) => stageState(testId));
}

describe("Step 1 instruction copy", () => {
	it("tells the user what to do, without describing the mechanism", () => {
		renderConnect();
		expect(container.textContent).toContain(
			"Jalankan prompt dari root repository untuk mulai menyinkronkan codebase.",
		);
	});

	it("no longer explains polling, reconciliation, or navigation behaviour", () => {
		renderConnect();
		const copy = container.textContent ?? "";
		expect(copy).not.toMatch(/mengikuti server/i);
		expect(copy).not.toMatch(/tidak berpindah sendiri/i);
		expect(copy).not.toMatch(/progresses/i);
		expect(copy).not.toMatch(/status di bawah/i);
	});
});

describe("Step 1 live sync status", () => {
	it("shows only instruction copy and zero progress rows during waiting_for_cli", () => {
		renderConnect({ status: status() });
		expect(container.textContent).toContain("Paste prompt lalu jalankan");
		expect(container.textContent).toContain(
			"Jalankan prompt dari root repository untuk mulai menyinkronkan codebase.",
		);
		expect(container.querySelectorAll("[data-stage-state]")).toHaveLength(0);
		for (const testId of STAGE_TEST_IDS) {
			expect(container.querySelector(`[data-testid="${testId}"]`)).toBeNull();
		}
		expect(container.textContent).not.toContain("Menunggu agent");
		expect(container.textContent).not.toContain("Menyiapkan source code");
		expect(container.textContent).not.toContain("Menyinkronkan codebase");
		expect(container.textContent).not.toContain("Sync ID");
		expect(container.textContent).not.toContain("Menghubungkan server...");
	});

	it("never claims a linked agent or a finished sync before the server says so", () => {
		renderConnect({ status: status() });
		expect(container.textContent).not.toContain("Agent terhubung");
		expect(container.textContent).not.toContain("Sinkronisasi selesai");
	});

	it("shows source preparation as the active stage once the agent is linked", () => {
		for (const value of ["connected", "scanning", "filtering"] as const) {
			renderConnect({
				status: status({ status: value, sessionId: "sess-connected-1" }),
			});
			expect(allStageStates()).toEqual(["done", "active", "waiting"]);
			expect(container.textContent).toContain("Agent terhubung");
			expect(container.textContent).toContain(
				"Agent berhasil tersambung ke VibeEverything.",
			);
			expect(container.textContent).toContain("Menyiapkan source code...");
			expect(container.textContent).toContain(
				"Memeriksa file project yang akan disinkronkan.",
			);
			expect(container.textContent).toContain("Menyinkronkan codebase");
			expect(container.textContent).toContain("Sync ID: sess-connect...");
		}
	});

	it("shows the sync stage as active with a live count while files are sent", () => {
		renderConnect({
			status: status({ status: "uploading", fileCount: 37 }),
		});
		expect(allStageStates()).toEqual(["done", "done", "active"]);
		expect(container.textContent).toContain("Source code siap");
		expect(container.textContent).toContain("Menyinkronkan codebase...");
		expect(container.textContent).toContain("37 file sedang dikirim.");
		expect(container.textContent).not.toContain("%");
	});

	it("completes all three stages once the snapshot lands", () => {
		renderConnect({
			status: status({
				status: "uploaded",
				snapshotId: "snap_gate_1",
				fileCount: 37,
			}),
		});
		expect(allStageStates()).toEqual(["done", "done", "done"]);
		expect(container.textContent).toContain("Agent terhubung");
		expect(container.textContent).toContain("Source code siap");
		expect(container.textContent).toContain("Sinkronisasi selesai");
		expect(container.textContent).toContain("37 file berhasil diterima.");
	});

	it("renders the finished state directly when a fast CLI is first seen complete", () => {
		// No intermediate stage may be replayed to look busier than the run was.
		renderConnect({
			status: status({
				status: "uploaded",
				snapshotId: "snap_fast",
				fileCount: 12,
			}),
		});
		expect(allStageStates()).toEqual(["done", "done", "done"]);
		expect(container.textContent).not.toContain("Menyiapkan source code...");
		expect(container.textContent).not.toContain("Menyinkronkan codebase...");
	});

	it("says it is connecting instead of claiming a stage the server never reported", () => {
		renderConnect({ status: null });
		expect(container.textContent).toContain("Menghubungkan server...");
		expect(container.textContent).not.toContain("Menunggu agent");
		expect(container.querySelectorAll("[data-stage-state]")).toHaveLength(0);
	});

	it("presents analysis status truthfully once a snapshot exists and analysisStatus is reported", () => {
		renderConnect({
			status: status({
				status: "uploaded",
				snapshotId: "snap_an",
				analysisStatus: "pending",
			}),
			canContinueToSummary: false,
		});
		expect(container.textContent).toMatch(/menganalisis codebase/i);
		expect(
			container.querySelector('[data-testid="sync-stage-analysis"]'),
		).not.toBeNull();
	});

	it("does not present analysis when analysisStatus is absent or snapshot is missing", () => {
		renderConnect({
			status: status({
				status: "uploading",
			}),
		});
		expect(
			container.querySelector('[data-testid="sync-stage-analysis"]'),
		).toBeNull();
	});

	it("keeps the attempt identifier as quiet metadata, outside the progress copy", () => {
		renderConnect({
			status: status({ sessionId: "sess-abcdef012345", status: "uploading" }),
		});
		const syncIdLine = [...container.querySelectorAll("p")].find((p) =>
			/Sync ID: sess-abcdef0/.test(p.textContent ?? ""),
		);
		expect(syncIdLine).toBeDefined();
		expect(syncIdLine?.className).toContain("text-fog");
		// It must not be mistaken for a stage description.
		for (const testId of STAGE_TEST_IDS) {
			expect(
				container.querySelector(`[data-testid="${testId}"]`)?.textContent,
			).not.toContain("Sync ID");
		}
	});

	it("renders analysis stage row when snapshot is uploaded and analysisStatus exists", () => {
		renderConnect({
			status: status({
				status: "uploaded",
				snapshotId: "snap_1",
				analysisStatus: "pending",
			}),
		});
		const pendingRow = container.querySelector(
			'[data-testid="sync-stage-analysis"]',
		);
		expect(pendingRow).not.toBeNull();
		expect(pendingRow?.getAttribute("data-stage-state")).toBe("active");
		expect(pendingRow?.textContent).toContain("Menganalisis codebase");

		renderConnect({
			status: status({
				status: "uploaded",
				snapshotId: "snap_1",
				analysisStatus: "ready",
			}),
			canContinueToSummary: true,
		});
		const readyRow = container.querySelector(
			'[data-testid="sync-stage-analysis"]',
		);
		expect(readyRow).not.toBeNull();
		expect(readyRow?.getAttribute("data-stage-state")).toBe("done");
		expect(readyRow?.textContent).toContain("Kesimpulan siap");

		renderConnect({
			status: status({
				status: "uploaded",
				snapshotId: "snap_1",
			}),
		});
		expect(
			container.querySelector('[data-testid="sync-stage-analysis"]'),
		).toBeNull();
	});
});

describe("Step 1 continue gating", () => {
	it("keeps the conclusion action disabled while the server waits for the agent", () => {
		renderConnect({ status: status() });
		expect(summaryButton()?.disabled).toBe(true);
	});

	it("keeps it disabled on a linked agent alone, because no snapshot exists yet", () => {
		renderConnect({ status: status({ status: "connected" }) });
		expect(summaryButton()?.disabled).toBe(true);
	});

	it("keeps it disabled while the upload is still running", () => {
		renderConnect({ status: status({ status: "uploading" }) });
		expect(summaryButton()?.disabled).toBe(true);
	});

	it("does not unlock on source preparation completing either", () => {
		// Preparation finishing is not transport completion.
		renderConnect({
			status: status({ status: "uploading", fileCount: 12 }),
		});
		expect(summaryButton()?.disabled).toBe(true);
	});

	it("enables it once an uploaded snapshot is the current attempt", () => {
		renderConnect({
			status: status({
				status: "uploaded",
				snapshotId: "snap_ok",
				fileCount: 37,
			}),
			canContinueToSummary: true,
		});
		expect(summaryButton()?.disabled).toBe(false);
	});
	it("shows exact readiness criteria in disabled helper copy", () => {
		renderConnect({ canContinueToSummary: false });
		expect(container.textContent).toContain(
			"Tombol lanjut aktif setelah sinkronisasi dan analisis codebase selesai.",
		);
	});

	it("shows analysis failure alert and retry button inside Sync when analysis fails", () => {
		const onRetryAnalysis = vi.fn();
		renderConnect({
			status: status({
				status: "uploaded",
				snapshotId: "snap_1",
				analysisStatus: "failed",
			}),
			analysisError: "Model timeout during analysis.",
			onRetryAnalysis,
		});
		const alert = container.querySelector(
			'[data-testid="analysis-failure-alert"]',
		);
		expect(alert).not.toBeNull();
		expect(alert?.textContent).toContain("Analisis codebase belum berhasil");
		expect(alert?.textContent).toContain("Model timeout during analysis.");

		const retryBtn = container.querySelector(
			'[data-testid="retry-analysis-button"]',
		) as HTMLButtonElement | null;
		expect(retryBtn).not.toBeNull();
		act(() => {
			retryBtn?.click();
		});
		expect(onRetryAnalysis).toHaveBeenCalledTimes(1);
	});
	it("shows legacy analysis warning and refresh button when legacy analysis is missing suggestions", () => {
		const onRefreshLegacySuggestions = vi.fn();
		renderConnect({
			status: status({
				status: "uploaded",
				snapshotId: "snap_1",
				analysisStatus: "ready",
			}),
			isLegacyAnalysisMissingSuggestions: true,
			onRefreshLegacySuggestions,
		});
		const warning = container.querySelector(
			'[data-testid="legacy-analysis-warning"]',
		);
		expect(warning).not.toBeNull();
		expect(warning?.textContent).toContain(
			"Rekomendasi task awal belum tersedia",
		);

		const refreshBtn = container.querySelector(
			'[data-testid="refresh-legacy-suggestions-button"]',
		) as HTMLButtonElement | null;
		expect(refreshBtn).not.toBeNull();
		act(() => {
			refreshBtn?.click();
		});
		expect(onRefreshLegacySuggestions).toHaveBeenCalledTimes(1);

		expect(container.textContent).toContain(
			"Perbarui rekomendasi task awal untuk melanjutkan ke kesimpulan.",
		);
	});

	it("never lets clicking Salin unlock the conclusion action", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal("navigator", {
			...navigator,
			clipboard: { writeText },
		});
		const onContinueToSummary = vi.fn();
		renderConnect({ status: status(), onContinueToSummary });

		await act(async () => {
			copyButton()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		expect(container.textContent).toContain("Tersalin");
		expect(summaryButton()?.disabled).toBe(true);
		expect(onContinueToSummary).not.toHaveBeenCalled();
	});

	it("does not advance on its own when the snapshot lands", () => {
		const onContinueToSummary = vi.fn();
		renderConnect({ status: status(), onContinueToSummary });
		act(() => {
			root?.render(
				<ScreenConnect
					projectName="Test App"
					payload={samplePayload}
					status={status({
						status: "uploaded",
						snapshotId: "snap_auto",
						fileCount: 4,
					})}
					canContinueToSummary
					onContinueToSummary={onContinueToSummary}
				/>,
			);
		});
		expect(onContinueToSummary).not.toHaveBeenCalled();
	});

	it("advances only from an explicit click once the snapshot exists", () => {
		const onContinueToSummary = vi.fn();
		renderConnect({
			status: status({
				status: "uploaded",
				snapshotId: "snap_click",
				fileCount: 4,
			}),
			canContinueToSummary: true,
			onContinueToSummary,
		});
		act(() => {
			summaryButton()?.dispatchEvent(
				new MouseEvent("click", { bubbles: true }),
			);
		});
		expect(onContinueToSummary).toHaveBeenCalledTimes(1);
	});

	it("omits the action entirely when this screen has no conclusion step", () => {
		renderConnect({
			status: status({
				status: "uploaded",
				snapshotId: "snap_nocta",
				fileCount: 4,
			}),
			canContinueToSummary: true,
			onContinueToSummary: undefined,
		});
		expect(summaryButton()).toBeUndefined();
	});

	it("stays disabled without a payload even when a snapshot exists", () => {
		renderConnect({
			payload: null,
			status: status({
				status: "uploaded",
				snapshotId: "snap_nopayload",
				fileCount: 4,
			}),
			canContinueToSummary: false,
		});
		expect(summaryButton()?.disabled).toBe(true);
	});

	it("stays disabled while a session is being minted", () => {
		renderConnect({
			status: status({
				status: "uploaded",
				snapshotId: "snap_starting",
				fileCount: 4,
			}),
			canContinueToSummary: true,
			isStarting: true,
		});
		expect(summaryButton()?.disabled).toBe(true);
	});
});

describe("Step 1 recovery affordances", () => {
	it("offers a fresh token when the one-time credential cannot be restored", () => {
		const onRequestNewToken = vi.fn();
		renderConnect({ payload: null, onRequestNewToken });
		const button = [...container.querySelectorAll("button")].find((b) =>
			/Dapatkan token baru/i.test(b.textContent ?? ""),
		);
		expect(button).toBeDefined();
		act(() => {
			button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onRequestNewToken).toHaveBeenCalledTimes(1);
	});

	it("reports a failed attempt once, with the way out, and no invented stages", () => {
		const onRetrySync = vi.fn();
		renderConnect({
			status: status({
				status: "failed",
				errorMessage: "Snapshot tidak lengkap.",
			}),
			onRetrySync,
		});
		expect(container.textContent).toContain("Sinkronisasi belum berhasil");
		expect(container.textContent).toContain("Snapshot tidak lengkap.");
		// The server does not record which step broke, so no stage may be claimed.
		expect(container.querySelectorAll("[data-stage-state]")).toHaveLength(0);
		const retry = [...container.querySelectorAll("button")].find((b) =>
			/^Coba lagi$/i.test(b.textContent?.trim() ?? ""),
		);
		expect(retry).toBeDefined();
		act(() => {
			retry?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onRetrySync).toHaveBeenCalledTimes(1);
	});

	it("never offers retry for a session that is still waiting or running", () => {
		for (const value of [
			"waiting_for_cli",
			"connected",
			"uploading",
		] as const) {
			renderConnect({
				status: status({ status: value }),
				onRetrySync: vi.fn(),
			});
			expect(
				[...container.querySelectorAll("button")].some((b) =>
					/^Coba lagi$/i.test(b.textContent?.trim() ?? ""),
				),
			).toBe(false);
		}
	});

	it("surfaces the owning loop's reconciliation error honestly", () => {
		renderConnect({ status: null, statusError: "Gagal menghubungi server." });
		expect(container.querySelector('[role="alert"]')?.textContent).toContain(
			"Gagal menghubungi server.",
		);
	});
});
