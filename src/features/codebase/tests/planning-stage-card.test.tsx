// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodebaseChatWorkspace } from "../components/chat/codebase-chat-workspace";
import { CodebasePlanningStageCard } from "../components/chat/codebase-planning-stage-card";
import type { CodebaseArtifactRef } from "../components/explorer/codebase-file-card";

afterEach(cleanup);

const mockFeatureArtifact: CodebaseArtifactRef = {
	id: "feature-proj-1",
	fileName: "feature-auth.json",
	fileSizeBytes: 2048,
	badge: "FITUR",
	description: "Spesifikasi Fitur Autentikasi",
	title: "Spesifikasi Fitur Autentikasi",
};

const mockPrdArtifact: CodebaseArtifactRef = {
	id: "prd-proj-1",
	fileName: "prd-auth.json",
	fileSizeBytes: 8192,
	badge: "PRD",
	description: "Dokumen Kebutuhan PRD Autentikasi",
	title: "PRD Autentikasi",
};

const mockAcArtifact: CodebaseArtifactRef = {
	id: "ac-proj-1",
	fileName: "ac-auth.json",
	fileSizeBytes: 4096,
	badge: "AC",
	description: "Kriteria Penerimaan Autentikasi",
	title: "Acceptance Criteria Autentikasi",
};

const mockTasksArtifact: CodebaseArtifactRef = {
	id: "tasks-proj-1",
	fileName: "tasks-auth.json",
	fileSizeBytes: 5120,
	badge: "TASK",
	description: "Daftar Pekerjaan Implementasi",
	title: "Tasks Autentikasi",
};

describe("P05 — Unified Planning Stage Card", () => {
	it("1. Feature specification created: renders unified card with 1 row, Revisi, and Buat PRD", () => {
		const onGeneratePrd = vi.fn();
		const onStartRevision = vi.fn();

		render(
			<CodebasePlanningStageCard
				featureName="Autentikasi Pengguna"
				stage="feature"
				artifacts={[mockFeatureArtifact]}
				onGeneratePrd={onGeneratePrd}
				onStartRevision={onStartRevision}
			/>,
		);

		// Header
		expect(screen.getByText("Dokumen Perencanaan")).toBeTruthy();
		expect(screen.getByText("Autentikasi Pengguna")).toBeTruthy();

		// Document row
		const rows = screen.getAllByTestId("codebase-file-card");
		expect(rows).toHaveLength(1);
		expect(rows[0]?.textContent).toContain("Spesifikasi Fitur");
		expect(rows[0]?.querySelector("[data-status='persisted']")).toBeTruthy();

		// Actions
		expect(screen.getByTestId("codebase-planning-action-revise")).toBeTruthy();
		const prdBtn = screen.getByTestId("codebase-stage-prd-btn");
		expect(prdBtn.textContent).toContain("Buat PRD");

		fireEvent.click(prdBtn);
		expect(onGeneratePrd).toHaveBeenCalledTimes(1);

		fireEvent.click(screen.getByTestId("codebase-planning-action-revise"));
		expect(onStartRevision).toHaveBeenCalledWith(mockFeatureArtifact);
	});

	it("2. PRD generation: loading state, failure with retry, and success transition", () => {
		const onGeneratePrd = vi.fn();
		const onRetryStage = vi.fn();

		const { rerender } = render(
			<CodebasePlanningStageCard
				featureName="Autentikasi Pengguna"
				stage="feature"
				stageBusy="prd"
				artifacts={[mockFeatureArtifact]}
				onGeneratePrd={onGeneratePrd}
			/>,
		);

		// Loading state
		const busyBtn = screen.getByTestId(
			"codebase-stage-prd-btn",
		) as HTMLButtonElement;
		expect(busyBtn.disabled).toBe(true);
		expect(busyBtn.textContent).toContain("Menyusun PRD...");

		// Failure state with retry
		rerender(
			<CodebasePlanningStageCard
				featureName="Autentikasi Pengguna"
				stage="feature"
				stageError="Koneksi terputus saat generate PRD"
				artifacts={[mockFeatureArtifact]}
				onGeneratePrd={onGeneratePrd}
				onRetryStage={onRetryStage}
			/>,
		);

		const alert = screen.getByRole("alert");
		expect(alert.textContent).toContain("Koneksi terputus saat generate PRD");
		fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
		expect(onRetryStage).toHaveBeenCalledTimes(1);

		// Success state: PRD artifact persisted -> PRD row added and next action becomes Buat AC
		rerender(
			<CodebasePlanningStageCard
				featureName="Autentikasi Pengguna"
				stage="prd"
				artifacts={[mockFeatureArtifact, mockPrdArtifact]}
				onGenerateAc={vi.fn()}
			/>,
		);

		const rows = screen.getAllByTestId("codebase-file-card");
		expect(rows).toHaveLength(2);
		expect(rows[0]?.textContent).toContain("Spesifikasi Fitur");
		expect(rows[1]?.textContent).toContain("PRD");
		expect(screen.getByTestId("codebase-stage-ac-btn").textContent).toContain(
			"Buat AC",
		);
		expect(screen.queryByTestId("codebase-stage-prd-btn")).toBeNull();
	});

	it("3. AC generation: loading state, failure with retry, and success transition", () => {
		const onGenerateAc = vi.fn();
		const onRetryStage = vi.fn();

		const { rerender } = render(
			<CodebasePlanningStageCard
				featureName="Autentikasi Pengguna"
				stage="prd"
				stageBusy="ac"
				artifacts={[mockFeatureArtifact, mockPrdArtifact]}
				onGenerateAc={onGenerateAc}
			/>,
		);

		// Loading state
		const busyBtn = screen.getByTestId(
			"codebase-stage-ac-btn",
		) as HTMLButtonElement;
		expect(busyBtn.disabled).toBe(true);
		expect(busyBtn.textContent).toContain("Menyusun AC...");

		// Failure state
		rerender(
			<CodebasePlanningStageCard
				featureName="Autentikasi Pengguna"
				stage="prd"
				stageError="Gagal menyusun kriteria penerimaan"
				artifacts={[mockFeatureArtifact, mockPrdArtifact]}
				onGenerateAc={onGenerateAc}
				onRetryStage={onRetryStage}
			/>,
		);
		expect(screen.getByRole("alert").textContent).toContain(
			"Gagal menyusun kriteria penerimaan",
		);
		fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
		expect(onRetryStage).toHaveBeenCalledTimes(1);

		// Success state: AC artifact persisted -> AC row added and next action becomes Buat Task
		rerender(
			<CodebasePlanningStageCard
				featureName="Autentikasi Pengguna"
				stage="ac"
				artifacts={[mockFeatureArtifact, mockPrdArtifact, mockAcArtifact]}
				onGenerateTask={vi.fn()}
			/>,
		);

		const rows = screen.getAllByTestId("codebase-file-card");
		expect(rows).toHaveLength(3);
		expect(rows[2]?.textContent).toContain("Acceptance Criteria");
		expect(screen.getByTestId("codebase-stage-task-btn").textContent).toContain(
			"Buat Task",
		);
		expect(screen.queryByTestId("codebase-stage-ac-btn")).toBeNull();
	});

	it("4. Task generation: hides CTA when tasksUnresolved, shows busy state, and transitions to Buat Handoff", () => {
		const onGenerateTask = vi.fn();
		const onTriggerHandoff = vi.fn();

		const { rerender } = render(
			<CodebasePlanningStageCard
				featureName="Autentikasi Pengguna"
				stage="ac"
				tasksUnresolved={true}
				artifacts={[mockFeatureArtifact, mockPrdArtifact, mockAcArtifact]}
				onGenerateTask={onGenerateTask}
			/>,
		);

		// Hidden while tasks unresolved
		expect(screen.queryByTestId("codebase-stage-task-btn")).toBeNull();

		// Visible when resolved, but busy while running
		rerender(
			<CodebasePlanningStageCard
				featureName="Autentikasi Pengguna"
				stage="ac"
				stageBusy="task"
				tasksUnresolved={false}
				artifacts={[mockFeatureArtifact, mockPrdArtifact, mockAcArtifact]}
				onGenerateTask={onGenerateTask}
			/>,
		);
		const busyBtn = screen.getByTestId(
			"codebase-stage-task-btn",
		) as HTMLButtonElement;
		expect(busyBtn.disabled).toBe(true);
		expect(busyBtn.textContent).toContain("Menyusun task...");

		// Completed: Task row added, summary text shown, and right action is Buat Handoff
		rerender(
			<CodebasePlanningStageCard
				featureName="Autentikasi Pengguna"
				stage="handoff"
				taskCount={12}
				artifacts={[
					mockFeatureArtifact,
					mockPrdArtifact,
					mockAcArtifact,
					mockTasksArtifact,
				]}
				onTriggerHandoff={onTriggerHandoff}
			/>,
		);

		const rows = screen.getAllByTestId("codebase-file-card");
		expect(rows).toHaveLength(4);
		expect(rows[3]?.textContent).toContain("Task");
		expect(
			screen.getByTestId("codebase-planning-task-summary").textContent,
		).toBe("12 task berhasil dibuat.");

		const handoffBtn = screen.getByTestId("codebase-stage-handoff-btn");
		expect(handoffBtn.textContent).toContain("Buat Handoff");
		fireEvent.click(handoffBtn);
		expect(onTriggerHandoff).toHaveBeenCalledTimes(1);
	});

	it("5. Partial artifact hydration: only displays actually persisted artifacts", () => {
		// Only Feature and PRD are in artifacts (AC hydration failed or pending)
		render(
			<CodebasePlanningStageCard
				featureName="Filter Pencarian"
				stage="prd"
				artifacts={[mockFeatureArtifact, mockPrdArtifact]}
				onGenerateAc={vi.fn()}
			/>,
		);

		const rows = screen.getAllByTestId("codebase-file-card");
		expect(rows).toHaveLength(2);
		expect(rows[0]?.textContent).toContain("Spesifikasi Fitur");
		expect(rows[1]?.textContent).toContain("PRD");
		const fileNames = screen
			.getAllByTestId("codebase-file-name")
			.map((el) => el.textContent ?? "");
		expect(fileNames.some((name) => name.includes("Acceptance Criteria"))).toBe(
			false,
		);
		expect(fileNames.some((name) => name.includes("Task"))).toBe(false);
		expect(screen.getByTestId("codebase-stage-ac-btn")).toBeTruthy();
	});

	it("6. Reopen at PRD stage: hydrates existing documents and offers Buat AC", () => {
		render(
			<CodebasePlanningStageCard
				featureName="Filter Pencarian"
				stage="prd"
				artifacts={[mockFeatureArtifact, mockPrdArtifact]}
				onGenerateAc={vi.fn()}
			/>,
		);

		expect(screen.getAllByTestId("codebase-file-card")).toHaveLength(2);
		expect(screen.getByTestId("codebase-stage-ac-btn").textContent).toContain(
			"Buat AC",
		);
		expect(screen.queryByTestId("codebase-stage-prd-btn")).toBeNull();
		expect(screen.queryByTestId("codebase-stage-task-btn")).toBeNull();
	});

	it("7. Reopen at AC stage: hydrates existing documents and offers Buat Task", () => {
		render(
			<CodebasePlanningStageCard
				featureName="Filter Pencarian"
				stage="ac"
				artifacts={[mockFeatureArtifact, mockPrdArtifact, mockAcArtifact]}
				onGenerateTask={vi.fn()}
			/>,
		);

		expect(screen.getAllByTestId("codebase-file-card")).toHaveLength(3);
		expect(screen.getByTestId("codebase-stage-task-btn").textContent).toContain(
			"Buat Task",
		);
		expect(screen.queryByTestId("codebase-stage-ac-btn")).toBeNull();
		expect(screen.queryByTestId("codebase-stage-prd-btn")).toBeNull();
	});

	it("8. Reopen at Task stage: hydrates all 4 documents and offers Buat Handoff", () => {
		render(
			<CodebasePlanningStageCard
				featureName="Filter Pencarian"
				stage="handoff"
				taskCount={8}
				artifacts={[
					mockFeatureArtifact,
					mockPrdArtifact,
					mockAcArtifact,
					mockTasksArtifact,
				]}
				onTriggerHandoff={vi.fn()}
			/>,
		);

		expect(screen.getAllByTestId("codebase-file-card")).toHaveLength(4);
		expect(
			screen.getByTestId("codebase-planning-task-summary").textContent,
		).toBe("8 task berhasil dibuat.");
		expect(
			screen.getByTestId("codebase-stage-handoff-btn").textContent,
		).toContain("Buat Handoff");
		expect(screen.queryByTestId("codebase-stage-task-btn")).toBeNull();
	});

	it("9. Revision targeting: main Revisi targets latest completed document, row Revisi targets specific artifact", () => {
		const onStartRevision = vi.fn();

		render(
			<CodebasePlanningStageCard
				featureName="Autentikasi Pengguna"
				stage="ac"
				artifacts={[mockFeatureArtifact, mockPrdArtifact, mockAcArtifact]}
				onStartRevision={onStartRevision}
				onGenerateTask={vi.fn()}
			/>,
		);

		// Main Revisi button at AC stage targets the AC document
		fireEvent.click(screen.getByTestId("codebase-planning-action-revise"));
		expect(onStartRevision).toHaveBeenLastCalledWith(mockAcArtifact);

		// Individual row Revisi button targets specific document
		const reviseFeatureBtn = screen.getByTestId(
			"codebase-document-revise-feature",
		);
		fireEvent.click(reviseFeatureBtn);
		expect(onStartRevision).toHaveBeenLastCalledWith(mockFeatureArtifact);

		const revisePrdBtn = screen.getByTestId("codebase-document-revise-prd");
		fireEvent.click(revisePrdBtn);
		expect(onStartRevision).toHaveBeenLastCalledWith(mockPrdArtifact);
	});

	it("10. Switching feature plan safely updates title and artifacts without duplicates", () => {
		const { rerender } = render(
			<CodebasePlanningStageCard
				featureName="Fitur Lama"
				stage="feature"
				artifacts={[mockFeatureArtifact]}
			/>,
		);
		expect(screen.getByText("Fitur Lama")).toBeTruthy();
		expect(screen.getAllByTestId("codebase-file-card")).toHaveLength(1);

		const newFeatureArtifact: CodebaseArtifactRef = {
			id: "feature-proj-2",
			fileName: "feature-billing.json",
			fileSizeBytes: 3000,
			badge: "FITUR",
			description: "Fitur Billing Baru",
		};

		rerender(
			<CodebasePlanningStageCard
				featureName="Fitur Baru"
				stage="feature"
				artifacts={[newFeatureArtifact]}
			/>,
		);

		expect(screen.getByText("Fitur Baru")).toBeTruthy();
		expect(screen.queryByText("Fitur Lama")).toBeNull();
		const rows = screen.getAllByTestId("codebase-file-card");
		expect(rows).toHaveLength(1);
		expect(rows[0]?.textContent).toContain("Fitur Billing Baru");
	});

	it("11 & 12 & 13. Invariants: no duplicate rows, single next-stage CTA, no document loss", () => {
		const onGenerateTask = vi.fn();

		render(
			<CodebasePlanningStageCard
				featureName="Dashboard"
				stage="ac"
				artifacts={[mockFeatureArtifact, mockPrdArtifact, mockAcArtifact]}
				onGenerateTask={onGenerateTask}
			/>,
		);

		// No duplicate rows
		const fileNames = screen
			.getAllByTestId("codebase-file-name")
			.map((el) => el.textContent);
		const uniqueNames = new Set(fileNames);
		expect(fileNames.length).toBe(uniqueNames.size);
		expect(fileNames).toHaveLength(3);

		// Single next-stage CTA on the right side
		const actionsContainer = screen.getByTestId("codebase-stage-actions");
		const rightButtons = actionsContainer.querySelectorAll(
			"button:not([data-testid='codebase-planning-action-revise'])",
		);
		expect(rightButtons).toHaveLength(1);
		expect(rightButtons[0]?.textContent).toContain("Buat Task");

		// All earlier documents retained
		expect(screen.getByText("Spesifikasi Fitur")).toBeTruthy();
		expect(screen.getByText("PRD")).toBeTruthy();
		expect(screen.getByText("Acceptance Criteria")).toBeTruthy();
	});

	it("14. Integration with CodebaseChatWorkspace: clicking Revisi switches composer to revise mode with @ reference", () => {
		const onComposerModeChange = vi.fn();
		const onReferencesChange = vi.fn();
		const onChangeRevisionTarget = vi.fn();

		render(
			<CodebaseChatWorkspace
				featureName="Autentikasi Pengguna"
				projectId="proj-1"
				codebaseId="repo-1"
				stage="prd"
				messages={[{ id: "m1", role: "user", content: "Halo" }]}
				questions={[]}
				answers={{}}
				artifacts={[mockFeatureArtifact, mockPrdArtifact]}
				onComposerModeChange={onComposerModeChange}
				onReferencesChange={onReferencesChange}
				onChangeRevisionTarget={onChangeRevisionTarget}
			/>,
		);

		// Click the Revisi button on the unified planning stage card
		const reviseBtn = screen.getByTestId("codebase-planning-action-revise");
		fireEvent.click(reviseBtn);

		// Mode changes to revise
		expect(onComposerModeChange).toHaveBeenCalledWith("revise");

		// Revision target is set to prd
		expect(onChangeRevisionTarget).toHaveBeenCalledWith("prd");

		// A real @ reference binding is attached
		expect(onReferencesChange).toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "artifact",
					id: mockPrdArtifact.id,
					targetKind: "prd",
				}),
			]),
		);
	});
});
