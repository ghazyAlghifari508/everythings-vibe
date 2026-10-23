// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useCodebaseWorkspace } from "../hooks/use-codebase-workspace";
import type { CodebaseWorkspaceData } from "../services/workspace-loader.functions";

vi.mock("../hooks/use-codebase-sync", () => ({
	useCodebaseSync: () => ({
		snapshotReady: true,
		isWorking: false,
		setIsWorking: vi.fn(),
		setError: vi.fn(),
		analysis: { output: { techStack: ["TypeScript"] } },
		status: { snapshotId: "snapshot" },
	}),
}));
vi.mock("../hooks/use-workspace-source", () => ({
	useWorkspaceSource: () => ({
		explorerFiles: ["src/main.ts"],
		explorerStack: ["TypeScript"],
		sourcePreview: { kind: "idle" },
		clearSourcePreview: vi.fn(),
	}),
}));
vi.mock("@/features/greenfield/hooks/use-kanban-polling", () => ({
	useKanbanTasks: ({ projectId }: { projectId: string }) => ({
		data:
			projectId === "a"
				? {
						columns: {
							pending: [{ status: "pending" }],
							in_progress: [],
							completed: [],
							failed: [],
						},
					}
				: null,
		refetch: vi.fn(async () => {}),
	}),
}));
vi.mock("../services/workspace-artifacts.functions", () => ({
	loadFeatureTree: vi.fn(async () => ({ featureTree: null })),
	loadTaskTree: vi.fn(async () => ({ taskTree: null })),
}));
const data: CodebaseWorkspaceData = {
	codebase: {
		id: "repo",
		name: "Repository",
		onboardingProjectId: "anchor",
		repositoryIdentity: null,
	},
	plans: [
		{
			id: "a",
			name: "Feature A",
			updatedAt: null,
			hasArtifacts: true,
			hasPrd: true,
		},
		{ id: "anchor", name: "Repository", updatedAt: null, hasArtifacts: false },
	],
	onboardingFeatureId: "anchor",
	currentSnapshotId: "snapshot",
	planningSnapshotByProject: { a: "snapshot" },
	analysis: null,
	hasStoredSnapshot: true,
	canOpenFullBoard: true,
};
afterEach(() => {
	vi.unstubAllGlobals();
	sessionStorage.clear();
});
it("clears feature UI immediately, creates B lazily, and restores A/B/A without generating", async () => {
	const fetcher = vi.fn(async (url: string) => {
		if (url.endsWith("/features"))
			return Response.json({ projectId: "b", name: "Feature B" });
		if (url === "/api/ask/options") return Response.json({});
		if (url.endsWith("/ac-versions")) return Response.json([]);
		return Response.json([
			{
				version: 1,
				content: url.includes("/a/") ? "Document A" : "Document B",
			},
		]);
	});
	vi.stubGlobal("fetch", fetcher);
	const { result } = renderHook(() => useCodebaseWorkspace(data));
	await waitFor(() => expect(result.current.prdContent).toBe("Document A"));
	act(() => result.current.handleCreateFeature());
	expect(result.current.effectiveFeatureId).toBeNull();
	expect(result.current.prdContent).toBeNull();
	expect(result.current.acContent).toBeNull();
	expect(result.current.taskTree).toBeNull();
	expect(result.current.featureTree).toBeNull();
	expect(result.current.chatMessages).toEqual([]);
	expect(result.current.aiQuestions).toEqual([]);
	expect(result.current.chatAnswers).toEqual({});
	expect(result.current.run).toBeNull();
	expect(result.current.stageBusy).toBeNull();
	expect(result.current.stage).toBe("questions");
	expect(result.current.workspaceView.kind).toBe("pristine");
	expect(result.current.activeArtifactId).toBeNull();
	expect(result.current.kanbanProgress).toBeNull();
	expect(result.current.explorerFiles).toEqual(["src/main.ts"]);
	expect(result.current.analysisOutput).toEqual({ techStack: ["TypeScript"] });
	expect(
		fetcher.mock.calls.filter(([url]) => url.endsWith("/features")),
	).toHaveLength(0);
	act(() => result.current.selectPlan("a"));
	await waitFor(() => expect(result.current.prdContent).toBe("Document A"));
	act(() => result.current.handleCreateFeature());
	await act(async () => {
		await result.current.handleSendMessage("Independent feature request");
	});
	await waitFor(() => expect(result.current.effectiveFeatureId).toBe("b"));
	expect(result.current.userFacingPlans.map((plan) => plan.id)).toEqual([
		"a",
		"b",
	]);
	act(() => result.current.selectPlan("a"));
	await waitFor(() => expect(result.current.prdContent).toBe("Document A"));
	act(() => result.current.selectPlan("b"));
	await waitFor(() => expect(result.current.prdContent).toBe("Document B"));
	act(() => result.current.selectPlan("a"));
	await waitFor(() => expect(result.current.prdContent).toBe("Document A"));
	expect(result.current.chatMessages).toEqual([]);
	expect(
		fetcher.mock.calls.filter(([url]) => url.endsWith("/features")),
	).toHaveLength(1);
	expect(
		fetcher.mock.calls.some(([url]) => /generate|\/api\/chat/.test(url)),
	).toBe(false);
});
