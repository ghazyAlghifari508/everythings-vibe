import { beforeEach, describe, expect, it, vi } from "vitest";

const callOrder: string[] = [];

const mocks = vi.hoisted(() => ({
	claim: vi.fn(),
	executeBounded: vi.fn(),
	recoverStale: vi.fn(),
	dotenvConfig: vi.fn(),
}));

vi.mock("dotenv", () => ({
	config: (...args: unknown[]) => {
		callOrder.push("dotenv:config");
		return mocks.dotenvConfig(...args);
	},
}));

vi.mock("../services/durable-generation.server", () => ({
	claimNextGenerationOperation: (...args: unknown[]) => {
		callOrder.push("server:claim");
		return mocks.claim(...args);
	},
	executeGenerationOperationBounded: mocks.executeBounded,
	recoverStaleGenerationOperations: (...args: unknown[]) => {
		callOrder.push("server:recoverStale");
		return mocks.recoverStale(...args);
	},
}));

import { runDurableWorkerLoop } from "../services/durable-worker";

beforeEach(() => {
	vi.clearAllMocks();
	callOrder.length = 0;
});

describe("durable worker runner and adapter contract", () => {
	it("executes dotenv config before resolving or querying durable server operations", async () => {
		const controller = new AbortController();
		mocks.claim.mockImplementationOnce(async () => {
			controller.abort();
			return null;
		});

		await runDurableWorkerLoop(
			{
				workerId: "test-env-order",
				pollIntervalMs: 10,
			},
			controller.signal,
		);

		expect(callOrder).toContain("dotenv:config");
		expect(callOrder).toContain("server:claim");
		const dotenvIndex = callOrder.indexOf("dotenv:config");
		const serverClaimIndex = callOrder.indexOf("server:claim");
		expect(dotenvIndex).toBeLessThan(serverClaimIndex);
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
		expect(mocks.executeBounded).toHaveBeenCalledWith(
			expect.objectContaining({
				operationId: claim.operationId,
				userId: claim.userId,
				projectId: claim.projectId,
				stage: claim.stage,
				token: claim.token,
				attempt: claim.attempt,
			}),
			executor,
		);
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
