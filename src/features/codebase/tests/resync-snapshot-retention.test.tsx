// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useCodebaseSync } from "../hooks/use-codebase-sync";
import type { AnalysisResponse } from "../services/analysis";
import type { SyncStatusResponse } from "../services/sync";

vi.mock("../hooks/use-codebase-sync-stream", () => ({
	useCodebaseSyncStream: () => ({ status: null }),
}));
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	localStorage.clear();
});

test("preparing the next attempt retains the latest verified workspace snapshot, not just the loader snapshot", async () => {
	const initialAnalysis: AnalysisResponse = {
		id: "analysis-a",
		projectId: "plan",
		snapshotId: "snapshot-a",
		status: "ready",
		output: { projectId: "plan", snapshotId: "snapshot-a" },
		errorCode: null,
		errorMessage: null,
	};
	const status: SyncStatusResponse = {
		projectId: "repo",
		sessionId: "session-b",
		status: "uploaded",
		snapshotId: "snapshot-b",
		workspaceSnapshotId: "snapshot-b",
		analysisId: "analysis-b",
		analysisStatus: "ready",
	};
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, init?: RequestInit) => {
			if (url.includes("/analysis"))
				return Response.json({
					...initialAnalysis,
					id: "analysis-b",
					snapshotId: "snapshot-b",
					output: { projectId: "plan", snapshotId: "snapshot-b" },
				});
			if (init?.method === "POST")
				return Response.json(
					{ error: "Sesi sync gagal dibuat. Coba lagi." },
					{ status: 503 },
				);
			return Response.json(status);
		}),
	);
	const { result } = renderHook(() =>
		useCodebaseSync({
			codebaseId: "repo",
			projectId: "plan",
			currentSnapshotId: "snapshot-a",
			initialAnalysis,
			hasStoredSnapshot: true,
		}),
	);
	await waitFor(() =>
		expect(result.current.analysis?.snapshotId).toBe("snapshot-b"),
	);
	await act(async () => {
		result.current.openResync();
	});
	expect(result.current.status).toBeNull();
	expect(result.current.sessionError).not.toBeNull();
	expect(result.current.activeWorkspaceSnapshotId).toBe("snapshot-b");
	expect(result.current.analysis?.snapshotId).toBe("snapshot-b");
	expect(result.current.snapshotReady).toBe(true);
});
