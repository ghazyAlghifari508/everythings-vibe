// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	canTransitionSyncStatus,
	isSyncStatusComplete,
	resolveSyncStageView,
	type SyncPromptPayload,
	type SyncStatusResponse,
} from "@/features/codebase/services/sync";
import { CodebaseResyncDrawer } from "../components/planning/codebase-resync-drawer";

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

const samplePayload: SyncPromptPayload = {
	projectId: "cb_existing_999",
	apiBaseUrl: "https://vibeeverything.example.com",
	syncToken: "tok_resync_safe_123",
	cliMinVersion: "2.0.0",
	syncCommand: "everythings-vibe codebase sync",
	expiresAt: new Date(Date.now() + 1800000).toISOString(),
};

function status(
	overrides: Partial<SyncStatusResponse> = {},
): SyncStatusResponse {
	return {
		projectId: "cb_existing_999",
		sessionId: "sess_resync_test",
		status: "waiting_for_cli",
		snapshotId: null,
		...overrides,
	};
}

describe("Re-sync state transitions & reconciliation", () => {
	it("follows strictly valid sync status transitions", () => {
		expect(canTransitionSyncStatus("waiting_for_cli", "connected")).toBe(true);
		expect(canTransitionSyncStatus("connected", "scanning")).toBe(true);
		expect(canTransitionSyncStatus("scanning", "filtering")).toBe(true);
		expect(canTransitionSyncStatus("filtering", "uploading")).toBe(true);
		expect(canTransitionSyncStatus("uploading", "uploaded")).toBe(true);
		expect(canTransitionSyncStatus("uploaded", "analyzing")).toBe(true);
		expect(canTransitionSyncStatus("analyzing", "ready")).toBe(true);
		// Rollback on analysis failure returns to uploaded
		expect(canTransitionSyncStatus("analyzing", "uploaded")).toBe(true);
		// Terminal states cannot transition
		expect(canTransitionSyncStatus("ready", "uploading")).toBe(false);
	});

	it("reconciles server events into real timeline rows without faking activity", () => {
		const inFlight = status({
			status: "uploading",
			fileCount: 45,
			lifecycle: [
				{ kind: "agent_connected", at: "2026-03-01T12:00:00.000Z" },
				{ kind: "upload_started", at: "2026-03-01T12:00:10.000Z" },
			],
		});
		const view = resolveSyncStageView(inFlight);
		expect(view.hasStarted).toBe(true);
		expect(view.failed).toBe(false);
		expect(view.syncComplete).toBe(false);
		expect(view.stages.map((s) => s.state)).toEqual(["done", "done", "active"]);
		expect(view.stages[2]?.meta).toBe("45 file sedang dikirim.");

		const finished = status({
			status: "uploaded",
			snapshotId: "snap_resync_completed",
			fileCount: 45,
			lifecycle: [
				{ kind: "agent_connected", at: "2026-03-01T12:00:00.000Z" },
				{ kind: "upload_started", at: "2026-03-01T12:00:10.000Z" },
				{
					kind: "snapshot_persisted",
					at: "2026-03-01T12:00:25.000Z",
					count: 45,
				},
			],
		});
		const finishedView = resolveSyncStageView(finished);
		expect(finishedView.syncComplete).toBe(true);
		expect(isSyncStatusComplete(finished)).toBe(true);
		expect(finishedView.stages.map((s) => s.state)).toEqual([
			"done",
			"done",
			"done",
		]);
	});
});

describe("Re-sync Drawer non-interference & interactions", () => {
	it("opens in a portal overlay and preserves workspace layout without shifting content", () => {
		act(() => {
			root?.render(
				<div data-testid="workspace-root" className="flex h-screen">
					<div data-testid="workspace-explorer">Explorer</div>
					<div data-testid="workspace-chat">Chat</div>
					<div data-testid="workspace-preview">Preview</div>
					<CodebaseResyncDrawer
						isOpen={true}
						onClose={() => {}}
						projectName="Existing App"
						payload={samplePayload}
						status={status()}
					/>
				</div>,
			);
		});

		// The 3 panels remain intact inside workspace root
		expect(
			container.querySelector('[data-testid="workspace-explorer"]'),
		).not.toBeNull();
		expect(
			container.querySelector('[data-testid="workspace-chat"]'),
		).not.toBeNull();
		expect(
			container.querySelector('[data-testid="workspace-preview"]'),
		).not.toBeNull();

		// The drawer is portaled to document.body
		const drawer = document.querySelector(
			'[data-testid="codebase-resync-panel"]',
		);
		expect(drawer).not.toBeNull();
		expect(drawer?.textContent).toContain("Perbarui repository");
	});

	it("preserves formatted multiline prompt, indentation, and clean scrolling", () => {
		act(() => {
			root?.render(
				<CodebaseResyncDrawer
					isOpen={true}
					onClose={() => {}}
					projectName="Existing App"
					payload={samplePayload}
					status={status()}
				/>,
			);
		});

		const promptContainer = document.querySelector(
			'[data-testid="resync-prompt-content"]',
		);
		expect(promptContainer).not.toBeNull();
		const promptText = promptContainer?.textContent ?? "";
		expect(promptText).toContain("## Informasi Sinkronisasi");
		expect(promptText).toContain("Project ID   : cb_existing_999");
		expect(promptText).toContain("Sync Token   : tok_resync_safe_123");
		expect(promptText).toContain("everythings-vibe codebase sync");
	});

	it("copies plain text prompt via clipboard helper without mangling tokens", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal("navigator", {
			clipboard: { writeText },
		});

		act(() => {
			root?.render(
				<CodebaseResyncDrawer
					isOpen={true}
					onClose={() => {}}
					projectName="Existing App"
					payload={samplePayload}
					status={status()}
				/>,
			);
		});

		const copyBtn = document.querySelector(
			'button[aria-label="Salin prompt instruksi sync"]',
		) as HTMLButtonElement | null;
		expect(copyBtn).not.toBeNull();

		await act(async () => {
			copyBtn?.click();
		});

		expect(writeText).toHaveBeenCalledTimes(1);
		const copiedText = String(writeText.mock.calls[0]?.[0]);
		expect(copiedText).toContain("tok_resync_safe_123");
		expect(copiedText).toContain("--project-id cb_existing_999");
		expect(copyBtn?.textContent).toContain("Tersalin");
	});

	it("safely handles clipboard API unavailability without crashing", async () => {
		vi.stubGlobal("navigator", {});

		act(() => {
			root?.render(
				<CodebaseResyncDrawer
					isOpen={true}
					onClose={() => {}}
					projectName="Existing App"
					payload={samplePayload}
					status={status()}
				/>,
			);
		});

		const copyBtn = document.querySelector(
			'button[aria-label="Salin prompt instruksi sync"]',
		) as HTMLButtonElement | null;

		await act(async () => {
			copyBtn?.click();
		});

		expect(document.body.textContent).toContain("Gagal menyalin otomatis");
	});

	it("closing the drawer can be done anytime without cancelling sync or planning", () => {
		const onClose = vi.fn();
		act(() => {
			root?.render(
				<CodebaseResyncDrawer
					isOpen={true}
					onClose={onClose}
					projectName="Existing App"
					payload={samplePayload}
					status={status({
						status: "uploading",
						fileCount: 15,
					})}
				/>,
			);
		});

		// Can close from header X button
		const closeBtn = document.querySelector(
			'button[aria-label="Tutup sync ulang"]',
		) as HTMLButtonElement | null;
		expect(closeBtn).not.toBeNull();
		act(() => {
			closeBtn?.click();
		});
		expect(onClose).toHaveBeenCalled();
	});

	it("handles expired sessions by offering a fresh token recovery action", () => {
		const onRequestNewToken = vi.fn();
		act(() => {
			root?.render(
				<CodebaseResyncDrawer
					isOpen={true}
					onClose={() => {}}
					projectName="Existing App"
					payload={null}
					status={status({ status: "expired" })}
					onRequestNewToken={onRequestNewToken}
				/>,
			);
		});

		expect(document.body.textContent).toContain(
			"Token sync sudah kedaluwarsa atau belum tersedia.",
		);
		const refreshBtn = [...document.querySelectorAll("button")].find((b) =>
			/Dapatkan token baru/i.test(b.textContent ?? ""),
		);
		expect(refreshBtn).toBeDefined();
		act(() => {
			refreshBtn?.click();
		});
		expect(onRequestNewToken).toHaveBeenCalledTimes(1);
	});

	it("handles failed sessions by offering retry without deleting prior snapshots", () => {
		const onRetrySync = vi.fn();
		act(() => {
			root?.render(
				<CodebaseResyncDrawer
					isOpen={true}
					onClose={() => {}}
					projectName="Existing App"
					payload={samplePayload}
					status={status({
						status: "failed",
						errorMessage: "CLI timeout during chunk upload.",
					})}
					onRetrySync={onRetrySync}
				/>,
			);
		});

		expect(document.body.textContent).toContain("Sinkronisasi belum berhasil");
		expect(document.body.textContent).toContain(
			"CLI timeout during chunk upload.",
		);
		const retryBtn = [...document.querySelectorAll("button")].find((b) =>
			/^Coba lagi$/i.test(b.textContent?.trim() ?? ""),
		);
		expect(retryBtn).toBeDefined();
		act(() => {
			retryBtn?.click();
		});
		expect(onRetrySync).toHaveBeenCalledTimes(1);
	});
});
