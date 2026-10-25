import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	claim: vi.fn(),
	executeBounded: vi.fn(),
	recoverStale: vi.fn(),
}));

vi.mock("../services/durable-generation.server", () => ({
	claimNextGenerationOperation: mocks.claim,
	executeGenerationOperationBounded: mocks.executeBounded,
	recoverStaleGenerationOperations: mocks.recoverStale,
}));

import {
	getActiveWorkspaceGenerationExecutor,
	registerWorkspaceGenerationExecutor,
	runDurableWorkerLoop,
} from "../services/durable-worker";

beforeEach(() => {
	vi.clearAllMocks();
});

describe("durable worker runner and adapter contract", () => {
	it("allows registering an injectable stage handler dispatch adapter", () => {
		const customHandler = vi.fn().mockResolvedValue({
			artifactId: "art-custom",
			result: { success: true },
		});

		registerWorkspaceGenerationExecutor(customHandler);
		expect(getActiveWorkspaceGenerationExecutor()).toBe(customHandler);
	});

	it("processes claimed jobs and executes them bounded", async () => {
		const controller = new AbortController();
		const claim = {
			operationId: "op-worker-1",
			userId: "user-1",
			projectId: "proj-1",
			stage: "feature" as const,
			token: "token-1",
			attempt: 1,
			input: {},
			signal: new AbortController().signal,
		};

		mocks.claim.mockResolvedValueOnce(claim).mockImplementation(async () => {
			controller.abort();
			return null;
		});

		mocks.executeBounded.mockResolvedValueOnce({
			id: "op-worker-1",
			status: "completed",
		});

		const executor = vi.fn().mockResolvedValue({ artifactId: "art-1" });

		await runDurableWorkerLoop(
			{
				workerId: "test-worker",
				pollIntervalMs: 10,
				executor,
			},
			controller.signal,
		);

		expect(mocks.claim).toHaveBeenCalledWith("test-worker");
		expect(mocks.executeBounded).toHaveBeenCalledWith(claim, executor);
	});

	it("stops cleanly when stopSignal is aborted", async () => {
		const controller = new AbortController();
		controller.abort();

		await runDurableWorkerLoop(
			{
				pollIntervalMs: 10,
			},
			controller.signal,
		);

		expect(mocks.claim).not.toHaveBeenCalled();
	});
});
