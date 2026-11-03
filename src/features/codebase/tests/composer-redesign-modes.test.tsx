// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	renderHook,
	screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { settleRun, startRun } from "@/features/codebase/services/chat-flow";
import { CodebaseChatWorkspace } from "../components/chat/codebase-chat-workspace";
import { useWorkspaceComposer } from "../hooks/use-workspace-composer";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const prdArtifact = {
	id: "prd-proj-1",
	title: "PRD · Pencarian Artikel",
	fileName: "PRD-pencarian-artikel.md",
	fileSizeBytes: 2048,
	badge: "MARKDOWN",
	description: "Dokumen siap",
};

const repoFiles = [
	{ path: "src/pages/Content.jsx" },
	{ path: "package.json" },
	{ path: "README.md" },
];

describe("Phase 07 Composer Redesign — Plan/Revise Modes & Workflow Separation", () => {
	it("1 & 2. defaults to Plan mode on new feature and switches Plan/Revise via dropdown without AI requests", () => {
		const onSendMessage = vi.fn();
		const onComposerModeChange = vi.fn();
		render(
			<CodebaseChatWorkspace
				featureName="Pencarian Artikel"
				projectId="proj-1"
				codebaseId="repo-1"
				currentSnapshotId="snap-1"
				messages={[{ id: "m1", role: "user", content: "Mulai fitur" }]}
				questions={[]}
				answers={{}}
				artifacts={[prdArtifact]}
				onSendMessage={onSendMessage}
				onComposerModeChange={onComposerModeChange}
			/>,
		);

		const modeTrigger = screen.getByTestId("composer-mode-trigger");
		expect(modeTrigger.getAttribute("data-mode")).toBe("plan");
		expect(modeTrigger.textContent).toContain("Plan");

		fireEvent.click(modeTrigger);
		fireEvent.click(screen.getByTestId("composer-mode-option-revise"));

		expect(modeTrigger.getAttribute("data-mode")).toBe("revise");
		expect(onComposerModeChange).toHaveBeenCalledWith("revise");
		expect(onSendMessage).not.toHaveBeenCalled();

		const targetChip = screen.getByTestId("composer-target-artifact-chip");
		expect(targetChip.textContent).toContain("@PRD · Pencarian Artikel");
	});

	it("3. requires a valid target artifact in Revise mode and disables submit when target is missing", () => {
		const onSubmitComposer = vi.fn();
		const { rerender } = render(
			<CodebaseChatWorkspace
				featureName="Pencarian Artikel"
				projectId="proj-1"
				codebaseId="repo-1"
				currentSnapshotId="snap-1"
				composerMode="revise"
				messages={[{ id: "m1", role: "user", content: "Halo" }]}
				questions={[]}
				answers={{}}
				artifacts={[]}
				onSubmitComposer={onSubmitComposer}
			/>,
		);

		const composer = screen.getByRole("textbox") as HTMLTextAreaElement;
		const submitBtn = screen.getByTestId(
			"prompt-bar-submit",
		) as HTMLButtonElement;
		fireEvent.change(composer, {
			target: { value: "Ubah navigasi artikel menjadi modal" },
		});

		expect(screen.getByTestId("composer-missing-target-notice")).toBeTruthy();
		expect(submitBtn.disabled).toBe(true);
		fireEvent.keyDown(composer, { key: "Enter", code: "Enter" });
		expect(onSubmitComposer).not.toHaveBeenCalled();

		rerender(
			<CodebaseChatWorkspace
				featureName="Pencarian Artikel"
				projectId="proj-1"
				codebaseId="repo-1"
				currentSnapshotId="snap-1"
				composerMode="revise"
				messages={[{ id: "m1", role: "user", content: "Halo" }]}
				questions={[]}
				answers={{}}
				artifacts={[prdArtifact]}
				onSubmitComposer={onSubmitComposer}
			/>,
		);

		expect(submitBtn.disabled).toBe(false);
		fireEvent.click(submitBtn);
		expect(onSubmitComposer).toHaveBeenCalledWith(
			expect.objectContaining({
				mode: "revise",
				targetKind: "prd",
				message: "Ubah navigasi artikel menjadi modal",
			}),
		);
	});

	it("4. separates Plan workflow and Revise proposal workflow in useWorkspaceComposer without mutating documents directly", async () => {
		const fetchAiQuestions = vi.fn(async () => {});
		const runRevision = vi.fn(async () => {});
		const setPrdContent = vi.fn();

		const { result } = renderHook(() =>
			useWorkspaceComposer({
				codebase: { id: "repo-1", name: "Repo" },
				composerMode: "plan",
				snapshotReady: true,
				isWorking: false,
				setIsWorking: vi.fn(),
				setError: vi.fn(),
				setActiveFeature: vi.fn(),
				setPipelineStage: vi.fn(),
				setFeatureTree: vi.fn(),
				setTaskTree: vi.fn(),
				setPrdContent,
				setAcContent: vi.fn(),
				setChatAnswers: vi.fn(),
				setChatMessages: vi.fn(),
				effectiveFeatureId: "proj-1",
				onboardingFeatureId: "anchor",
				artifactCount: 2,
				isCreatingNew: false,
				setIsCreatingNew: vi.fn(),
				setLastFeaturePrompt: vi.fn(),
				fetchAiQuestions,
				runRevision,
				resetFeatureWorkspace: vi.fn(),
				registerCreatedPlan: vi.fn(),
			}),
		);

		await act(async () => {
			await result.current.handleSubmitComposer({
				mode: "plan",
				message: "Tambahkan filter kategori",
				optionalReferences: [],
				referenceBindings: [],
			});
		});
		expect(fetchAiQuestions).toHaveBeenCalledWith(
			"proj-1",
			"Tambahkan filter kategori",
		);
		expect(runRevision).not.toHaveBeenCalled();

		await act(async () => {
			await result.current.handleSubmitComposer({
				mode: "revise",
				targetKind: "prd",
				message: "Ubah navigasi menjadi modal",
				optionalReferences: ["src/pages/Content.jsx"],
				referenceBindings: [
					{
						kind: "file",
						id: "file:snap-1:src/pages/Content.jsx",
						path: "src/pages/Content.jsx",
						codebaseId: "repo-1",
						snapshotId: "snap-1",
					},
				],
			});
		});
		expect(runRevision).toHaveBeenCalledWith("Ubah navigasi menjadi modal", {
			targetKind: "prd",
			optionalReferences: ["src/pages/Content.jsx"],
			referenceBindings: [
				{
					kind: "file",
					id: "file:snap-1:src/pages/Content.jsx",
					path: "src/pages/Content.jsx",
					codebaseId: "repo-1",
					snapshotId: "snap-1",
				},
			],
		});
		expect(setPrdContent).not.toHaveBeenCalled();
	});

	it("10, 11, 12, 13, 17. preserves draft across changes/failures, blocks duplicates, keeps completed planning read-only until Revisi Planning, and supports retry", async () => {
		let shouldAccept = false;
		const onSubmitComposer = vi.fn(async () => shouldAccept);
		const { rerender } = render(
			<CodebaseChatWorkspace
				featureName="Pencarian Artikel"
				projectId="proj-1"
				codebaseId="repo-1"
				currentSnapshotId="snap-1"
				messages={[{ id: "m1", role: "user", content: "Halo" }]}
				questions={[]}
				answers={{}}
				artifacts={[prdArtifact]}
				repositoryFiles={repoFiles}
				onSubmitComposer={onSubmitComposer}
			/>,
		);

		const composer = screen.getByRole("textbox") as HTMLTextAreaElement;
		const submitBtn = screen.getByTestId(
			"prompt-bar-submit",
		) as HTMLButtonElement;
		expect(submitBtn.disabled).toBe(true);

		fireEvent.change(composer, {
			target: { value: "Tambahkan indeks pencarian penuh" },
		});
		expect(submitBtn.disabled).toBe(false);

		fireEvent.click(screen.getByTestId("composer-mention-trigger"));
		fireEvent.click(
			screen.getByTestId("composer-mention-file-src/pages/Content.jsx"),
		);
		expect(composer.value).toBe("Tambahkan indeks pencarian penuh");

		fireEvent.click(screen.getByTestId("composer-mode-trigger"));
		fireEvent.click(screen.getByTestId("composer-mode-option-revise"));
		expect(composer.value).toBe("Tambahkan indeks pencarian penuh");

		await act(async () => {
			fireEvent.click(submitBtn);
		});
		expect(onSubmitComposer).toHaveBeenCalledTimes(1);
		expect(composer.value).toBe("Tambahkan indeks pencarian penuh");

		const runningRun = startRun("prd", Date.now());
		rerender(
			<CodebaseChatWorkspace
				featureName="Pencarian Artikel"
				projectId="proj-1"
				codebaseId="repo-1"
				currentSnapshotId="snap-1"
				composerMode="revise"
				run={runningRun}
				messages={[{ id: "m1", role: "user", content: "Halo" }]}
				questions={[]}
				answers={{}}
				artifacts={[prdArtifact]}
				repositoryFiles={repoFiles}
				onSubmitComposer={onSubmitComposer}
			/>,
		);
		expect(submitBtn.disabled).toBe(true);
		expect(submitBtn.querySelector("[data-testid='spinner']")).toBeTruthy();
		fireEvent.keyDown(composer, { key: "Enter", code: "Enter" });
		expect(onSubmitComposer).toHaveBeenCalledTimes(1);

		const failedRun = settleRun(runningRun, "failed", Date.now(), "Gagal");
		shouldAccept = true;
		rerender(
			<CodebaseChatWorkspace
				featureName="Pencarian Artikel"
				projectId="proj-1"
				codebaseId="repo-1"
				currentSnapshotId="snap-1"
				composerMode="revise"
				run={failedRun}
				messages={[{ id: "m1", role: "user", content: "Halo" }]}
				questions={[]}
				answers={{}}
				artifacts={[prdArtifact]}
				repositoryFiles={repoFiles}
				onSubmitComposer={onSubmitComposer}
			/>,
		);
		expect(submitBtn.disabled).toBe(false);
		await act(async () => {
			fireEvent.click(submitBtn);
		});
		expect(onSubmitComposer).toHaveBeenCalledTimes(2);
		expect(composer.value).toBe("");

		rerender(
			<CodebaseChatWorkspace
				featureName="Pencarian Artikel"
				projectId="proj-1"
				codebaseId="repo-1"
				currentSnapshotId="snap-1"
				stage="handoff"
				projectIdForHandoff="proj-1"
				composerAvailable={false}
				messages={[{ id: "m1", role: "user", content: "Selesai" }]}
				questions={[]}
				answers={{}}
				artifacts={[prdArtifact]}
			/>,
		);

		expect(screen.queryByRole("textbox")).toBeNull();
		fireEvent.click(screen.getByTestId("codebase-open-completed-revision"));
		expect(screen.getByRole("textbox")).toBeTruthy();
		expect(
			screen.getByTestId("composer-mode-trigger").getAttribute("data-mode"),
		).toBe("revise");
		fireEvent.click(screen.getByTestId("codebase-cancel-completed-revision"));
		expect(screen.queryByRole("textbox")).toBeNull();
	});
});
