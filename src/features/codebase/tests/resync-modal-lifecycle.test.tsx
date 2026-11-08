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
	projectId: "cb_p4_test_project",
	sessionId: "sess_p4_new",
	apiBaseUrl: "https://vibeeverything.test",
	syncToken: "tok_secret_p4_verify",
	cliMinVersion: "0.1.0",
	syncCommand: "everythings-vibe codebase sync --project-id cb_p4_test_project",
	expiresAt: new Date(Date.now() + 600000).toISOString(),
};
function createStatus(
	overrides: Partial<SyncStatusResponse> = {},
): SyncStatusResponse {
	return {
		projectId: "cb_p4_test_project",
		sessionId: "sess_p4_new",
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
describe("P6 Phase Requirements: Section 11 Verification Suite", () => {
	const renderModal = (props: Partial<CodebaseResyncModalProps> = {}) => {
		act(() => {
			root?.render(
				<CodebaseResyncModal
					isOpen={true}
					onClose={props.onClose ?? (() => {})}
					projectName="Ocean Guard"
					payload={props.payload !== undefined ? props.payload : samplePayload}
					status={
						props.status !== undefined
							? props.status
							: createStatus({ status: "uploading", fileCount: 15 })
					}
					activeSessionId={props.activeSessionId ?? "sess_p4_new"}
					{...props}
				/>,
			);
		});
	};

	it("1. Only one accessible Close button", () => {
		renderModal();
		// There should be exactly one close button in the panel
		const closeButtons = document.querySelectorAll(
			'button[aria-label="Tutup sync ulang"]',
		);
		expect(closeButtons).toHaveLength(1);

		// Radix sr-only or close button in dialog should also be exactly 1
		const allModalCloseButtons = document.querySelectorAll(
			'[data-testid="codebase-resync-panel"] button',
		);
		const closeMatches = [...allModalCloseButtons].filter((btn) =>
			/tutup|close/i.test(
				btn.getAttribute("aria-label") ?? btn.textContent ?? "",
			),
		);
		expect(closeMatches).toHaveLength(1);
	});

	it("2. Closing modal doesn't cancel background sync unless explicitly designed", () => {
		const onClose = vi.fn();
		renderModal({ onClose });

		const closeBtn = document.querySelector(
			'button[aria-label="Tutup sync ulang"]',
		) as HTMLButtonElement | null;
		expect(closeBtn).not.toBeNull();

		act(() => {
			closeBtn?.click();
		});

		// Modal triggers dismissal request
		expect(onClose).toHaveBeenCalledTimes(1);
		// Background sync props are unaffected by UI closing
	});

	it("4. Step states follow backend status", () => {
		// State 1: Instructions available, waiting for CLI
		renderModal({
			status: createStatus({ status: "waiting_for_cli" }),
		});
		const step1 = document.querySelector('[data-testid="resync-step-1"]');
		const step2 = document.querySelector('[data-testid="resync-step-2"]');
		const step3 = document.querySelector('[data-testid="resync-step-3"]');

		expect(step1?.getAttribute("data-step-state")).toBe("done");
		// The agent step waits for the user; it must not spin before the CLI
		// actually contacts the server.
		expect(step2?.getAttribute("data-step-state")).toBe("pending");
		expect(step3?.getAttribute("data-step-state")).toBe("pending");

		// State 2: CLI connected and syncing
		renderModal({
			status: createStatus({ status: "uploading", fileCount: 10 }),
		});
		expect(
			document
				.querySelector('[data-testid="resync-step-2"]')
				?.getAttribute("data-step-state"),
		).toBe("done");
		expect(
			document
				.querySelector('[data-testid="resync-step-3"]')
				?.getAttribute("data-step-state"),
		).toBe("active");

		// State 3: Snapshot received and verified
		renderModal({
			status: createStatus({
				status: "uploaded",
				snapshotId: "snap_verified_123",
				analysisStatus: "ready",
				analysisId: "analysis-new",
			}),
			activeSessionId: "sess_p4_new",
		});
		expect(
			document
				.querySelector('[data-testid="resync-step-3"]')
				?.getAttribute("data-step-state"),
		).toBe("done");

		// State 4: Failed session
		renderModal({
			status: createStatus({ status: "failed" }),
		});
		expect(
			document
				.querySelector('[data-testid="resync-step-2"]')
				?.getAttribute("data-step-state"),
		).toBe("failed");
		expect(
			document
				.querySelector('[data-testid="resync-step-3"]')
				?.getAttribute("data-step-state"),
		).toBe("failed");
	});

	it("4b. Waits passively for the user instead of spinning before the CLI runs", () => {
		renderModal({ status: createStatus({ status: "waiting_for_cli" }) });
		const panel = document.querySelector(
			'[data-testid="codebase-resync-panel"]',
		);
		// Nothing is running: the prompt is on screen but has not been run, so no
		// indicator — step badge or stage row — may spin.
		expect(panel?.querySelectorAll('[data-testid="spinner"]')).toHaveLength(0);
		expect(panel?.querySelector("[role='timer']")).toBeNull();
		expect(
			document.querySelectorAll(
				'[data-testid="resync-step-3"] [data-stage-state="waiting"]',
			),
		).toHaveLength(4);
		for (const testId of [
			"sync-stage-agent",
			"sync-stage-preparing",
			"sync-stage-sync",
			"sync-stage-analysis",
		]) {
			expect(
				document
					.querySelector(`[data-testid="${testId}"]`)
					?.getAttribute("data-stage-state"),
			).toBe("waiting");
		}
	});

	it("5. Copy button copies entire prompt", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal("navigator", {
			...navigator,
			clipboard: { writeText },
		});

		renderModal({ projectName: "Ocean Guard" });

		const copyBtn = document.querySelector(
			'button[aria-label="Salin prompt instruksi sync"]',
		) as HTMLButtonElement | null;
		expect(copyBtn).not.toBeNull();

		await act(async () => {
			copyBtn?.click();
		});

		expect(writeText).toHaveBeenCalledTimes(1);
		const copiedArg = writeText.mock.calls[0][0];
		expect(copiedArg).toContain("cb_p4_test_project");
		expect(copiedArg).toContain("tok_secret_p4_verify");
		expect(copiedArg).toContain("codebase sync");
		expect(copiedArg).toContain("Ocean Guard");
	});

	it("8. Selesai disabled before verification", () => {
		renderModal({
			status: createStatus({
				status: "uploading",
				snapshotId: null,
			}),
		});
		const completeBtn = document.querySelector(
			'[data-testid="resync-complete-button"]',
		) as HTMLButtonElement | null;
		expect(completeBtn?.disabled).toBe(true);
	});

	it("9. Selesai enabled after current session success", () => {
		renderModal({
			status: createStatus({
				sessionId: "sess_p4_new",
				status: "uploaded",
				snapshotId: "snap_success_current",
				analysisStatus: "ready",
				analysisId: "analysis-new",
			}),
			activeSessionId: "sess_p4_new",
		});
		const completeBtn = document.querySelector(
			'[data-testid="resync-complete-button"]',
		) as HTMLButtonElement | null;
		expect(completeBtn?.disabled).toBe(false);
	});

	it("10. Old snapshot cannot enable Selesai", () => {
		renderModal({
			status: createStatus({
				sessionId: "sess_p4_old",
				status: "ready",
				snapshotId: "snap_stale_prior",
			}),
			activeSessionId: "sess_p4_new",
		});
		const completeBtn = document.querySelector(
			'[data-testid="resync-complete-button"]',
		) as HTMLButtonElement | null;
		expect(completeBtn?.disabled).toBe(true);
	});

	it("11. Reopen maintains active session", () => {
		// Render opened
		renderModal({
			status: createStatus({ status: "uploading", fileCount: 7 }),
		});
		expect(document.body.textContent).toContain("Perbarui repository");

		// Simulate closing and reopening with same active session
		act(() => {
			root?.render(
				<CodebaseResyncModal
					isOpen={false}
					onClose={() => {}}
					projectName="Ocean Guard"
					payload={samplePayload}
					status={createStatus({ status: "uploading", fileCount: 7 })}
					activeSessionId="sess_p4_new"
				/>,
			);
		});
		expect(
			document.querySelector('[data-testid="codebase-resync-panel"]'),
		).toBeNull();

		// Reopen
		act(() => {
			root?.render(
				<CodebaseResyncModal
					isOpen={true}
					onClose={() => {}}
					projectName="Ocean Guard"
					payload={samplePayload}
					status={createStatus({ status: "uploading", fileCount: 7 })}
					activeSessionId="sess_p4_new"
				/>,
			);
		});
		expect(
			document.querySelector('[data-testid="codebase-resync-panel"]'),
		).not.toBeNull();
		expect(
			document
				.querySelector('[data-testid="resync-step-2"]')
				?.getAttribute("data-step-state"),
		).toBe("done");
	});
});
