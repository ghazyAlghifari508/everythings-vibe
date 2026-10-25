// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	CodebaseResyncModal,
	type CodebaseResyncModalProps,
} from "../components/planning/codebase-resync-modal";
import { ScreenConnect } from "../components/workspace/screen-connect";
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
				"Sinkronkan codebase repositori lokal ini ke project everythings-vibe",
			);
			expect(initialPrompt).not.toContain(
				"Perbarui snapshot repository existing",
			);

			// Re-sync prompt intent & 10 required constraints
			expect(resyncPrompt).toContain(
				"Perbarui snapshot repository existing di everythings-vibe menggunakan CLI resmi.",
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

	describe("P6 Phase Requirements: Section 11 Verification Suite", () => {
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

		it("3. Modal uses correct repository identity", () => {
			// Real canonical name
			renderModal({ projectName: "Ocean Guard" });
			const panel = document.querySelector(
				'[data-testid="codebase-resync-panel"]',
			);
			expect(panel?.textContent).toContain("Ocean Guard");

			// Provisional name is suppressed and replaced by canonical neutral identity
			renderModal({ projectName: "Repository Lokal" });
			expect(panel?.textContent).not.toContain("Repository Lokal");
			expect(panel?.textContent).toContain("Repository belum terdeteksi");

			// Empty or blank name
			renderModal({ projectName: "   " });
			expect(panel?.textContent).toContain("Repository belum terdeteksi");
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
			expect(step2?.getAttribute("data-step-state")).toBe("active");
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

		it("6. Long prompt remains readable without horizontal layout breakage", () => {
			renderModal();
			const promptContainer = document.querySelector(
				'[data-testid="resync-prompt-content"]',
			);
			expect(promptContainer).not.toBeNull();
			// Must have internal overflow and wrap styles
			expect(promptContainer?.className).toContain("overflow-x-auto");
			expect(promptContainer?.className).toContain("overflow-y-auto");
			expect(promptContainer?.className).toContain("whitespace-pre-wrap");

			const panel = document.querySelector(
				'[data-testid="codebase-resync-panel"]',
			);
			expect(panel?.className).toContain("sm:max-w-xl");
			expect(panel?.className).toContain("overflow-hidden");
		});

		it("7. Footer design token matches modal", () => {
			renderModal();
			const footer = document.querySelector(
				'[data-testid="codebase-resync-panel"] footer, [data-testid="codebase-resync-panel"] .border-t',
			);
			expect(footer).not.toBeNull();
			// Must use modal background token (bg-obsidian), not contrasting bg-charcoal/60
			expect(footer?.className).toContain("bg-obsidian");
			expect(footer?.className).not.toContain("bg-charcoal/60");
			expect(footer?.className).toContain("border-graphite");
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

		it("12. Existing onboarding flow remains unaffected", () => {
			// Render ScreenConnect from onboarding
			act(() => {
				root?.render(
					<ScreenConnect
						projectName="Ocean Guard"
						payload={samplePayload}
						status={null}
					/>,
				);
			});
			expect(document.body.textContent).toContain(
				"Sync codebase dengan everythings-vibe",
			);
			expect(document.body.textContent).toContain("Copy prompt untuk AI agent");
			expect(document.body.textContent).toContain(
				"Buka AI coding agent di repository kamu",
			);
		});

		it("13. No duplicate Dialog overlays or conflicting interactive controls", () => {
			renderModal();
			const overlays = document.querySelectorAll(
				'[data-state="open"].fixed.inset-0',
			);
			expect(overlays).toHaveLength(1);

			const panels = document.querySelectorAll(
				'[data-testid="codebase-resync-panel"]',
			);
			expect(panels).toHaveLength(1);
		});
	});
});
