// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useCodebaseSync } from "../hooks/use-codebase-sync";
import type { AnalysisResponse } from "../services/analysis";

vi.mock("../hooks/use-codebase-sync-stream", () => ({
	useCodebaseSyncStream: () => ({ status: null }),
}));
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	localStorage.clear();
});

test("opening re-sync before reload status lands cannot reuse a completed persisted request as the new attempt", async () => {
	const oldRequestId = crypto.randomUUID();
	localStorage.setItem("prdfy:resync-request:repo", oldRequestId);
	const requests: string[] = [];
	const old = {
		projectId: "repo",
		sessionId: "completed-session",
		status: "uploaded",
		snapshotId: "saved",
		workspaceSnapshotId: "saved",
		analysisStatus: "ready",
		analysisId: "saved-analysis",
	};
	let release!: (response: Response) => void;
	const delayedStatus = new Promise<Response>((resolve) => {
		release = resolve;
	});
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, init?: RequestInit) => {
			if (init?.method === "POST") {
				const body = JSON.parse(String(init.body));
				requests.push(body.requestId);
				return Response.json(
					body.requestId === oldRequestId
						? {
								projectId: "repo",
								sessionId: old.sessionId,
								status: "uploaded",
								code: "SYNC_SESSION_RESTORED",
								expiresAt: new Date(Date.now() + 600000).toISOString(),
							}
						: {
								projectId: "repo",
								sessionId: "fresh-session",
								status: "waiting_for_cli",
								syncToken: "fresh-secret",
								apiBaseUrl: "https://test.local",
								syncCommand: "everythings-vibe codebase sync",
								cliMinVersion: "2.0.0",
								expiresAt: new Date(Date.now() + 600000).toISOString(),
							},
				);
			}
			if (url.includes("sessionId=completed-session"))
				return Response.json(old);
			if (url.includes("sessionId=fresh-session"))
				return Response.json({
					projectId: "repo",
					sessionId: "fresh-session",
					status: "waiting_for_cli",
					snapshotId: null,
					workspaceSnapshotId: "saved",
				});
			return delayedStatus;
		}),
	);
	const initialAnalysis: AnalysisResponse = {
		id: "saved-analysis",
		projectId: "plan",
		snapshotId: "saved",
		status: "ready",
		output: { projectId: "plan", snapshotId: "saved" },
		errorCode: null,
		errorMessage: null,
	};
	const { result } = renderHook(() =>
		useCodebaseSync({
			codebaseId: "repo",
			projectId: "plan",
			currentSnapshotId: "saved",
			initialAnalysis,
			hasStoredSnapshot: true,
		}),
	);
	await act(async () => {
		result.current.openResync();
	});
	await waitFor(() =>
		expect(result.current.payload?.sessionId).toBe("fresh-session"),
	);
	expect(requests).toHaveLength(2);
	expect(requests[1]).not.toBe(oldRequestId);
	await act(async () => {
		release(Response.json(old));
	});
	expect(result.current.activeSessionId).toBe("fresh-session");
	expect(result.current.status?.sessionId).not.toBe(old.sessionId);
});
