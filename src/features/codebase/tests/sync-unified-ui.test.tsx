// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodebaseResyncModal } from "../components/planning/codebase-resync-modal";
import { ScreenConnect } from "../components/workspace/screen-connect";
import { ScreenConnectPromptStep } from "../components/workspace/screen-connect-prompt-step";
import { ScreenConnectSyncStep } from "../components/workspace/screen-connect-sync-step";
import {
	resolveSyncStageView,
	type SyncPromptPayload,
	type SyncStatusResponse,
} from "../services/sync";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const samplePayload: SyncPromptPayload = {
	projectId: "cb_p5_test_proj",
	sessionId: "sess_p5_new",
	apiBaseUrl: "https://test.local",
	syncToken: "tok_secret_p5_test",
	cliMinVersion: "0.1.0",
	syncCommand: "everythings-vibe codebase sync --project-id cb_p5_test_proj",
	expiresAt: new Date(Date.now() + 600000).toISOString(),
};

function createStatus(
	overrides: Partial<SyncStatusResponse> = {},
): SyncStatusResponse {
	return {
		projectId: "cb_p5_test_proj",
		sessionId: "sess_p5_new",
		status: "waiting_for_cli",
		snapshotId: null,
		errorMessage: null,
		lifecycle: [],
		...overrides,
	};
}

describe("FIX 05: Unified Sync and Re-sync UI (Section 12 Requirements)", () => {
	// 1. Step connectors render consistently
	it("renders vertical step connectors consistently between step 1, 2, and 3", () => {
		const { container } = render(
			<ScreenConnect
				projectName="Test Repo"
				payload={samplePayload}
				status={createStatus()}
			/>,
		);

		const connector1 = container.querySelector(
			'[data-testid="step-connector-1"]',
		);
		const connector2 = container.querySelector(
			'[data-testid="step-connector-2"]',
		);
		expect(connector1).not.toBeNull();
		expect(connector2).not.toBeNull();
		expect(connector1?.getAttribute("aria-hidden")).toBe("true");
		expect(connector2?.getAttribute("aria-hidden")).toBe("true");
	});

	// 2. Initial sync and re-sync reuse the same major step components
	it("reuses the same major step components in re-sync modal as initial sync", () => {
		render(
			<CodebaseResyncModal
				isOpen
				onClose={() => {}}
				projectName="Test Repo"
				payload={samplePayload}
				status={createStatus({ status: "uploading", fileCount: 10 })}
			/>,
		);

		expect(document.querySelector('[data-testid="prompt-box"]')).not.toBeNull();
		for (const id of [
			"ai-harness-logos",
			"sync-stage-sync",
			"step-connector-1",
			"step-connector-2",
		]) {
			expect(document.querySelector(`[data-testid="${id}"]`)).not.toBeNull();
		}
	});

	// 3. Agent logos visible in both flows
	it("displays AI coding agent logos in both initial sync and re-sync flows", () => {
		const initial = render(
			<ScreenConnect
				projectName="Initial Flow"
				payload={samplePayload}
				status={createStatus()}
			/>,
		);
		for (const id of [
			"ai-harness-logos",
			"ai-harness-codex",
			"ai-harness-claude-code",
			"ai-harness-cursor",
		]) {
			expect(
				initial.container.querySelector(`[data-testid="${id}"]`),
			).not.toBeNull();
		}
		initial.unmount();

		const resync = render(
			<CodebaseResyncModal
				isOpen
				onClose={() => {}}
				projectName="Resync Flow"
				payload={samplePayload}
				status={createStatus()}
			/>,
		);
		for (const id of [
			"ai-harness-logos",
			"ai-harness-codex",
			"ai-harness-claude-code",
			"ai-harness-cursor",
		]) {
			expect(document.querySelector(`[data-testid="${id}"]`)).not.toBeNull();
		}
		resync.unmount();
	});

	// 4. Credit note removed from prompt area
	it("does not render inline credit note in the prompt area", () => {
		render(
			<ScreenConnect
				projectName="Test Repo"
				payload={samplePayload}
				status={createStatus()}
				creditNote="Analisis hingga 12 kredit · 102 kredit tersedia."
			/>,
		);

		expect(screen.queryByText(/Analisis hingga 12 kredit/)).toBeNull();
		expect(screen.queryByText(/102 kredit tersedia/)).toBeNull();
	});

	// 5. Prompt available state
	it("renders prompt text and copy button when session payload is available", () => {
		render(
			<ScreenConnectPromptStep
				projectName="Test Repo"
				payload={samplePayload}
				isStarting={false}
				status={createStatus()}
			/>,
		);

		const copyBtn = screen.getByRole("button", {
			name: "Salin prompt untuk AI agent",
		});
		expect(copyBtn).toBeDefined();
		expect(screen.getByTestId("prompt-box").textContent).toContain(
			"tok_secret_p5_test",
		);
	});

	// 6. Prompt unavailable recovery state
	it("renders State C actionable recovery when credential is unavailable", () => {
		const onReplace = vi.fn();
		render(
			<ScreenConnectPromptStep
				projectName="Test Repo"
				payload={null}
				isStarting={false}
				status={null}
				onRequestNewToken={onReplace}
			/>,
		);

		expect(
			screen.getByText("Instruksi sync sebelumnya tidak tersedia."),
		).toBeDefined();
		expect(
			screen.getByText("Buat instruksi baru untuk melanjutkan."),
		).toBeDefined();
		const actionBtn = screen.getByRole("button", {
			name: "Buat instruksi baru",
		});
		expect(actionBtn).toBeDefined();

		fireEvent.click(actionBtn);
		expect(onReplace).toHaveBeenCalledTimes(1);
	});

	// 7. Waiting for agent
	it("renders passive waiting state for agent without fake progress", () => {
		render(
			<ScreenConnectSyncStep
				status={createStatus({ status: "waiting_for_cli" })}
				stageView={resolveSyncStageView(
					createStatus({ status: "waiting_for_cli" }),
				)}
				canRetry={false}
				statusError={null}
				isStarting={false}
				hasSession={true}
				canContinueToSummary={false}
				analysis={null}
				analysisError={null}
				isAnalyzing={false}
				isLegacyAnalysisMissingSuggestions={false}
			/>,
		);

		expect(screen.getByText("Menunggu agent")).toBeDefined();
		expect(screen.queryByTestId("spinner")).toBeNull();
	});

	// 8. Current-session progress (State D)
	it("renders State D when agent is actively syncing without premature completion", () => {
		render(
			<ScreenConnectPromptStep
				projectName="Test Repo"
				payload={null}
				isStarting={false}
				status={createStatus({ status: "uploading", fileCount: 15 })}
			/>,
		);

		expect(screen.getByText("Repository sedang disinkronkan.")).toBeDefined();
		expect(screen.getByText("Pantau progresnya di bawah.")).toBeDefined();
		expect(
			screen.queryByRole("button", { name: "Buat instruksi baru" }),
		).toBeNull();
	});

	// 9. Completed state (State E)
	it("renders State E completion when snapshot is stored", () => {
		render(
			<ScreenConnectPromptStep
				projectName="Test Repo"
				payload={null}
				isStarting={false}
				status={createStatus({
					status: "uploaded",
					snapshotId: "snap_p5_done",
				})}
			/>,
		);

		expect(screen.getByText("Sinkronisasi selesai.")).toBeDefined();
		expect(
			screen.getByText("Snapshot repository telah berhasil dibuat."),
		).toBeDefined();
	});

	// 10. Failed session state (State F)
	it("renders failure recovery when session creation fails", () => {
		const onRetry = vi.fn();
		render(
			<CodebaseResyncModal
				isOpen
				onClose={() => {}}
				projectName="Test Repo"
				payload={null}
				status={null}
				sessionError="Sesi sync gagal dibuat."
				onRetrySession={onRetry}
			/>,
		);

		expect(screen.getByText("Sinkronisasi belum bisa dimulai.")).toBeDefined();
		const retryBtn = screen.getByRole("button", { name: "Coba lagi" });
		expect(retryBtn).toBeDefined();
		fireEvent.click(retryBtn);
		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	// 11. Selesai only when verified
	it("enables Selesai only when the session is verified complete and provides Tutup otherwise", () => {
		const onClose = vi.fn();
		const { rerender } = render(
			<CodebaseResyncModal
				isOpen
				onClose={onClose}
				projectName="Test Repo"
				payload={samplePayload}
				status={createStatus({ status: "uploading" })}
				activeSessionId="sess_p5_new"
			/>,
		);

		const completeBtn = screen.getByTestId<HTMLButtonElement>(
			"resync-complete-button",
		);
		expect(completeBtn.disabled).toBe(true);
		expect(completeBtn.getAttribute("aria-label")).toContain(
			"menunggu verifikasi sinkronisasi",
		);

		// Tutup button is available before completion
		const closeBtn = screen.getByRole("button", { name: "Tutup" });
		expect(closeBtn).toBeDefined();
		fireEvent.click(closeBtn);
		expect(onClose).toHaveBeenCalledTimes(1);

		// Now simulate verified completion
		rerender(
			<CodebaseResyncModal
				isOpen
				onClose={onClose}
				projectName="Test Repo"
				payload={samplePayload}
				status={createStatus({
					status: "uploaded",
					snapshotId: "snap_verified_123",
					analysisStatus: "ready",
					analysisId: "analysis_123",
				})}
				activeSessionId="sess_p5_new"
			/>,
		);

		const verifiedBtn = screen.getByTestId<HTMLButtonElement>(
			"resync-complete-button",
		);
		expect(verifiedBtn.disabled).toBe(false);
		expect(verifiedBtn.getAttribute("aria-label")).toBe("Selesai");
		expect(screen.queryByRole("button", { name: "Tutup" })).toBeNull();
	});

	// 12. Copy button uses the actual prompt
	it("copies the actual prompt content to clipboard", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });

		render(
			<ScreenConnectPromptStep
				projectName="Test Repo"
				payload={samplePayload}
				isStarting={false}
				status={createStatus()}
			/>,
		);

		const copyBtn = screen.getByRole("button", {
			name: "Salin prompt untuk AI agent",
		});
		fireEvent.click(copyBtn);

		expect(writeText).toHaveBeenCalledTimes(1);
		const copiedText = String(writeText.mock.calls[0]?.[0]);
		expect(copiedText).toContain("tok_secret_p5_test");
		expect(copiedText).toContain("everythings-vibe codebase sync");
	});

	// 13. Responsive layout constraints
	it("applies responsive layout classes and max-w-2xl width to re-sync modal", () => {
		render(
			<CodebaseResyncModal
				isOpen
				onClose={() => {}}
				projectName="Test Repo"
				payload={samplePayload}
				status={createStatus()}
			/>,
		);

		const panel = screen.getByTestId("codebase-resync-panel");
		expect(panel.className).toContain("sm:max-w-2xl");
		expect(panel.className).toContain("overflow-hidden");
	});

	// 14. No regression on existing sync behavior
	it("preserves agent step and sync stage order across renders", () => {
		render(
			<ScreenConnect
				projectName="Test Repo"
				payload={samplePayload}
				status={createStatus({ status: "connected" })}
			/>,
		);

		expect(
			screen.getByText("Sync codebase dengan everythings-vibe"),
		).toBeDefined();
		expect(
			screen.getByText("Buka AI coding agent di repository kamu"),
		).toBeDefined();
		expect(screen.getByText("Pantau progres")).toBeDefined();
	});
});
