// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useCodebaseSync } from "../hooks/use-codebase-sync";
import type { AnalysisResponse } from "../services/analysis";
import { resolveAnalysisCreditPolicy } from "../services/analysis-credit-policy";
import type { SyncStatusResponse } from "../services/sync";

vi.mock("../hooks/use-codebase-sync-stream", () => ({
	useCodebaseSyncStream: () => ({ status: null }),
}));
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	sessionStorage.clear();
	localStorage.clear();
});
const oldAnalysis: AnalysisResponse = {
	id: "analysis-old",
	projectId: "plan",
	snapshotId: "old",
	status: "ready",
	output: { projectId: "plan", snapshotId: "old" },
	errorCode: null,
	errorMessage: null,
};
const options = {
	codebaseId: "repo",
	projectId: "plan",
	currentSnapshotId: "old",
	initialAnalysis: oldAnalysis,
	hasStoredSnapshot: true,
};

test("resync omits null session ids, reuses request identity on network retry and preserves usable analysis", async () => {
	const bodies: Record<string, unknown>[] = [];
	let lost = true;
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, init?: RequestInit) => {
			if (url.includes("preflight"))
				return Response.json(
					resolveAnalysisCreditPolicy({
						allowanceUsed: true,
						allowanceInProgress: false,
						subscriptionPaused: false,
						availableCredits: 100,
						isInitial: false,
					}),
				);
			if (init?.method === "POST") {
				bodies.push(JSON.parse(String(init.body)));
				if (lost) {
					lost = false;
					throw new Error("Network unavailable");
				}
				return Response.json({
					projectId: "repo",
					sessionId: "new-session",
					syncToken: "new-secret",
					status: "waiting_for_cli",
					apiBaseUrl: "https://test.local",
					syncCommand: "everythings-vibe codebase sync",
					cliMinVersion: "2.0.0",
					expiresAt: new Date(Date.now() + 600000).toISOString(),
				});
			}
			return Response.json({
				projectId: "repo",
				sessionId: "old-session",
				status: "uploaded",
				snapshotId: "old",
				workspaceSnapshotId: "old",
				analysisStatus: "ready",
				analysisId: "analysis-old",
			});
		}),
	);
	const { result } = renderHook(() => useCodebaseSync(options));
	await act(async () => {
		await result.current.startSession("resync");
	});
	await act(async () => {
		await result.current.startSession("resync");
	});
	expect(bodies).toHaveLength(2);
	expect(bodies[0]).toMatchObject({
		action: "resync",
		requestId: expect.any(String),
	});
	expect(bodies[0]).not.toHaveProperty("sessionId");
	expect(bodies[1]?.requestId).toBe(bodies[0]?.requestId);
	expect(result.current.payload?.syncToken).toBe("new-secret");
	expect(result.current.analysis).toEqual(oldAnalysis);
	expect(
		[...Object.values(sessionStorage), ...Object.values(localStorage)].join(),
	).not.toContain("new-secret");
});

test("uploaded resync analyzes its own snapshot while retaining the old workspace until ready", async () => {
	let status: SyncStatusResponse = {
		projectId: "repo",
		sessionId: "new-session",
		status: "uploaded",
		snapshotId: "new",
		workspaceSnapshotId: "old",
	};
	let postCount = 0;
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, init?: RequestInit) => {
			if (url.includes("/analysis")) {
				if (init?.method === "POST") postCount++;
				return Response.json({
					...oldAnalysis,
					id: "analysis-new",
					snapshotId: "new",
					output: { projectId: "plan", snapshotId: "new" },
				});
			}
			return Response.json(status);
		}),
	);
	const { result } = renderHook(() => useCodebaseSync(options));
	await waitFor(() => expect(postCount).toBe(1));
	expect(result.current.activeWorkspaceSnapshotId).toBe("old");
	expect(result.current.analysis?.snapshotId).toBe("old");
	status = {
		...status,
		workspaceSnapshotId: "new",
		analysisStatus: "ready",
		analysisId: "analysis-new",
	};
	await act(async () => {
		await result.current.readStatus();
	});
	await waitFor(() => expect(result.current.analysis?.snapshotId).toBe("new"));
	expect(result.current.activeWorkspaceSnapshotId).toBe("new");
	expect(postCount).toBe(1);
});

test("refresh retries the persisted request and restores active conflict without a generic failure", async () => {
	const requestId = crypto.randomUUID();
	localStorage.setItem("prdfy:resync-request:repo", requestId);
	const bodies: Record<string, unknown>[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, init?: RequestInit) => {
			if (url.includes("preflight"))
				return Response.json(
					resolveAnalysisCreditPolicy({
						allowanceUsed: true,
						allowanceInProgress: false,
						subscriptionPaused: false,
						availableCredits: 100,
						isInitial: false,
					}),
				);
			if (init?.method === "POST") {
				bodies.push(JSON.parse(String(init.body)));
				return Response.json(
					{ code: "SYNC_SESSION_STALE", sessionId: "authoritative" },
					{ status: 409 },
				);
			}
			return Response.json({
				projectId: "repo",
				sessionId: "authoritative",
				status: "uploading",
				snapshotId: null,
				workspaceSnapshotId: "old",
			});
		}),
	);
	const { result } = renderHook(() => useCodebaseSync(options));
	await act(async () => {
		result.current.openResync();
	});
	await waitFor(() =>
		expect(result.current.activeSessionId).toBe("authoritative"),
	);
	expect(bodies[0]).toMatchObject({ action: "resync", requestId });
	expect(result.current.error).toBeNull();
	expect(result.current.analysis).toEqual(oldAnalysis);
});
