// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
	CodebasePipelineStage,
	CodebaseRunStage,
	CodebaseRunState,
} from "@/features/codebase/services/chat-flow";
import {
	type DurableGenerationOperation,
	fetchGenerationOperations,
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
				? (updater as (prev: CodebaseRunState | null) => CodebaseRunState | null)(
						current,
					)
				: (updater as CodebaseRunState | null);
	});
	return {
		setRun,
		get current() {
			return current;
		},
	};
}

describe("Durable Generation Operations - Refresh, Network, Two Tabs & Race Guards", () => {
	it("1. Refresh while questions are generating: resumes monitoring without restarting AI", async () => {
		const qOperation: DurableGenerationOperation = {
			id: "op-q1",
			projectId: "proj-1",
			stage: "questions",
			status: "running",
			startedAt: Date.now() - 5000,
		};

		let pollCount = 0;
		const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
			if (url.includes("/api/codebase/generation")) {
				pollCount++;
				if (pollCount === 1) {
					return Response.json({
						operations: {
							questions: qOperation,
						},
					});
				}
				return Response.json({
					operations: {
						questions: {
							...qOperation,
							status: "completed",
							result: {
								questions: [
									{ id: "q1", question: "Clarification 1?", type: "text" },
								],
							},
						},
					},
				});
			}
			return Response.json({});
		});
		vi.stubGlobal("fetch", fetchMock);

		const runState = createMockRunState();
		const setStageBusy = vi.fn();
		const setStageError = vi.fn();
		const onOperationCompleted = vi.fn(async () => true);

		renderHook(() =>
			useWorkspaceOperations({
				effectiveFeatureId: "proj-1",
				activeProjectIdRef: { current: "proj-1" },
				setRun: runState.setRun,
				setStageBusy,
				setStageError,
				onOperationCompleted,
			}),
		);

		await act(async () => {
			await new Promise((r) => setTimeout(r, 50));
		});

		// Verifies no AI generation POST was initiated, only GET polling
		const postCalls = fetchMock.mock.calls.filter(
			(call) => (call[1] as RequestInit | undefined)?.method === "POST",
		);
		expect(postCalls).toHaveLength(0);

		// Verified run was transitioned to done after monitoring completion
		expect(runState.setRun).toHaveBeenCalled();
		expect(runState.current?.stage).toBe("questions");
		expect(runState.current?.status).toBe("done");

		// When operation completed, callback was triggered
		expect(onOperationCompleted).toHaveBeenCalledWith(
			"questions",
			expect.objectContaining({ status: "completed" }),
		);
	});

	it("2. Refresh while Feature is generating: monitors to completion and reloads feature tree", async () => {
		const featOp: DurableGenerationOperation = {
			id: "op-feat-1",
			projectId: "proj-1",
			stage: "feature",
			status: "running",
			startedAt: Date.now() - 3000,
		};

		let poll = 0;
		const fetchMock = vi.fn(async () => {
			poll++;
			return Response.json({
				operations: {
					feature:
						poll === 1
							? featOp
							: { ...featOp, status: "completed", result: { phases: [] } },
				},
			});
		});
		vi.stubGlobal("fetch", fetchMock);

		const setRun = vi.fn();
		const setStageBusy = vi.fn();
		const setStageError = vi.fn();
		const onOperationCompleted = vi.fn(async () => true);

		renderHook(() =>
			useWorkspaceOperations({
				effectiveFeatureId: "proj-1",
				activeProjectIdRef: { current: "proj-1" },
				setRun,
				setStageBusy,
				setStageError,
				onOperationCompleted,
			}),
		);

		await act(async () => {
			await new Promise((r) => setTimeout(r, 50));
		});

		expect(setStageBusy).toHaveBeenCalledWith("feature");
		expect(onOperationCompleted).toHaveBeenCalledWith(
			"feature",
			expect.objectContaining({ status: "completed" }),
		);
	});

	it("3. Refresh while PRD is generating: monitors until PRD persisted without restarting", async () => {
		const prdOp: DurableGenerationOperation = {
			id: "op-prd-1",
			projectId: "proj-1",
			stage: "prd",
			status: "running",
			startedAt: Date.now() - 4000,
		};

		let poll = 0;
		const fetchMock = vi.fn(async () => {
			poll++;
			return Response.json({
				operations: {
					prd:
						poll === 1
							? prdOp
							: { ...prdOp, status: "completed", result: { content: "# PRD" } },
				},
			});
		});
		vi.stubGlobal("fetch", fetchMock);

		const runState = createMockRunState();
		const setStageBusy = vi.fn();
		const setStageError = vi.fn();
		const onOperationCompleted = vi.fn(async () => true);

		renderHook(() =>
			useWorkspaceOperations({
				effectiveFeatureId: "proj-1",
				activeProjectIdRef: { current: "proj-1" },
				setRun: runState.setRun,
				setStageBusy,
				setStageError,
				onOperationCompleted,
			}),
		);

		await act(async () => {
			await new Promise((r) => setTimeout(r, 50));
		});

		expect(runState.setRun).toHaveBeenCalled();
		expect(runState.current?.stage).toBe("prd");
		expect(runState.current?.status).toBe("done");
		expect(onOperationCompleted).toHaveBeenCalledWith(
			"prd",
			expect.objectContaining({ status: "completed" }),
		);
	});

	it("4. Refresh while AC is generating: monitors until AC ready", async () => {
		const acOp: DurableGenerationOperation = {
			id: "op-ac-1",
			projectId: "proj-1",
			stage: "ac",
			status: "running",
			startedAt: Date.now() - 2000,
		};

		let poll = 0;
		const fetchMock = vi.fn(async () => {
			poll++;
			return Response.json({
				operations: {
					ac:
						poll === 1
							? acOp
							: { ...acOp, status: "completed", result: { content: "# AC" } },
				},
			});
		});
		vi.stubGlobal("fetch", fetchMock);

		const setRun = vi.fn();
		const setStageBusy = vi.fn();
		const setStageError = vi.fn();
		const onOperationCompleted = vi.fn(async () => true);

		renderHook(() =>
			useWorkspaceOperations({
				effectiveFeatureId: "proj-1",
				activeProjectIdRef: { current: "proj-1" },
				setRun,
				setStageBusy,
				setStageError,
				onOperationCompleted,
			}),
		);

		await act(async () => {
			await new Promise((r) => setTimeout(r, 50));
		});

		expect(onOperationCompleted).toHaveBeenCalledWith(
			"ac",
			expect.objectContaining({ status: "completed" }),
		);
	});

	it("5. Refresh while Task is generating: monitors until Kanban task tree ready", async () => {
		const taskOp: DurableGenerationOperation = {
			id: "op-task-1",
			projectId: "proj-1",
			stage: "task",
			status: "running",
			startedAt: Date.now() - 1000,
		};

		let poll = 0;
		const fetchMock = vi.fn(async () => {
			poll++;
			return Response.json({
				operations: {
					task:
						poll === 1
							? taskOp
							: { ...taskOp, status: "completed", result: { taskTree: {} } },
				},
			});
		});
		vi.stubGlobal("fetch", fetchMock);

		const setRun = vi.fn();
		const setStageBusy = vi.fn();
		const setStageError = vi.fn();
		const onOperationCompleted = vi.fn(async () => true);

		renderHook(() =>
			useWorkspaceOperations({
				effectiveFeatureId: "proj-1",
				activeProjectIdRef: { current: "proj-1" },
				setRun,
				setStageBusy,
				setStageError,
				onOperationCompleted,
			}),
		);

		await act(async () => {
			await new Promise((r) => setTimeout(r, 50));
		});

		expect(onOperationCompleted).toHaveBeenCalledWith(
			"task",
			expect.objectContaining({ status: "completed" }),
		);
	});

	it("6. Ack-lost reconciliation: network drops after server accepted request, attaches to running operation", async () => {
		let postCount = 0;
		const runningOp: DurableGenerationOperation = {
			id: "op-durable-1",
			projectId: "proj-1",
			stage: "prd",
			status: "running",
			startedAt: Date.now(),
		};

		const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
			if (init?.method === "POST") {
				postCount++;
				// Simulate socket hang up / network drop right after server received the request
				throw new TypeError("Failed to fetch");
			}
			// GET /api/codebase/generation confirms server has accepted the job!
			return Response.json({
				operations: {
					prd: runningOp,
				},
			});
		});
		vi.stubGlobal("fetch", fetchMock);

		const result = await submitGenerationOperation({
			projectId: "proj-1",
			stage: "prd",
			input: { projectId: "proj-1" },
		});

		expect(result.ok).toBe(true);
		expect(result.ackLost).toBe(true);
		expect(result.operation?.id).toBe("op-durable-1");
		expect(result.operation?.status).toBe("running");
	});

	it("7. Network disconnected before server accepted request: reports connectivity error and enables retry", async () => {
		const fetchMock = vi.fn(async () => {
			throw new TypeError("Failed to fetch (offline)");
		});
		vi.stubGlobal("fetch", fetchMock);

		const result = await submitGenerationOperation({
			projectId: "proj-1",
			stage: "prd",
			input: { projectId: "proj-1" },
		});

		expect(result.ok).toBe(false);
		expect(result.operation).toBeNull();
		expect(result.error).toContain("Koneksi terputus");
	});

	it("8. Two browser tabs: Tab 2 discovers Tab 1's running operation without duplicate generation", async () => {
		const sharedOp: DurableGenerationOperation = {
			id: "op-shared-1",
			projectId: "proj-1",
			stage: "prd",
			status: "running",
			startedAt: Date.now() - 2000,
		};

		let pollCount = 0;
		const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
			pollCount++;
			return Response.json({
				operations: {
					prd:
						pollCount === 1
							? sharedOp
							: { ...sharedOp, status: "completed", result: { content: "# PRD" } },
				},
			});
		});
		vi.stubGlobal("fetch", fetchMock);

		const setRun = vi.fn();
		const setStageBusy = vi.fn();
		const setStageError = vi.fn();
		const onOperationCompleted = vi.fn(async () => true);

		// Tab 2 mounts while Tab 1 has an active generation
		renderHook(() =>
			useWorkspaceOperations({
				effectiveFeatureId: "proj-1",
				activeProjectIdRef: { current: "proj-1" },
				setRun,
				setStageBusy,
				setStageError,
				onOperationCompleted,
			}),
		);

		await act(async () => {
			await new Promise((r) => setTimeout(r, 50));
		});

		// Tab 2 never called POST
		const postCalls = fetchMock.mock.calls.filter(
			(call) => (call[1] as RequestInit | undefined)?.method === "POST",
		);
		expect(postCalls).toHaveLength(0);

		// Tab 2 observed the running operation and completed it
		expect(onOperationCompleted).toHaveBeenCalledWith(
			"prd",
			expect.objectContaining({ status: "completed" }),
		);
	});

	it("9. Project switch race guard: switching from Feature A to Feature B ignores late completions from Feature A", async () => {
		const activeProjectIdRef = { current: "feat-a" as string | null };

		const opFeatA: DurableGenerationOperation = {
			id: "op-feat-a",
			projectId: "feat-a",
			stage: "prd",
			status: "running",
			startedAt: Date.now() - 5000,
		};

		const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
			if (url.includes("feat-a")) {
				return Response.json({
					operations: {
						prd: { ...opFeatA, status: "completed", result: { content: "# PRD A" } },
					},
				});
			}
			return Response.json({
				operations: {},
			});
		});
		vi.stubGlobal("fetch", fetchMock);

		const setRun = vi.fn();
		const setStageBusy = vi.fn();
		const setStageError = vi.fn();
		const onOperationCompleted = vi.fn<
			(stage: CodebaseRunStage, op: DurableGenerationOperation) => Promise<boolean>
		>(async () => true);

		const { rerender } = renderHook(
			({ featureId }) =>
				useWorkspaceOperations({
					effectiveFeatureId: featureId,
					activeProjectIdRef,
					setRun,
					setStageBusy,
					setStageError,
					onOperationCompleted,
				}),
			{ initialProps: { featureId: "feat-a" } },
		);

		// User immediately switches to feat-b
		activeProjectIdRef.current = "feat-b";
		rerender({ featureId: "feat-b" });

		await act(async () => {
			await new Promise((r) => setTimeout(r, 50));
		});

		// onOperationCompleted must NOT have been called with feat-a's completed data for feat-b
		const callsForA = onOperationCompleted.mock.calls.filter(
			(call) => call[1]?.projectId === "feat-a",
		);
		expect(callsForA).toHaveLength(0);
	});

	it("10. One retry: passing retry flag propagates to submission payload", async () => {
		let capturedPayload: unknown = null;
		const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
			capturedPayload = JSON.parse(String(init?.body));
			return Response.json({
				operation: {
					id: "op-retry-1",
					projectId: "proj-1",
					stage: "prd",
					status: "running",
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
