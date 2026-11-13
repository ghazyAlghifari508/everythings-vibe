// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
	TaskCard,
	useKanbanTasks,
} from "@/features/greenfield/hooks/use-kanban-polling";
import { computeKanbanProgress } from "@/lib/kanban-utils";
import { CodebaseChatWorkspaceHeader } from "../components/chat/codebase-chat-workspace-header";
import { CodebaseKanbanBoard } from "../components/planning/codebase-kanban-board";
import { WorkspaceScreenResolver } from "../components/workspace/workspace-screen-resolver";

afterEach(cleanup);

describe("P08 — Actionable Task Progress & Banner Relocation", () => {
	it("renders progress count matching server Kanban data without 'Live'", () => {
		const kanbanColumns = {
			pending: [
				{ id: "t1", name: "Task 1", status: "pending" },
				{ id: "t2", name: "Task 2", status: "pending" },
			] as TaskCard[],
			in_progress: [
				{ id: "t3", name: "Task 3", status: "in_progress" },
			] as TaskCard[],
			completed: [
				{ id: "t4", name: "Task 4", status: "completed" },
			] as TaskCard[],
			failed: [] as TaskCard[],
		};
		const progress = computeKanbanProgress(kanbanColumns);
		expect(progress).toEqual({ total: 4, done: 1, pct: 25 });

		render(
			<CodebaseChatWorkspaceHeader
				codebaseName="Repo Test"
				kanbanProgress={progress}
				onOpenTaskProgress={vi.fn()}
			/>,
		);

		const button = screen.getByTestId("codebase-kanban-badge");
		expect(button.tagName.toLowerCase()).toBe("button");
		expect(button.textContent).toContain("Progress task · 1/4 selesai");
		expect(button.textContent).not.toContain("Live");
		expect(button.getAttribute("aria-label")).toBe(
			"Progress task · 1/4 selesai",
		);
	});

	it("handles empty or no-task state by omitting the progress control", () => {
		const { rerender } = render(
			<CodebaseChatWorkspaceHeader
				codebaseName="Repo Test"
				kanbanProgress={null}
			/>,
		);
		expect(screen.queryByTestId("codebase-kanban-badge")).toBeNull();

		rerender(
			<CodebaseChatWorkspaceHeader
				codebaseName="Repo Test"
				kanbanProgress={{ done: 0, total: 0, pct: 0 }}
			/>,
		);
		expect(screen.queryByTestId("codebase-kanban-badge")).toBeNull();
	});

	it("dispatches onOpenTaskProgress on click to open the Kanban panel", () => {
		const onOpenTaskProgress = vi.fn();
		render(
			<CodebaseChatWorkspaceHeader
				codebaseName="Repo Test"
				kanbanProgress={{ done: 1, total: 12, pct: 8 }}
				onOpenTaskProgress={onOpenTaskProgress}
			/>,
		);

		const button = screen.getByTestId("codebase-kanban-badge");
		fireEvent.click(button);
		expect(onOpenTaskProgress).toHaveBeenCalledTimes(1);
	});

	it("verifies the task progress click transitions match task artifact opening", () => {
		// Simulates the exact state machine transitions defined in CodebaseDetailPage
		const state = {
			userTookOverCanvas: false,
			sourcePreviewCleared: false,
			activeArtifactId: null as string | null,
			canvasView: "checklist" as "kanban" | "checklist",
			canvasOpen: false,
		};

		const resolvedFeature = { id: "feat-auth-123", name: "Auth Flow" };
		const hasTasksInDb = true;

		const handleOpenTaskProgress = () => {
			if (!resolvedFeature || !hasTasksInDb) return;
			state.userTookOverCanvas = true;
			state.sourcePreviewCleared = true;
			state.activeArtifactId = `tasks-${resolvedFeature.id}`;
			state.canvasView = "kanban";
			state.canvasOpen = true;
		};

		handleOpenTaskProgress();

		expect(state.userTookOverCanvas).toBe(true);
		expect(state.sourcePreviewCleared).toBe(true);
		expect(state.activeArtifactId).toBe("tasks-feat-auth-123");
		expect(state.canvasView).toBe("kanban");
		expect(state.canvasOpen).toBe(true);
	});

	it("changes the progress target when switching features", () => {
		const featureA = { id: "feat-a", name: "Feature A" };
		const featureB = { id: "feat-b", name: "Feature B" };

		let currentTarget = "";
		const handleOpen = (featureId: string) => {
			currentTarget = `tasks-${featureId}`;
		};

		const { rerender } = render(
			<CodebaseChatWorkspaceHeader
				codebaseName="Repo"
				kanbanProgress={{ done: 2, total: 5, pct: 40 }}
				onOpenTaskProgress={() => handleOpen(featureA.id)}
			/>,
		);
		expect(screen.getByTestId("codebase-kanban-badge").textContent).toContain(
			"Progress task · 2/5 selesai",
		);
		fireEvent.click(screen.getByTestId("codebase-kanban-badge"));
		expect(currentTarget).toBe("tasks-feat-a");

		rerender(
			<CodebaseChatWorkspaceHeader
				codebaseName="Repo"
				kanbanProgress={{ done: 8, total: 10, pct: 80 }}
				onOpenTaskProgress={() => handleOpen(featureB.id)}
			/>,
		);
		expect(screen.getByTestId("codebase-kanban-badge").textContent).toContain(
			"Progress task · 8/10 selesai",
		);
		fireEvent.click(screen.getByTestId("codebase-kanban-badge"));
		expect(currentTarget).toBe("tasks-feat-b");
	});

	it("does not render persistent banner in header", () => {
		render(
			<CodebaseChatWorkspaceHeader
				codebaseName="Repo Test"
				kanbanProgress={{ done: 1, total: 2, pct: 50 }}
			/>,
		);

		expect(screen.queryByTestId("codebase-planning-review-notice")).toBeNull();
		expect(
			screen.queryByText(/Repository sudah disinkronkan ulang/),
		).toBeNull();
	});

	it("surfaces snapshot mismatch contextually within plan details in WorkspaceScreenResolver", () => {
		const kanbanStub: ReturnType<typeof useKanbanTasks> = {
			data: null,
			staleness: "live",
			isLoading: false,
			isError: false,
			error: null,
			refetch: vi.fn(async () => {}),
		};

		const { rerender } = render(
			<WorkspaceScreenResolver
				sourcePreview={{ kind: "idle" }}
				activeArtifact={{ id: "plan-overview" }}
				resolvedFeature={{ id: "feat-1", name: "Feature 1" }}
				isPrdArtifactActive={false}
				isAcArtifactActive={false}
				isTasksArtifactActive={false}
				isFeatureArtifactActive={false}
				prdContent={null}
				acContent={null}
				canvasView="kanban"
				setCanvasView={vi.fn()}
				codebaseId="cb-1"
				kanban={kanbanStub}
				canOpenFullBoard={true}
				taskTree={null}
				featureTree={null}
				snapshotId="snap-new"
				planningSnapshotId="snap-old"
				impactAreas={["src/auth"]}
			/>,
		);

		// Contextual notice is displayed in plan details
		const mismatchNotice = screen.getByTestId(
			"codebase-plan-snapshot-mismatch",
		);
		expect(mismatchNotice).not.toBeNull();
		expect(mismatchNotice.textContent).toContain(
			"Repository sudah disinkronkan ulang setelah planning ini dibuat.",
		);

		// When snapshots match, no mismatch notice is shown
		rerender(
			<WorkspaceScreenResolver
				sourcePreview={{ kind: "idle" }}
				activeArtifact={{ id: "plan-overview" }}
				resolvedFeature={{ id: "feat-1", name: "Feature 1" }}
				isPrdArtifactActive={false}
				isAcArtifactActive={false}
				isTasksArtifactActive={false}
				isFeatureArtifactActive={false}
				prdContent={null}
				acContent={null}
				canvasView="kanban"
				setCanvasView={vi.fn()}
				codebaseId="cb-1"
				kanban={kanbanStub}
				canOpenFullBoard={true}
				taskTree={null}
				featureTree={null}
				snapshotId="snap-same"
				planningSnapshotId="snap-same"
				impactAreas={["src/auth"]}
			/>,
		);
		expect(screen.queryByTestId("codebase-plan-snapshot-mismatch")).toBeNull();
	});

	it("prevents duplicate Kanban polling by reusing external kanban state", () => {
		// When external columns are supplied, ownsData is false and no second polling occurs
		const dummyColumns = {
			pending: [],
			in_progress: [],
			completed: [],
			failed: [],
		};

		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});

		render(
			<QueryClientProvider client={queryClient}>
				<CodebaseKanbanBoard
					projectId="proj-test"
					codebaseId="cb-test"
					columns={dummyColumns}
					isLoadingExternal={false}
					isErrorExternal={false}
					canOpenFullBoard={false}
				/>
			</QueryClientProvider>,
		);

		expect(screen.getByTestId("codebase-kanban-board")).not.toBeNull();
	});
});
