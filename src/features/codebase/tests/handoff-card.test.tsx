// @vitest-environment jsdom

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	buildExportPlanCommand,
	buildPlanHandoffPrompt,
	CodebaseChatWorkspaceHandoffCard,
} from "../components/chat/codebase-chat-workspace-handoff";

describe("P06 — CodebaseChatWorkspaceHandoffCard & Prompt Contracts", () => {
	const defaultProjectId = "prj_test_abc123";
	const defaultCodebaseName = "test-repo";
	const defaultFeatureName = "Filter dan Pencarian Proyek";
	const defaultExportCmd = buildExportPlanCommand(defaultProjectId);
	const defaultHandoffPrompt = buildPlanHandoffPrompt(
		defaultProjectId,
		defaultCodebaseName,
	);

	let writeTextMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.useFakeTimers();
		writeTextMock = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal("navigator", {
			clipboard: {
				writeText: writeTextMock,
			},
		});
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it("1. builds valid export command and handoff prompt with real project identity and no placeholders", () => {
		expect(defaultExportCmd).toBe(
			`npx everythings-vibe export plan ${defaultProjectId} --root .`,
		);
		expect(defaultHandoffPrompt).toContain(defaultExportCmd);
		expect(defaultHandoffPrompt).toContain(`Project ID: ${defaultProjectId}`);
		expect(defaultHandoffPrompt).toContain(defaultCodebaseName);
		expect(defaultHandoffPrompt).toContain("docs/vibeplan/manifest.json");
		expect(defaultHandoffPrompt).toContain("feature.md");
		expect(defaultHandoffPrompt).toContain("PRD.md");
		expect(defaultHandoffPrompt).toContain("AC.md");
		expect(defaultHandoffPrompt).toContain("tasks.json");
		expect(defaultHandoffPrompt).not.toMatch(
			/token|secret|bearer|api[-_]?key/i,
		);
		expect(defaultHandoffPrompt).not.toContain("<id>");
		expect(defaultHandoffPrompt).not.toContain("<projectId>");
	});

	it("2. renders focused handoff card without technical clutter or duplicate actions", () => {
		render(
			<CodebaseChatWorkspaceHandoffCard
				exportCmd={defaultExportCmd}
				handoffPrompt={defaultHandoffPrompt}
				featureName={defaultFeatureName}
				codebaseName={defaultCodebaseName}
				taskCount={12}
			/>,
		);

		const card = screen.getByTestId("codebase-handoff-card");
		expect(card).not.toBeNull();

		// Header & context
		expect(screen.getByText("Siap dikerjakan di coding agent")).toBeDefined();
		expect(screen.getByText(defaultFeatureName)).toBeDefined();
		expect(screen.getByText("12 task tersedia")).toBeDefined();
		expect(
			screen.getByText(
				/Planning selesai\. Salin instruksi berikut lalu jalankan melalui coding agent dari repository/,
			),
		).toBeDefined();

		// Instruction preview box
		expect(screen.getByText("Instruksi untuk coding agent")).toBeDefined();
		expect(
			screen.getByText(
				"Agent akan mengambil dokumen planning dan mengikuti urutan task yang tersedia.",
			),
		).toBeDefined();

		// Primary copy CTA
		const copyPromptBtn = screen.getByTestId("codebase-copy-prompt-btn");
		expect(copyPromptBtn).toBeDefined();
		expect(copyPromptBtn.textContent).toContain("Salin instruksi untuk agent");

		// Clutter removed: no technical polling paragraph and no standalone Buka Kanban button
		expect(card.textContent).not.toContain("polling");
		expect(card.textContent).not.toContain("tasks.json adalah snapshot");
		expect(screen.queryByRole("button", { name: "Buka Kanban" })).toBeNull();
		expect(
			screen.queryByRole("button", { name: "Salin prompt handoff" }),
		).toBeNull();

		// Manual export and revision buttons removed from handoff card per product design
		expect(screen.queryByTestId("codebase-manual-export-panel")).toBeNull();
		expect(screen.queryByTestId("codebase-manual-export-trigger")).toBeNull();
		expect(screen.queryByTestId("codebase-open-completed-revision")).toBeNull();
	});

	it("3. handles primary prompt copy and displays concise success feedback without claiming export happened", async () => {
		const onCopyCmd = vi.fn();
		render(
			<CodebaseChatWorkspaceHandoffCard
				exportCmd={defaultExportCmd}
				handoffPrompt={defaultHandoffPrompt}
				featureName={defaultFeatureName}
				taskCount={8}
				onCopyCmd={onCopyCmd}
			/>,
		);

		const copyBtn = screen.getByTestId("codebase-copy-prompt-btn");
		await act(async () => {
			fireEvent.click(copyBtn);
		});

		expect(onCopyCmd).toHaveBeenCalledTimes(1);
		expect(writeTextMock).toHaveBeenCalledWith(defaultHandoffPrompt);

		// Shows concise success state
		expect(copyBtn.textContent).toContain("Instruksi tersalin");
		// Does NOT falsely claim export occurred
		expect(screen.queryByText(/Planning berhasil diekspor/i)).toBeNull();
		expect(screen.queryByText(/Dokumen tersimpan ke repository/i)).toBeNull();

		// Resets after timeout
		act(() => {
			vi.advanceTimersByTime(2100);
		});
		expect(copyBtn.textContent).toContain("Salin instruksi untuk agent");
	});

	it("4. displays concise and useful error feedback when clipboard copy fails", async () => {
		writeTextMock.mockRejectedValueOnce(
			new Error("Clipboard permission denied"),
		);

		render(
			<CodebaseChatWorkspaceHandoffCard
				exportCmd={defaultExportCmd}
				handoffPrompt={defaultHandoffPrompt}
				featureName={defaultFeatureName}
			/>,
		);

		const copyBtn = screen.getByTestId("codebase-copy-prompt-btn");
		await act(async () => {
			fireEvent.click(copyBtn);
		});

		const errorAlert = screen.getByTestId("codebase-handoff-copy-error");
		expect(errorAlert).toBeDefined();
		expect(errorAlert.textContent).toContain("Gagal menyalin otomatis");
		expect(copyBtn.textContent).not.toContain("Instruksi tersalin");

		act(() => {
			vi.advanceTimersByTime(3600);
		});
		expect(screen.queryByTestId("codebase-handoff-copy-error")).toBeNull();
	});

	it("5. does not render manual export disclosure on the handoff card", () => {
		render(
			<CodebaseChatWorkspaceHandoffCard
				exportCmd={defaultExportCmd}
				handoffPrompt={defaultHandoffPrompt}
			/>,
		);

		expect(screen.queryByTestId("codebase-manual-export-trigger")).toBeNull();
		expect(screen.queryByTestId("codebase-manual-export-panel")).toBeNull();
	});

	it("6. keeps handoff focused without revision controls once handoff is reached", () => {
		render(
			<CodebaseChatWorkspaceHandoffCard
				exportCmd={defaultExportCmd}
				handoffPrompt={defaultHandoffPrompt}
				isRevisingCompletedPlan={false}
				onStartCompletedRevision={vi.fn()}
			/>,
		);

		expect(screen.queryByTestId("codebase-open-completed-revision")).toBeNull();
		expect(
			screen.queryByTestId("codebase-cancel-completed-revision"),
		).toBeNull();
	});
});
