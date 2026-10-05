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

describe("Step 1 live sync status", () => {
	it("reports an honest standby while the server waits for the CLI", () => {
		renderConnect({ status: status() });
		expect(container.textContent).toContain("Menunggu agent terhubung");
		expect(container.textContent).toContain(
			"Jalankan prompt dari root repository.",
		);
		expect(stageState("sync-stage-connection")).toBe("idle");
		expect(stageState("sync-stage-upload")).toBe("pending");
	});

	it("never claims a linked repository before a handshake exists", () => {
		renderConnect({ status: status() });
		expect(container.textContent).not.toContain("Repository terhubung");
		expect(container.textContent).not.toContain("Source code tersinkron");
	});

	it("marks the repository linked and the upload active on a handshake", () => {
		renderConnect({ status: status({ status: "connected" }) });
		expect(stageState("sync-stage-connection")).toBe("done");
		expect(container.textContent).toContain("Repository terhubung");
		expect(container.textContent).toContain(
			"Agent berhasil tersambung ke VibeEverything.",
		);
		// A handshake is not upload progress.
		expect(stageState("sync-stage-upload")).toBe("pending");
	});

	it("shows active source sync across the whole upload chain", () => {
		for (const statusValue of ["scanning", "filtering", "uploading"] as const) {
			renderConnect({ status: status({ status: statusValue }) });
			expect(stageState("sync-stage-connection")).toBe("done");
			expect(stageState("sync-stage-upload")).toBe("active");
			expect(container.textContent).toContain("Menyinkronkan source code...");
			expect(container.textContent).toContain("Repository sedang dikirim.");
		}
	});

	it("completes both stages once the snapshot lands", () => {
		renderConnect({
			status: status({
				status: "uploaded",
				snapshotId: "snap_gate_1",
				fileCount: 37,
				excludedCount: 6,
			}),
		});
		expect(stageState("sync-stage-connection")).toBe("done");
		expect(stageState("sync-stage-upload")).toBe("done");
		expect(container.textContent).toContain("Source code tersinkron");
		expect(container.textContent).toContain("37 file berhasil diterima.");
	});

	it("renders correctly when a fast CLI upload is first seen already finished", () => {
		// The browser is not required to observe any intermediate state: the very
		// first poll may already report `uploaded`. Both stages must then read as
		// complete with no fabricated delay or intermediate replay.
		renderConnect({
			status: status({
				status: "uploaded",
				snapshotId: "snap_fast",
				fileCount: 12,
			}),
		});
		expect(container.textContent).toContain("Repository terhubung");
		expect(container.textContent).toContain("Source code tersinkron");
		expect(container.textContent).not.toContain("Menyinkronkan source code...");
	});

	it("distinguishes an unanswered server from a server that says no CLI", () => {
		renderConnect({ status: null });
		expect(container.textContent).toContain("Menghubungkan server");
		expect(container.textContent).not.toContain("Menunggu agent terhubung");
		expect(stageState("sync-stage-connection")).toBe("pending");
	});

	it("never renders a fabricated percentage or stage delay", () => {
		renderConnect({ status: status({ status: "uploading", fileCount: 5 }) });
		expect(container.textContent).not.toContain("%");
		expect(container.textContent).not.toMatch(/estimasi|perkiraan|sisanya/i);
	});

	it("never presents analysis as part of the sync step", () => {
		renderConnect({
			status: status({
				status: "uploaded",
				snapshotId: "snap_an",
				analysisStatus: "pending",
			}),
			canContinueToSummary: true,
		});
		expect(container.textContent).not.toMatch(/menganalisis codebase/i);
		expect(
			container.querySelector('[data-testid="sync-stage-analysis"]'),
		).toBeNull();
	});

	it("ties the reported status to the session it describes", () => {
		renderConnect({
			status: status({
				sessionId: "sess-abcdef012345",
				status: "uploading",
			}),
		});
		expect(container.textContent).toContain("Sync ID: sess-abcdef0...");
	});
});

describe("Step 1 continue gating", () => {
	it("keeps the conclusion action disabled while the server waits for the CLI", () => {
		renderConnect({ status: status() });
		expect(summaryButton()?.disabled).toBe(true);
	});

	it("keeps it disabled on a handshake alone, because no snapshot exists yet", () => {
		renderConnect({ status: status({ status: "connected" }) });
		expect(summaryButton()?.disabled).toBe(true);
	});

	it("keeps it disabled while the upload is still running", () => {
		renderConnect({ status: status({ status: "uploading" }) });
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

		// Copy feedback is honest UI feedback, not proof the agent executed.
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
		// Without a token the user cannot start an attempt, so a stale completed
		// snapshot must not read as an invitation to move on silently.
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
		// The snapshot is already there, but the page is mid-request: advancing
		// during a pending transition would race the state it is reading.
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
		expect(container.textContent).toContain(
			"Token sync hanya berlaku sekali dan tidak disimpan di browser.",
		);
		const button = [...container.querySelectorAll("button")].find((b) =>
			/Dapatkan token baru/i.test(b.textContent ?? ""),
		);
		expect(button).toBeDefined();
		act(() => {
			button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onRequestNewToken).toHaveBeenCalledTimes(1);
	});

	it("offers no token action when no handler is supplied", () => {
		renderConnect({ payload: null });
		expect(container.textContent).toContain("Token sync hanya berlaku sekali");
		expect(
			[...container.querySelectorAll("button")].some((b) =>
				/Dapatkan token baru/i.test(b.textContent ?? ""),
			),
		).toBe(false);
	});

	it("puts retry contextually inside the step instead of on another screen", () => {
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
		for (const statusValue of [
			"waiting_for_cli",
			"connected",
			"uploading",
		] as const) {
			renderConnect({
				status: status({ status: statusValue }),
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
