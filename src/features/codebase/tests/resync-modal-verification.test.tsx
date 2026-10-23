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
	syncCommand: "vibeeverything codebase sync --project-id cb_p4_test_project",
	expiresAt: "2026-12-31T23:59:59.000Z",
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
		it("initial sync prompt differs distinctly from re-sync prompt", () => {
			const initialPrompt = buildAgentPrompt(samplePayload, {
				projectName: "Ocean Guard",
			});
			const resyncPrompt = buildResyncPrompt(samplePayload, {
				projectName: "Ocean Guard",
			});

			// Initial prompt intent
			expect(initialPrompt).toContain(
				"Sinkronkan codebase repositori lokal ini ke project VibeEverything",
			);
			expect(initialPrompt).not.toContain(
				"Perbarui snapshot repository existing",
			);

			// Re-sync prompt intent & 10 required constraints
			expect(resyncPrompt).toContain(
				"Perbarui snapshot repository existing di VibeEverything menggunakan CLI resmi.",
			);
			expect(resyncPrompt).toContain("Repository ini sudah terhubung.");
			expect(resyncPrompt).toContain(
				"Jalankan perintah di root repositori Git yang sama dengan sinkronisasi sebelumnya.",
			);
			expect(resyncPrompt).toContain(
				"Fokus hanya pada pembaruan snapshot codebase terkini.",
			);
			expect(resyncPrompt).toContain("Jangan mengubah source code proyek.");
			expect(resyncPrompt).toContain(
				"Jangan mengubah PRD, Acceptance Criteria (AC), atau Task yang sudah ada.",
			);
			expect(resyncPrompt).toContain(
				"Jangan membuat repository, project, atau riwayat baru.",
			);
			expect(resyncPrompt).toContain("Jangan membuat commit atau push.");
			expect(resyncPrompt).toContain(
				"Laporkan hasil output CLI asli secara akurat.",
			);
			expect(resyncPrompt).toContain(
				"Jangan menyatakan analisis AI selesai jika yang baru selesai adalah upload snapshot.",
			);
		});

		it("preserves identical, valid CLI command format across both prompt builders", () => {
			const expectedCommand = `vibeeverything codebase sync --project-id ${samplePayload.projectId} --sync-token ${samplePayload.syncToken}`;
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

		it("verifies completion when the new session reaches uploaded with a valid snapshot", () => {
			expect(
				isResyncSessionVerified({
					status: createStatus({
						sessionId: "sess_p4_new",
						status: "uploaded",
						snapshotId: "snap_new_persisted_123",
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
			});

			expect(
				isResyncSessionVerified({
					status: deduplicatedStatus,
					activeSessionId: "sess_p4_new",
				}),
			).toBe(true);
		});

		it("verifies transport sync completion even when AI analysis is still pending", () => {
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
			).toBe(true);
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

		it("renders centered modal with comfortable width and internal scrolling", () => {
			renderModal();

			const panel = document.querySelector(
				'[data-testid="codebase-resync-panel"]',
			);
			expect(panel).not.toBeNull();
			// Desktop width and constrained viewport height
			expect(panel?.className).toContain("sm:max-w-xl");
			expect(panel?.className).toContain("max-h-[85vh]");

			// Header title and description
			expect(panel?.textContent).toContain("Perbarui repository");
			expect(panel?.textContent).toContain("Ocean Guard");
		});

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

		it("enables Selesai button and shows success banner when session is verified", () => {
			renderModal({
				status: createStatus({
					sessionId: "sess_p4_new",
					status: "uploaded",
					fileCount: 24,
					snapshotId: "snap_verified_456",
				}),
			});

			const completeBtn = document.querySelector(
				'[data-testid="resync-complete-button"]',
			) as HTMLButtonElement | null;
			expect(completeBtn).not.toBeNull();
			expect(completeBtn?.disabled).toBe(false);
			expect(completeBtn?.getAttribute("aria-label")).toBe("Selesai");

			const banner = document.querySelector(
				'[data-testid="resync-success-banner"]',
			);
			expect(banner).not.toBeNull();
			expect(banner?.textContent).toContain("Sinkronisasi berhasil");
			expect(banner?.textContent).toContain("Source code terbaru tersimpan.");
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

		it("does not display outdated 'Drawer dapat ditutup tanpa membatalkan proses.' copy", () => {
			renderModal({
				status: createStatus({
					status: "uploading",
					fileCount: 10,
				}),
			});

			expect(document.body.textContent).not.toContain(
				"Drawer dapat ditutup tanpa membatalkan proses",
			);
		});
	});
});
