// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CodebaseRunState } from "@/features/codebase/services/chat-flow";
import {
	type DurableGenerationOperation,
	fetchGenerationOperations,
	parseOperation,
	pollOperationUntilSettled,
	submitGenerationOperation,
} from "@/features/codebase/services/workspace-operations";
import { useWorkspaceOperations } from "../hooks/use-workspace-operations";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.clearAllTimers();
});

function createMockRunState() {
	let current: CodebaseRunState | null = null;
	const setRun = vi.fn((updater: unknown) => {
		current =
			typeof updater === "function"
				? (
						updater as (
							prev: CodebaseRunState | null,
						) => CodebaseRunState | null
					)(current)
				: (updater as CodebaseRunState | null);
	});
	return {
		setRun,
		get current() {
			return current;
		},
	};
}

describe("Durable Operations - Recovery, Reconcile & Edge Cases", () => {
	it("1. Ack-lost reconciliation: network drops on initial POST, attaches via exact identity ?reconcile=1", async () => {
		const runningOp: DurableGenerationOperation = {
			id: "op-prd-1",
			projectId: "proj-1",
			stage: "prd",
			status: "running",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
			if (url.includes("reconcile=1")) {
				expect(init?.method).toBe("POST");
				expect(JSON.parse(String(init?.body))).toEqual({
					projectId: "proj-1",
					stage: "prd",
					input: { prompt: "Build user auth" },
				});
				return Response.json({ operation: runningOp });
			}
			if (init?.method === "POST") {
				throw new TypeError("Failed to fetch (socket hang up)");
			}
			return Response.json({ operations: {} });
		});
		vi.stubGlobal("fetch", fetchMock);

		const result = await submitGenerationOperation({
			projectId: "proj-1",
			stage: "prd",
			input: { prompt: "Build user auth" },
		});

		expect(result.ok).toBe(true);
		expect(result.ackLost).toBe(true);
		expect(result.operation?.id).toBe("op-prd-1");
		expect(result.operation?.status).toBe("running");
	});

	it("2. Stale completed mismatch on ack lost: NEVER binds to an old completed operation", async () => {
		const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
			if (url.includes("reconcile=1")) {
				// Reconcile found NO matching active operation for this exact new input
				return Response.json({ operation: null });
			}
			if (init?.method === "POST") {
				throw new TypeError("Failed to fetch");
			}
			// Server has an old completed operation from hours ago
			return Response.json({
				operations: {
					prd: {
						id: "old-op-prd",
						projectId: "proj-1",
						stage: "prd",
						status: "completed",
						createdAt: new Date(Date.now() - 3600000).toISOString(),
						updatedAt: new Date(Date.now() - 3600000).toISOString(),
					},
				},
			});
		});
		vi.stubGlobal("fetch", fetchMock);

		const result = await submitGenerationOperation({
			projectId: "proj-1",
			stage: "prd",
			input: { prompt: "Completely new prompt" },
		});

		expect(result.ok).toBe(false);
		expect(result.operation).toBeNull();
		expect(result.ackLost).toBe(true);
		expect(result.error).toContain("Koneksi terputus");
	});

	it("3. Unavailable reads: 503 response returns status unavailable without wiping local state", async () => {
		const fetchMock = vi.fn(
			async () =>
				new Response(JSON.stringify({ error: "Service Unavailable" }), {
					status: 503,
				}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const readRes = await fetchGenerationOperations("proj-1");
		expect(readRes.status).toBe("unavailable");

		const runState = createMockRunState();
		renderHook(() =>
			useWorkspaceOperations({
				effectiveFeatureId: "proj-1",
				activeProjectIdRef: { current: "proj-1" },
				setRun: runState.setRun,
				setStageBusy: vi.fn(),
				setStageError: vi.fn(),
				onOperationCompleted: vi.fn(async () => true),
			}),
		);

		await act(async () => {
			await new Promise((r) => setTimeout(r, 60));
		});

		// setRun was not called with null/empty state
		expect(runState.current).toBeNull();
	});

	it("4. Malformed schema validation rejection: rejects invalid stage or status", () => {
		expect(
			parseOperation({ id: "1", stage: "invalid", status: "running" }),
		).toBeNull();
		expect(
			parseOperation({ id: "1", stage: "prd", status: "unknown_status" }),
		).toBeNull();
		expect(parseOperation("not-an-object")).toBeNull();
		expect(parseOperation(null)).toBeNull();

		const valid = parseOperation({
			id: "op-1",
			projectId: "proj-1",
			stage: "prd",
			status: "running",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		});
		expect(valid?.id).toBe("op-1");
		expect(valid?.stage).toBe("prd");
	});

	it("5. Exact-id polling: GET ?projectId=...&operationId=... monitors without fake timeout", async () => {
		let pollCount = 0;
		const fetchMock = vi.fn(async (url: string) => {
			expect(url).toContain("operationId=op-target-123");
			pollCount++;
			return Response.json({
				operation: {
					id: "op-target-123",
					projectId: "proj-1",
					stage: "ac",
					status: pollCount < 3 ? "running" : "completed",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			});
		});
		vi.stubGlobal("fetch", fetchMock);

		const settled = await pollOperationUntilSettled({
			projectId: "proj-1",
			stage: "ac",
			operationId: "op-target-123",
		});

		expect(pollCount).toBe(3);
		expect(settled?.status).toBe("completed");
		expect(settled?.id).toBe("op-target-123");
	});

	it("6. Two browser tabs: Tab 2 discovers Tab 1's running operation without duplicate POST", async () => {
		const sharedOp: DurableGenerationOperation = {
			id: "op-shared-1",
			projectId: "proj-1",
			stage: "prd",
			status: "running",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		let pollCount = 0;
		const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
			pollCount++;
			return Response.json({
				operations: {
					prd:
						pollCount === 1
							? sharedOp
							: {
									...sharedOp,
									status: "completed",
									result: { content: "# PRD" },
								},
				},
			});
		});
		vi.stubGlobal("fetch", fetchMock);

		const onOperationCompleted = vi.fn(async () => true);
		renderHook(() =>
			useWorkspaceOperations({
				effectiveFeatureId: "proj-1",
				activeProjectIdRef: { current: "proj-1" },
				setRun: vi.fn(),
				setStageBusy: vi.fn(),
				setStageError: vi.fn(),
				onOperationCompleted,
			}),
		);

		await act(async () => {
			await new Promise((r) => setTimeout(r, 60));
		});

		const postCalls = fetchMock.mock.calls.filter(
			(call) => (call[1] as RequestInit | undefined)?.method === "POST",
		);
		expect(postCalls).toHaveLength(0);
		expect(onOperationCompleted).toHaveBeenCalledWith(
			"prd",
			expect.objectContaining({ status: "completed" }),
		);
	});

	it("7. Project switch race guard: ignores late completions from prior project", async () => {
		const activeProjectIdRef = { current: "feat-a" as string | null };
		const opFeatA: DurableGenerationOperation = {
			id: "op-feat-a",
			projectId: "feat-a",
			stage: "prd",
			status: "running",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		const fetchMock = vi.fn(async (url: string) => {
			if (url.includes("feat-a")) {
				return Response.json({
					operations: {
						prd: {
							...opFeatA,
							status: "completed",
							result: { content: "# PRD A" },
						},
					},
				});
			}
			return Response.json({ operations: {} });
		});
		vi.stubGlobal("fetch", fetchMock);

		const onOperationCompleted = vi.fn(
			async (
				_stage: "questions" | "feature" | "prd" | "ac" | "task",
				_op: DurableGenerationOperation,
			) => true,
		);
		const { rerender } = renderHook(
			({ featureId }) =>
				useWorkspaceOperations({
					effectiveFeatureId: featureId,
					activeProjectIdRef,
					setRun: vi.fn(),
					setStageBusy: vi.fn(),
					setStageError: vi.fn(),
					onOperationCompleted,
				}),
			{ initialProps: { featureId: "feat-a" } },
		);

		// Switch project before poll settles
		activeProjectIdRef.current = "feat-b";
		rerender({ featureId: "feat-b" });

		await act(async () => {
			await new Promise((r) => setTimeout(r, 60));
		});

		const completionsForA = onOperationCompleted.mock.calls.filter(
			(call) => call[1]?.projectId === "feat-a",
		);
		expect(completionsForA).toHaveLength(0);
	});

	it("8. Single retry propagation: passing retry flag propagates to submission payload", async () => {
		let capturedPayload: unknown = null;
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			capturedPayload = JSON.parse(String(init?.body));
			return Response.json({
				operation: {
					id: "op-retry-1",
					projectId: "proj-1",
					stage: "prd",
					status: "running",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			});
		});
		vi.stubGlobal("fetch", fetchMock);

		const res = await submitGenerationOperation({
			projectId: "proj-1",
			stage: "prd",
			input: { prompt: "Refined prompt" },
			retry: true,
		});

		expect(res.ok).toBe(true);
		expect(capturedPayload).toEqual({
			projectId: "proj-1",
			stage: "prd",
			input: { prompt: "Refined prompt" },
			retry: true,
		});
	});
});
