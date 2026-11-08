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

function resyncPayload(sessionId: string, token: string) {
	return {
		projectId: "repo",
		codebaseId: "repo",
		sessionId,
		status: "waiting_for_cli",
		syncToken: token,
		apiBaseUrl: "https://test.local",
		syncCommand: "everythings-vibe codebase sync",
		cliMinVersion: "2.0.0",
		expiresAt: new Date(Date.now() + 600000).toISOString(),
	};
}

test("re-sync never asks for credit approval and a restricted preflight cannot block it", async () => {
	let preflightCalls = 0;
	let postCalls = 0;
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, init?: RequestInit) => {
			if (url.includes("preflight")) {
				preflightCalls++;
				return Response.json(
					resolveAnalysisCreditPolicy({
						allowanceUsed: true,
						allowanceInProgress: false,
						subscriptionPaused: true,
						availableCredits: 0,
						isInitial: false,
					}),
				);
			}
			if (init?.method === "POST") {
				postCalls++;
				return Response.json(resyncPayload("sess-new", "tok-new"));
			}
			return Response.json({
				projectId: "repo",
				sessionId: "sess-new",
				status: "waiting_for_cli",
				snapshotId: null,
			});
		}),
	);
	const { result } = renderHook(() => useCodebaseSync(options));
	await act(async () => {
		await result.current.startSession("resync");
	});
	expect(preflightCalls).toBe(0);
	expect(postCalls).toBe(1);
	expect(result.current.payload?.syncToken).toBe("tok-new");
	expect(result.current.sessionError).toBeNull();
});

test("a failed session request stays in the modal and clears on a successful retry", async () => {
	let postCalls = 0;
	vi.stubGlobal(
		"fetch",
		vi.fn(async (_url: string, init?: RequestInit) => {
			if (init?.method === "POST") {
				postCalls++;
				if (postCalls === 1)
					return Response.json(
						{ error: "Sesi sync gagal dibuat. Coba lagi." },
						{ status: 503 },
					);
				return Response.json(resyncPayload("sess-retried", "tok-retried"));
			}
			return Response.json({
				projectId: "repo",
				sessionId: "sess-old",
				status: "uploaded",
				snapshotId: "old",
				workspaceSnapshotId: "old",
			});
		}),
	);
	const { result } = renderHook(() => useCodebaseSync(options));
	await act(async () => {
		await result.current.startSession("resync");
	});
	expect(result.current.error).toBeNull();
	expect(result.current.sessionError).not.toBeNull();
	expect(result.current.payload).toBeNull();

	await act(async () => {
		await result.current.retrySession();
	});
	expect(postCalls).toBe(2);
	expect(result.current.error).toBeNull();
	expect(result.current.sessionError).toBeNull();
	expect(result.current.payload?.syncToken).toBe("tok-retried");
});

test("reopening a live attempt never creates a duplicate session", async () => {
	let postCalls = 0;
	vi.stubGlobal(
		"fetch",
		vi.fn(async (_url: string, init?: RequestInit) => {
			if (init?.method === "POST") {
				postCalls++;
				return Response.json(resyncPayload("sess-live", "tok-live"));
			}
			return Response.json({
				projectId: "repo",
				sessionId: "sess-live",
				status: "waiting_for_cli",
				snapshotId: null,
			});
		}),
	);
	const { result } = renderHook(() => useCodebaseSync(options));
	await act(async () => {
		result.current.openResync();
	});
	await waitFor(() =>
		expect(result.current.payload?.syncToken).toBe("tok-live"),
	);
	act(() => {
		result.current.openResync();
	});
	await waitFor(() => expect(postCalls).toBe(1));
});

test("closing the modal never revokes the running attempt", async () => {
	const methods: string[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (_url: string, init?: RequestInit) => {
			methods.push(init?.method ?? "GET");
			if (init?.method === "POST")
				return Response.json(resyncPayload("sess-close", "tok-close"));
			return Response.json({
				projectId: "repo",
				sessionId: "sess-close",
				status: "uploading",
				snapshotId: null,
			});
		}),
	);
	const { result } = renderHook(() => useCodebaseSync(options));
	await act(async () => {
		result.current.openResync();
	});
	await waitFor(() =>
		expect(result.current.payload?.syncToken).toBe("tok-close"),
	);
	act(() => {
		result.current.setIsResyncModalOpen(false);
	});
	expect(methods).not.toContain("DELETE");
});

test("a failed attempt is replaced through the explicit retry request", async () => {
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
				return Response.json(resyncPayload("sess-replaced", "tok-replaced"));
			}
			return Response.json({
				projectId: "repo",
				sessionId: "sess-failed",
				status: "failed",
				snapshotId: null,
			});
		}),
	);
	const { result } = renderHook(() => useCodebaseSync(options));
	await waitFor(() => expect(result.current.status?.status).toBe("failed"));
	await act(async () => {
		result.current.retrySync();
	});
	await waitFor(() => expect(bodies).toHaveLength(1));
	expect(bodies[0]).toMatchObject({
		action: "retry",
		sessionId: "sess-failed",
	});
	expect(result.current.sessionError).toBeNull();
});
