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

		// Raw export command is tucked away into the disclosure, not dominating the card
		expect(screen.queryByTestId("codebase-manual-export-panel")).toBeNull();
		const disclosureTrigger = screen.getByTestId(
			"codebase-manual-export-trigger",
		);
		expect(disclosureTrigger.getAttribute("aria-expanded")).toBe("false");
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

	it("5. expands and collapses the manual export command disclosure cleanly", async () => {
		const onCopyExport = vi.fn();
		render(
			<CodebaseChatWorkspaceHandoffCard
				exportCmd={defaultExportCmd}
				handoffPrompt={defaultHandoffPrompt}
				onCopyExport={onCopyExport}
			/>,
		);

		const trigger = screen.getByTestId("codebase-manual-export-trigger");
		expect(trigger.getAttribute("aria-expanded")).toBe("false");
		expect(screen.queryByTestId("codebase-manual-export-panel")).toBeNull();

		// Expand disclosure
		fireEvent.click(trigger);
		expect(trigger.getAttribute("aria-expanded")).toBe("true");

		const panel = screen.getByTestId("codebase-manual-export-panel");
		expect(panel).not.toBeNull();
		expect(panel.textContent).toContain("Ekspor dokumen secara manual");
		expect(panel.textContent).toContain(
			"Jalankan perintah berikut dari root repository untuk menyimpan dokumen planning.",
		);
		expect(panel.textContent).toContain(defaultExportCmd);

		// Copy export command
		const copyExportBtn = screen.getByTestId("codebase-copy-export-cmd-btn");
		expect(copyExportBtn.textContent).toContain("Salin perintah");

		await act(async () => {
			fireEvent.click(copyExportBtn);
		});
		expect(onCopyExport).toHaveBeenCalledTimes(1);
		expect(writeTextMock).toHaveBeenCalledWith(defaultExportCmd);
		expect(copyExportBtn.textContent).toContain("Tersalin");

		// Collapse disclosure
		fireEvent.click(trigger);
		expect(trigger.getAttribute("aria-expanded")).toBe("false");
		expect(screen.queryByTestId("codebase-manual-export-panel")).toBeNull();
	});

	it("6. supports plan revision flow through optional revision controls when reopening completed plan", () => {
		const onStartCompletedRevision = vi.fn();
		const onCancelCompletedRevision = vi.fn();

		const { rerender } = render(
			<CodebaseChatWorkspaceHandoffCard
				exportCmd={defaultExportCmd}
				handoffPrompt={defaultHandoffPrompt}
				isRevisingCompletedPlan={false}
				onStartCompletedRevision={onStartCompletedRevision}
			/>,
		);

		const reviseBtn = screen.getByTestId("codebase-open-completed-revision");
		expect(reviseBtn.textContent).toContain("Revisi Planning");
		fireEvent.click(reviseBtn);
		expect(onStartCompletedRevision).toHaveBeenCalledTimes(1);

		// While in revision mode, offers cancel button
		rerender(
			<CodebaseChatWorkspaceHandoffCard
				exportCmd={defaultExportCmd}
				handoffPrompt={defaultHandoffPrompt}
				isRevisingCompletedPlan={true}
				onCancelCompletedRevision={onCancelCompletedRevision}
			/>,
		);

		const cancelBtn = screen.getByTestId("codebase-cancel-completed-revision");
		expect(cancelBtn.textContent).toContain("Batal Revisi");
		fireEvent.click(cancelBtn);
		expect(onCancelCompletedRevision).toHaveBeenCalledTimes(1);
	});

	it("7. displays concise error feedback when copying manual export command fails", async () => {
		writeTextMock.mockRejectedValueOnce(
			new Error("Clipboard permission denied"),
		);

		render(
			<CodebaseChatWorkspaceHandoffCard
				exportCmd={defaultExportCmd}
				handoffPrompt={defaultHandoffPrompt}
			/>,
		);

		const trigger = screen.getByTestId("codebase-manual-export-trigger");
		fireEvent.click(trigger);

		const copyExportBtn = screen.getByTestId("codebase-copy-export-cmd-btn");
		await act(async () => {
			fireEvent.click(copyExportBtn);
		});

		const errorAlert = screen.getByTestId("codebase-handoff-copy-error");
		expect(errorAlert).toBeDefined();
		expect(errorAlert.textContent).toContain("Gagal menyalin otomatis");
		expect(copyExportBtn.textContent).not.toContain("Tersalin");
	});
});
