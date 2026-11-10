// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useCodebaseSync } from "../hooks/use-codebase-sync";
import type { SyncStatusResponse } from "../services/sync";
import { CODEBASE_SYNC_REQUEST_TIMEOUT_MS } from "../types/codebase-constants";

vi.mock("../hooks/use-codebase-sync-stream", () => ({
	useCodebaseSyncStream: () => ({ status: null }),
}));
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.useRealTimers();
	localStorage.clear();
});

const options = {
	codebaseId: "repo",
	projectId: "plan",
	currentSnapshotId: "old",
	initialAnalysis: {
		id: "old-analysis",
		projectId: "plan",
		snapshotId: "old",
		status: "ready" as const,
		output: { projectId: "plan", snapshotId: "old" },
		errorCode: null,
		errorMessage: null,
	},
	hasStoredSnapshot: true,
};
const oldStatus: SyncStatusResponse = {
	projectId: "repo",
	sessionId: "initial-session",
	status: "uploaded",
	snapshotId: "old",
	workspaceSnapshotId: "old",
	analysisStatus: "ready",
	analysisId: "old-analysis",
};
function payload(sessionId: string) {
	return {
		projectId: "repo",
		codebaseId: "repo",
		sessionId,
		status: "waiting_for_cli",
		syncToken: `secret-${sessionId}`,
		apiBaseUrl: "https://test.local",
		syncCommand: "everythings-vibe codebase sync",
		cliMinVersion: "2.0.0",
		expiresAt: new Date(Date.now() + 600000).toISOString(),
	};
}
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

test("opening fresh resync clears initial progress and rejects a late initial-status response", async () => {
	const late = deferred<Response>();
	let reads = 0;
	let hold = false;
	vi.stubGlobal(
		"fetch",
		vi.fn(async (_url: string, init?: RequestInit) => {
			if (init?.method === "POST")
				return Response.json(payload("resync-session"));
			reads++;
			return hold ? late.promise : Response.json(oldStatus);
		}),
	);
	const { result } = renderHook(() => useCodebaseSync(options));
	await waitFor(() =>
		expect(result.current.status?.sessionId).toBe("initial-session"),
	);
	hold = true;
	let pending: Promise<void> | undefined;
	act(() => {
		pending = result.current.readStatus();
	});
	await waitFor(() => expect(reads).toBeGreaterThanOrEqual(2));
	await act(async () => {
		result.current.openResync();
	});
	await waitFor(() =>
		expect(result.current.activeSessionId).toBe("resync-session"),
	);
	await act(async () => {
		late.resolve(Response.json(oldStatus));
		await pending;
	});
	expect(result.current.status).toBeNull();
	expect(result.current.analysis).toEqual(options.initialAnalysis);
	expect(result.current.activeWorkspaceSnapshotId).toBe("old");
});

test("reopening a finished attempt discards its in-memory prompt and starts a new request identity", async () => {
	const bodies: Array<{ requestId: string }> = [];
	let status = oldStatus;
	vi.stubGlobal(
		"fetch",
		vi.fn(async (_url: string, init?: RequestInit) => {
			if (init?.method === "POST") {
				bodies.push(JSON.parse(String(init.body)));
				return Response.json(payload(`resync-${bodies.length}`));
			}
			return Response.json(status);
		}),
	);
	const { result } = renderHook(() => useCodebaseSync(options));
	await waitFor(() =>
		expect(result.current.status?.sessionId).toBe("initial-session"),
	);
	await act(async () => {
		result.current.openResync();
	});
	await waitFor(() =>
		expect(result.current.payload?.sessionId).toBe("resync-1"),
	);
	status = {
		...oldStatus,
		sessionId: "resync-1",
		snapshotId: "new",
		workspaceSnapshotId: "old",
	};
	await act(async () => {
		await result.current.readStatus();
	});
	act(() => result.current.setIsResyncModalOpen(false));
	await act(async () => {
		result.current.openResync();
	});
	await waitFor(() => expect(bodies).toHaveLength(2));
	expect(bodies[1].requestId).not.toBe(bodies[0].requestId);
	expect(result.current.payload?.sessionId).toBe("resync-2");
});

test("double click creates one request and failed creation cannot restore old completion", async () => {
	const pending = deferred<Response>();
	const bodies: Array<{ requestId: string }> = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (_url: string, init?: RequestInit) => {
			if (init?.method === "POST") {
				bodies.push(JSON.parse(String(init.body)));
				return pending.promise;
			}
			return Response.json(oldStatus);
		}),
	);
	const { result } = renderHook(() => useCodebaseSync(options));
	await waitFor(() =>
		expect(result.current.status?.sessionId).toBe("initial-session"),
	);
	act(() => {
		result.current.openResync();
		result.current.openResync();
	});
	expect(bodies).toHaveLength(1);
	expect(localStorage.getItem("prdfy:resync-request:repo")).toBe(
		bodies[0].requestId,
	);
	expect(result.current.activeSessionId).toBeNull();
	expect(result.current.status).toBeNull();
	await act(async () => {
		pending.resolve(
			Response.json(
				{
					error: "Sesi sync gagal dibuat. Coba lagi.",
					code: "CODEBASE_SESSION_REPLACEMENT_FAILED",
				},
				{ status: 503 },
			),
		);
	});
	expect(result.current.sessionError).not.toBeNull();
	await act(async () => {
		await result.current.readStatus();
	});
	expect(result.current.status).toBeNull();
	expect(result.current.analysis).toEqual(options.initialAnalysis);
});

test("reload with an active attempt still verifies the stored request once and restores no secret", async () => {
	const requestId = crypto.randomUUID();
	localStorage.setItem("prdfy:resync-request:repo", requestId);
	const bodies: Array<{ requestId: string }> = [];
	const active: SyncStatusResponse = {
		projectId: "repo",
		sessionId: "running",
		status: "uploading",
		snapshotId: null,
		workspaceSnapshotId: "old",
		manifestCount: 10,
		uploadedCount: 2,
	};
	vi.stubGlobal(
		"fetch",
		vi.fn(async (_url: string, init?: RequestInit) => {
			if (init?.method === "POST") {
				bodies.push(JSON.parse(String(init.body)));
				return Response.json({
					...active,
					expiresAt: new Date(Date.now() + 600000).toISOString(),
					code: "SYNC_SESSION_RESTORED",
				});
			}
			return Response.json(active);
		}),
	);
	const { result } = renderHook(() => useCodebaseSync(options));
	await waitFor(() => expect(result.current.status?.status).toBe("uploading"));
	await act(async () => {
		result.current.openResync();
	});
	await waitFor(() => expect(bodies).toHaveLength(1));
	expect(bodies[0].requestId).toBe(requestId);
	expect(result.current.payload).toBeNull();
	expect(result.current.status?.sessionId).toBe("running");
});

test("a session response without explicit attempt identity is rejected instead of using old status", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (_url: string, init?: RequestInit) => {
			if (init?.method === "POST") {
				const { sessionId: _sessionId, ...unbound } = payload("unbound");
				return Response.json(unbound);
			}
			return Response.json(oldStatus);
		}),
	);
	const { result } = renderHook(() => useCodebaseSync(options));
	await waitFor(() =>
		expect(result.current.status?.sessionId).toBe("initial-session"),
	);
	await act(async () => {
		await result.current.startSession("resync");
	});
	expect(result.current.payload).toBeNull();
	expect(result.current.sessionError).not.toBeNull();
	expect(result.current.activeSessionId).toBeNull();
});

test("a late session response cannot cross a repository switch", async () => {
	const pending = deferred<Response>();
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, init?: RequestInit) => {
			if (init?.method === "POST") return pending.promise;
			return Response.json(
				url.includes("/other/")
					? { ...oldStatus, projectId: "other", sessionId: "other-session" }
					: oldStatus,
			);
		}),
	);
	const { result, rerender } = renderHook(
		({ codebaseId }) => useCodebaseSync({ ...options, codebaseId }),
		{ initialProps: { codebaseId: "repo" } },
	);
	await waitFor(() =>
		expect(result.current.status?.sessionId).toBe("initial-session"),
	);
	let creating: Promise<void> | undefined;
	act(() => {
		creating = result.current.startSession("resync");
	});
	rerender({ codebaseId: "other" });
	await act(async () => {
		pending.resolve(Response.json(payload("old-repo-session")));
		await creating;
	});
	expect(result.current.payload).toBeNull();
	expect(result.current.activeSessionId).not.toBe("old-repo-session");
});

test("a timed-out session request releases its local lock and retries the same durable identity", async () => {
	const bodies: Array<{ requestId: string }> = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (_url: string, init?: RequestInit) => {
			if (init?.method !== "POST") return Response.json(oldStatus);
			bodies.push(JSON.parse(String(init.body)));
			if (bodies.length > 1)
				return Response.json(payload("recovered-after-timeout"));
			return new Promise<Response>((_resolve, reject) => {
				init.signal?.addEventListener(
					"abort",
					() => reject(new DOMException("Aborted", "AbortError")),
					{ once: true },
				);
			});
		}),
	);
	const { result } = renderHook(() => useCodebaseSync(options));
	await waitFor(() =>
		expect(result.current.activeSessionId).toBe("initial-session"),
	);
	vi.useFakeTimers();
	act(() => {
		result.current.openResync();
	});
	await act(async () => {
		await vi.advanceTimersByTimeAsync(CODEBASE_SYNC_REQUEST_TIMEOUT_MS);
	});
	expect(result.current.isStarting).toBe(false);
	expect(result.current.sessionError).not.toBeNull();
	expect(result.current.status).toBeNull();
	await act(async () => {
		result.current.retrySession();
	});
	expect(bodies).toHaveLength(2);
	expect(bodies[1].requestId).toBe(bodies[0].requestId);
	expect(result.current.activeSessionId).toBe("recovered-after-timeout");
});
