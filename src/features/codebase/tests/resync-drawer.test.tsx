// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
	SyncPromptPayload,
	SyncStatusResponse,
} from "@/features/codebase/services/sync";
import { CodebaseResyncDrawer } from "../components/planning/codebase-resync-drawer";

const samplePayload: SyncPromptPayload = {
	projectId: "cb_resync_123",
	apiBaseUrl: "https://prdfy.example.com",
	syncToken: "tok_resync_secret",
	cliMinVersion: "2.0.0",
	syncCommand: "everythings-vibe codebase sync",
	expiresAt: new Date(Date.now() + 60000).toISOString(),
};

function status(
	overrides: Partial<SyncStatusResponse> = {},
): SyncStatusResponse {
	return {
		projectId: "cb_resync_123",
		sessionId: "sess_resync_1",
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

describe("CodebaseResyncDrawer", () => {
	it("renders in a portal overlay without affecting parent workspace layout", () => {
		act(() => {
			root?.render(
				<CodebaseResyncDrawer
					isOpen={true}
					onClose={() => {}}
					projectName="Test Repo"
					payload={samplePayload}
					status={status()}
				/>,
			);
		});

		// The drawer renders in document.body via Portal
		const panel = document.querySelector(
			'[data-testid="codebase-resync-panel"]',
		);
		expect(panel).not.toBeNull();
		expect(panel?.textContent).toContain("Perbarui repository");
		expect(panel?.textContent).toContain("Salin instruksi sync ulang");
	});

	it("renders multiline formatted prompt with proper scroll container", () => {
		act(() => {
			root?.render(
				<CodebaseResyncDrawer
					isOpen={true}
					onClose={() => {}}
					projectName="Test Repo"
					payload={samplePayload}
					status={status()}
				/>,
			);
		});

		const promptEl = document.querySelector(
			'[data-testid="resync-prompt-content"]',
		);
		expect(promptEl).not.toBeNull();
		expect(promptEl?.textContent).toContain("cb_resync_123");
		expect(promptEl?.textContent).toContain("tok_resync_secret");
		expect(promptEl?.textContent).toContain("## Informasi Sinkronisasi");
		// Ensure whitespace formatting classes are applied
		expect(promptEl?.className).toContain("whitespace-pre-wrap");
		expect(promptEl?.className).toContain("overflow-y-auto");
	});

	it("copies full prompt and displays feedback", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal("navigator", {
			clipboard: { writeText },
		});

		act(() => {
			root?.render(
				<CodebaseResyncDrawer
					isOpen={true}
					onClose={() => {}}
					projectName="Test Repo"
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
		expect(String(writeText.mock.calls[0]?.[0])).toContain("tok_resync_secret");
		expect(copyBtn?.textContent).toContain("Tersalin");
	});

	it("displays safe error feedback if clipboard copy fails", async () => {
		const writeText = vi.fn().mockRejectedValue(new Error("Permission denied"));
		vi.stubGlobal("navigator", {
			clipboard: { writeText },
		});

		act(() => {
			root?.render(
				<CodebaseResyncDrawer
					isOpen={true}
					onClose={() => {}}
					projectName="Test Repo"
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

	it("calls onClose when close button is clicked", () => {
		const onClose = vi.fn();
		act(() => {
			root?.render(
				<CodebaseResyncDrawer
					isOpen={true}
					onClose={onClose}
					projectName="Test Repo"
					payload={samplePayload}
					status={status()}
				/>,
			);
		});

		const closeBtn = document.querySelector(
			'button[aria-label="Tutup sync ulang"]',
		) as HTMLButtonElement | null;
		expect(closeBtn).not.toBeNull();
		act(() => {
			closeBtn?.click();
		});
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("renders progress timeline when sync starts", () => {
		act(() => {
			root?.render(
				<CodebaseResyncDrawer
					isOpen={true}
					onClose={() => {}}
					projectName="Test Repo"
					payload={samplePayload}
					status={status({
						status: "uploading",
						fileCount: 42,
					})}
				/>,
			);
		});

		expect(document.body.textContent).toContain("Status sinkronisasi");
		expect(document.body.textContent).toContain("Agent terhubung");
		expect(document.body.textContent).toContain("Source code siap");
		expect(document.body.textContent).toContain("Mengunggah repository...");
		expect(document.body.textContent).toContain("42 file sedang dikirim.");
	});

	it("offers token recovery when payload is absent", () => {
		const onRequestNewToken = vi.fn();
		act(() => {
			root?.render(
				<CodebaseResyncDrawer
					isOpen={true}
					onClose={() => {}}
					projectName="Test Repo"
					payload={null}
					status={status()}
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

	it("offers retry when status is failed", () => {
		const onRetrySync = vi.fn();
		act(() => {
			root?.render(
				<CodebaseResyncDrawer
					isOpen={true}
					onClose={() => {}}
					projectName="Test Repo"
					payload={samplePayload}
					status={status({
						status: "failed",
						errorMessage: "Jaringan terputus saat upload snapshot.",
					})}
					onRetrySync={onRetrySync}
				/>,
			);
		});

		expect(document.body.textContent).toContain("Sinkronisasi belum berhasil");
		expect(document.body.textContent).toContain(
			"Jaringan terputus saat upload snapshot.",
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
