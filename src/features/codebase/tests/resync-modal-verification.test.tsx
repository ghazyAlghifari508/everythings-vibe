// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	CodebaseResyncModal,
	type CodebaseResyncModalProps,
} from "../components/planning/codebase-resync-modal";
import {
	buildAgentPrompt,
	buildResyncPrompt,
	isResyncSessionVerified,
	type SyncPromptPayload,
	type SyncStatusResponse,
} from "../services/sync";

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

describe("P4: Re-Sync Modal & Session-Verified Completion", () => {
	let container: HTMLDivElement | null = null;
	let root: Root | null = null;

	beforeEach(() => {
		(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => {
			root?.unmount();
		});
		container?.remove();
		document.body.innerHTML = "";
		vi.unstubAllGlobals();
	});

	describe("Prompt Discrimination & CLI Command Safety", () => {
		it("preserves identical, valid CLI command format across both prompt builders", () => {
			const expectedCommand = `everythings-vibe codebase sync --project-id ${samplePayload.projectId} --sync-token ${samplePayload.syncToken}`;
			const initialPrompt = buildAgentPrompt(samplePayload);
			const resyncPrompt = buildResyncPrompt(samplePayload);

			expect(initialPrompt).toContain(expectedCommand);
			expect(resyncPrompt).toContain(expectedCommand);
		});
	});

	describe("Completion Gating Engine (isResyncSessionVerified)", () => {
		it("rejects completion when status is null or snapshotId is missing", () => {
			expect(
				isResyncSessionVerified({
					status: null,
					activeSessionId: "sess_p4_new",
				}),
			).toBe(false);

			expect(
				isResyncSessionVerified({
					status: createStatus({ status: "waiting_for_cli", snapshotId: null }),
					activeSessionId: "sess_p4_new",
				}),
			).toBe(false);

			expect(
				isResyncSessionVerified({
					status: createStatus({ status: "uploading", snapshotId: null }),
					activeSessionId: "sess_p4_new",
				}),
			).toBe(false);
		});

		it("rejects completion when status belongs to an older session even if snapshot exists", () => {
			const staleStatus = createStatus({
				sessionId: "sess_old_prior",
				status: "ready",
				snapshotId: "snap_old_snapshot_id",
			});

			// Active session is sess_p4_new, but status is from sess_old_prior
			expect(
				isResyncSessionVerified({
					status: staleStatus,
					activeSessionId: "sess_p4_new",
				}),
			).toBe(false);
		});

		it("rejects completion for failed or expired sessions", () => {
			expect(
				isResyncSessionVerified({
					status: createStatus({
						sessionId: "sess_p4_new",
						status: "failed",
						snapshotId: "snap_broken",
					}),
					activeSessionId: "sess_p4_new",
				}),
			).toBe(false);

			expect(
				isResyncSessionVerified({
					status: createStatus({
						sessionId: "sess_p4_new",
						status: "expired",
						snapshotId: null,
					}),
					activeSessionId: "sess_p4_new",
				}),
			).toBe(false);
		});

		it("verifies completion when the new snapshot has a readable analysis", () => {
			expect(
				isResyncSessionVerified({
					status: createStatus({
						sessionId: "sess_p4_new",
						status: "uploaded",
						snapshotId: "snap_new_persisted_123",
						analysisStatus: "ready",
						analysisId: "analysis-new",
					}),
					activeSessionId: "sess_p4_new",
				}),
			).toBe(true);
		});

		it("supports same-content successful sync when backend deduplicates snapshot", () => {
			// Backend deduplicates identical content and points to existing snapshot ID
			const deduplicatedStatus = createStatus({
				sessionId: "sess_p4_new",
				status: "uploaded",
				snapshotId: "snap_deduplicated_existing_id",
				analysisStatus: "ready",
				analysisId: "analysis-new",
			});

			expect(
				isResyncSessionVerified({
					status: deduplicatedStatus,
					activeSessionId: "sess_p4_new",
				}),
			).toBe(true);
		});

		it("keeps completion disabled while AI analysis is pending", () => {
			const analysisPendingStatus = createStatus({
				sessionId: "sess_p4_new",
				status: "uploaded",
				snapshotId: "snap_new_persisted_123",
				analysisStatus: "pending",
			});

			expect(
				isResyncSessionVerified({
					status: analysisPendingStatus,
					activeSessionId: "sess_p4_new",
				}),
			).toBe(false);
		});
	});

	describe("Modal UI Behavior & Dismissal Rules", () => {
		const renderModal = (props: Partial<CodebaseResyncModalProps> = {}) => {
			act(() => {
				root?.render(
					<CodebaseResyncModal
						isOpen={true}
						onClose={props.onClose ?? (() => {})}
						projectName="Ocean Guard"
						payload={
							props.payload !== undefined ? props.payload : samplePayload
						}
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

		it("disables Selesai button when session is incomplete", () => {
			renderModal({
				status: createStatus({
					status: "uploading",
					fileCount: 10,
					snapshotId: null,
				}),
			});

			const completeBtn = document.querySelector(
				'[data-testid="resync-complete-button"]',
			) as HTMLButtonElement | null;
			expect(completeBtn).not.toBeNull();
			expect(completeBtn?.disabled).toBe(true);
			expect(completeBtn?.getAttribute("aria-label")).toContain(
				"menunggu verifikasi sinkronisasi",
			);
			expect(
				document.querySelector('[data-testid="resync-success-banner"]'),
			).toBeNull();
		});

		it("enables Selesai and marks the analysis complete when the session is verified", () => {
			renderModal({
				status: createStatus({
					sessionId: "sess_p4_new",
					status: "uploaded",
					fileCount: 24,
					snapshotId: "snap_verified_456",
					analysisStatus: "ready",
					analysisId: "analysis-new",
				}),
			});

			const completeBtn = document.querySelector(
				'[data-testid="resync-complete-button"]',
			) as HTMLButtonElement | null;
			expect(completeBtn).not.toBeNull();
			expect(completeBtn?.disabled).toBe(false);
			expect(completeBtn?.getAttribute("aria-label")).toBe("Selesai");
			expect(document.body.textContent).toContain("Sinkronisasi selesai");
			expect(document.body.textContent).toContain("Analisis selesai");
			expect(
				document.querySelector('[data-testid="resync-success-banner"]'),
			).toBeNull();
		});

		it("closes modal only when user explicitly clicks Selesai", () => {
			const onClose = vi.fn();
			renderModal({
				onClose,
				status: createStatus({
					sessionId: "sess_p4_new",
					status: "uploaded",
					fileCount: 24,
					snapshotId: "snap_verified_456",
					analysisStatus: "ready",
					analysisId: "analysis-new",
				}),
			});

			const completeBtn = document.querySelector(
				'[data-testid="resync-complete-button"]',
			) as HTMLButtonElement | null;
			expect(completeBtn?.disabled).toBe(false);

			// Still open until user clicks
			expect(onClose).not.toHaveBeenCalled();

			act(() => {
				completeBtn?.click();
			});

			expect(onClose).toHaveBeenCalledTimes(1);
		});
	});
});
