// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
	CodebaseRunStage,
	CodebaseRunState,
} from "@/features/codebase/services/chat-flow";
import type { DurableGenerationOperation } from "@/features/codebase/services/workspace-operations";
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

function mockOp(
	stage: CodebaseRunStage,
	status: DurableGenerationOperation["status"],
	overrides: Partial<DurableGenerationOperation> = {},
): DurableGenerationOperation {
	return {
		id: `op-${stage}-1`,
		projectId: "proj-1",
		stage,
		status,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		...overrides,
	};
}

describe("Durable Operations - Mount & Refresh Hydration", () => {
	it.each([
		"questions",
		"feature",
		"prd",
		"ac",
		"task",
	] as const)("1. Refresh while %s is RUNNING: monitors to completion without restarting AI POST", async (stage) => {
		const runningOp = mockOp(stage, "running");
		let poll = 0;
		const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
			poll++;
			return Response.json({
				operations: {
					[stage]:
						poll === 1
							? runningOp
							: { ...runningOp, status: "completed", result: { ok: true } },
				},
			});
		});
		vi.stubGlobal("fetch", fetchMock);

		const runState = createMockRunState();
		const setStageBusy = vi.fn();
		const onOperationCompleted = vi.fn(async () => true);

		renderHook(() =>
			useWorkspaceOperations({
				effectiveFeatureId: "proj-1",
				activeProjectIdRef: { current: "proj-1" },
				setRun: runState.setRun,
				setStageBusy,
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
		expect(setStageBusy).toHaveBeenCalledWith(stage);
		expect(onOperationCompleted).toHaveBeenCalledWith(
			stage,
			expect.objectContaining({ status: "completed" }),
		);
		expect(runState.current?.status).toBe("done");
	});

	it.each([
		["questions", { questions: [{ id: "q1", question: "Detail?" }] }],
		["feature", { phases: [] }],
		["prd", { content: "# PRD" }],
		["ac", { content: "# AC" }],
		["task", { taskTree: {} }],
	] as const)("2. Refresh on %s COMPLETED: hydrates actual artifact and marks run done", async (stage, result) => {
		const completedOp = mockOp(stage, "completed", { result });
		const fetchMock = vi.fn(async () =>
			Response.json({ operations: { [stage]: completedOp } }),
		);
		vi.stubGlobal("fetch", fetchMock);

		const runState = createMockRunState();
		const onOperationCompleted = vi.fn(async () => true);

		renderHook(() =>
			useWorkspaceOperations({
				effectiveFeatureId: "proj-1",
				activeProjectIdRef: { current: "proj-1" },
				setRun: runState.setRun,
				setStageBusy: vi.fn(),
				setStageError: vi.fn(),
				onOperationCompleted,
			}),
		);

		await act(async () => {
			await new Promise((r) => setTimeout(r, 60));
		});

		expect(onOperationCompleted).toHaveBeenCalledWith(
			stage,
			expect.objectContaining({ status: "completed" }),
		);
		expect(runState.current?.status).toBe("done");
	});

	it.each([
		"questions",
		"feature",
		"prd",
		"ac",
		"task",
	] as const)("3. Refresh on %s FAILED: contextual error message enables one retry", async (stage) => {
		const failedOp = mockOp(stage, "failed", {
			error: `${stage} gagal di backend.`,
		});
		const fetchMock = vi.fn(async () =>
			Response.json({ operations: { [stage]: failedOp } }),
		);
		vi.stubGlobal("fetch", fetchMock);

		const runState = createMockRunState();
		const setStageError = vi.fn();

		renderHook(() =>
			useWorkspaceOperations({
				effectiveFeatureId: "proj-1",
				activeProjectIdRef: { current: "proj-1" },
				setRun: runState.setRun,
				setStageBusy: vi.fn(),
				setStageError,
				onOperationCompleted: vi.fn(async () => true),
			}),
		);

		await act(async () => {
			await new Promise((r) => setTimeout(r, 60));
		});

		expect(setStageError).toHaveBeenCalledWith(`${stage} gagal di backend.`);
		expect(runState.current?.status).toBe("failed");
		expect(runState.current?.stage).toBe(stage);
	});

	it("4. Refresh on CANCELLED: settles as a non-success carrying the cancelled message", async () => {
		const cancelledOp = mockOp("prd", "cancelled");
		const fetchMock = vi.fn(async () =>
			Response.json({ operations: { prd: cancelledOp } }),
		);
		vi.stubGlobal("fetch", fetchMock);

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

		expect(runState.current?.status).toBe("failed");
		expect(runState.current?.error).toContain("Dibatalkan");
	});

	it("5. Persistence callback false: marks run failed when save fails", async () => {
		const prdOp = mockOp("prd", "completed");
		const fetchMock = vi.fn(async () =>
			Response.json({ operations: { prd: prdOp } }),
		);
		vi.stubGlobal("fetch", fetchMock);

		const runState = createMockRunState();
		const setStageError = vi.fn();
		const onOperationCompleted = vi.fn(async () => false); // save failed!

		renderHook(() =>
			useWorkspaceOperations({
				effectiveFeatureId: "proj-1",
				activeProjectIdRef: { current: "proj-1" },
				setRun: runState.setRun,
				setStageBusy: vi.fn(),
				setStageError,
				onOperationCompleted,
			}),
		);

		await act(async () => {
			await new Promise((r) => setTimeout(r, 60));
		});

		expect(onOperationCompleted).toHaveBeenCalled();
		expect(setStageError).toHaveBeenCalledWith(
			expect.stringContaining("belum tersimpan"),
		);
		expect(runState.current?.status).toBe("failed");
	});
});
