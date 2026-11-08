// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	CodebaseResyncModal,
	type CodebaseResyncModalProps,
} from "../components/planning/codebase-resync-modal";
import type { SyncPromptPayload, SyncStatusResponse } from "../services/sync";

const samplePayload: SyncPromptPayload = {
	projectId: "cb_resync_contract",
	sessionId: "sess_resync_new",
	apiBaseUrl: "https://vibeeverything.test",
	syncToken: "tok_resync_contract",
	cliMinVersion: "0.1.0",
	syncCommand: "everythings-vibe codebase sync --project-id cb_resync_contract",
	expiresAt: new Date(Date.now() + 600000).toISOString(),
};

function createStatus(
	overrides: Partial<SyncStatusResponse> = {},
): SyncStatusResponse {
	return {
		projectId: "cb_resync_contract",
		sessionId: "sess_resync_new",
		status: "waiting_for_cli",
		snapshotId: null,
		errorMessage: null,
		lifecycle: [],
		...overrides,
	};
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	document.body.innerHTML = "";
	vi.unstubAllGlobals();
});

function renderModal(props: Partial<CodebaseResyncModalProps> = {}) {
	act(() => {
		root.render(
			<CodebaseResyncModal
				isOpen
				onClose={() => {}}
				projectName="Ocean Guard"
				payload={props.payload !== undefined ? props.payload : samplePayload}
				status={props.status !== undefined ? props.status : createStatus()}
				activeSessionId={props.activeSessionId ?? "sess_resync_new"}
				{...props}
			/>,
		);
	});
}

function panel(): Element | null {
	return document.querySelector('[data-testid="codebase-resync-panel"]');
}

describe("re-sync modal presentation contract", () => {
	it("renders exactly one dialog with one close control and the approved header", () => {
		renderModal();

		const dialogs = document.querySelectorAll('[role="dialog"]');
		expect(dialogs).toHaveLength(1);
		expect(
			document.querySelectorAll('[data-testid="codebase-resync-panel"]'),
		).toHaveLength(1);
		expect(panel()?.textContent).toContain("Perbarui repository");
		expect(panel()?.textContent).toContain("Ocean Guard");
		expect(
			document.querySelectorAll('button[aria-label="Tutup sync ulang"]'),
		).toHaveLength(1);
	});

	it("reuses the onboarding prompt row and copies the real re-sync prompt", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
		renderModal();

		// Same prompt box as the onboarding sync screen.
		expect(document.querySelector('[data-testid="prompt-box"]')).not.toBeNull();
		expect(panel()?.textContent).toContain("Salin instruksi sync ulang");
		expect(panel()?.textContent).toContain("Jalankan di AI coding agent");
		expect(panel()?.textContent).toContain(
			"Gunakan root repository yang sama.",
		);
		expect(panel()?.textContent).toContain("Pantau sinkronisasi");
		const prompt = document.querySelector(
			'[data-testid="resync-prompt-content"]',
		);
		expect(prompt?.textContent).toContain("tok_resync_contract");
		expect(prompt?.textContent).toContain("Perbarui snapshot repository");

		const copyButton = document.querySelector(
			'button[aria-label="Salin instruksi sync ulang"]',
		) as HTMLButtonElement | null;
		expect(copyButton?.textContent).toContain("Salin");

		await act(async () => {
			copyButton?.click();
		});
		expect(writeText).toHaveBeenCalledTimes(1);
		expect(String(writeText.mock.calls[0]?.[0])).toContain(
			"tok_resync_contract",
		);
		expect(copyButton?.textContent).toContain("Tersalin");
	});

	it("never shows a technical token warning for a normal re-sync", () => {
		renderModal();
		const text = panel()?.textContent ?? "";
		expect(text).not.toContain("Token sync sudah kedaluwarsa");
		expect(text).not.toContain("Dapatkan token baru");
	});

	it("waits passively for the agent without spinning", () => {
		renderModal({ status: createStatus({ status: "waiting_for_cli" }) });
		expect(panel()?.querySelectorAll('[data-testid="spinner"]')).toHaveLength(
			0,
		);
		expect(
			document
				.querySelector('[data-testid="sync-stage-agent"]')
				?.getAttribute("data-stage-state"),
		).toBe("waiting");
		expect(panel()?.textContent).toContain("Menunggu agent");
	});

	it("renders the server-confirmed progress while the CLI is active", () => {
		renderModal({
			status: createStatus({ status: "uploading", fileCount: 12 }),
		});
		expect(
			document
				.querySelector('[data-testid="sync-stage-sync"]')
				?.getAttribute("data-stage-state"),
		).toBe("active");
		expect(panel()?.textContent).toContain("Agent terhubung");
		expect(panel()?.textContent).toContain("Source code siap");
		expect(panel()?.textContent).toContain("Mengunggah repository...");
	});

	it("does not paint progress from a previous session under the new attempt", () => {
		renderModal({
			status: createStatus({
				sessionId: "sess_resync_old",
				status: "uploading",
				fileCount: 99,
			}),
		});
		expect(
			document.querySelector('[data-testid="sync-stage-sync"]'),
		).toBeNull();
		expect(panel()?.textContent).not.toContain("Mengunggah repository");
		expect(panel()?.textContent).not.toContain("99");
	});

	it("keeps Selesai disabled until the active attempt is verified", () => {
		renderModal({ status: createStatus({ status: "uploading" }) });
		const button = document.querySelector(
			'[data-testid="resync-complete-button"]',
		) as HTMLButtonElement | null;
		expect(button?.disabled).toBe(true);
		expect(button?.getAttribute("aria-label")).toBe(
			"Selesai (menunggu verifikasi sinkronisasi)",
		);
	});

	it("enables Selesai and marks analysis complete without a refresh", () => {
		renderModal({
			status: createStatus({
				status: "uploaded",
				snapshotId: "snap_verified",
				analysisStatus: "ready",
				analysisId: "analysis_verified",
			}),
		});
		const button = document.querySelector(
			'[data-testid="resync-complete-button"]',
		) as HTMLButtonElement | null;
		expect(button?.disabled).toBe(false);
		expect(button?.getAttribute("aria-label")).toBe("Selesai");
		expect(panel()?.textContent).toContain("Sinkronisasi selesai");
		expect(panel()?.textContent).toContain("Analisis selesai");
	});

	it("shows a genuine session failure once, with one working retry", () => {
		const onRetrySession = vi.fn();
		renderModal({
			payload: null,
			status: null,
			activeSessionId: null,
			sessionError: "Sesi sync gagal dibuat. Coba lagi.",
			onRetrySession,
		});

		const text = panel()?.textContent ?? "";
		expect(text).toContain("Sinkronisasi belum bisa dimulai.");
		expect(text).not.toContain("Sesi sync gagal dibuat.");
		expect(
			[...document.querySelectorAll("button")].filter((button) =>
				/^Coba lagi$/.test(button.textContent?.trim() ?? ""),
			),
		).toHaveLength(1);

		const retry = [...document.querySelectorAll("button")].find((button) =>
			/^Coba lagi$/.test(button.textContent?.trim() ?? ""),
		);
		act(() => retry?.click());
		expect(onRetrySession).toHaveBeenCalledTimes(1);
	});

	it("removes the failure and shows the real prompt after a successful retry", () => {
		renderModal({
			payload: null,
			status: null,
			activeSessionId: null,
			sessionError: "Sesi sync gagal dibuat. Coba lagi.",
		});
		expect(panel()?.textContent).toContain("Sinkronisasi belum bisa dimulai.");

		renderModal();
		const text = panel()?.textContent ?? "";
		expect(text).not.toContain("Sinkronisasi belum bisa dimulai.");
		expect(text).toContain("tok_resync_contract");
	});

	it("closes without cancelling the server operation", () => {
		const onClose = vi.fn();
		renderModal({
			onClose,
			status: createStatus({ status: "uploading" }),
		});
		const close = document.querySelector(
			'button[aria-label="Tutup sync ulang"]',
		) as HTMLButtonElement | null;
		act(() => close?.click());
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("keeps keyboard dismissal intact", () => {
		const onClose = vi.fn();
		renderModal({ onClose });
		act(() => {
			document.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: "Escape",
					code: "Escape",
					bubbles: true,
				}),
			);
		});
		expect(onClose).toHaveBeenCalledTimes(1);
	});
});
