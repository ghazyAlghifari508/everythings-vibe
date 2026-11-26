import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	dbState,
	makeSelectChain,
	makeUpdateChain,
	resetDbState,
} from "./durable-generation-test-utils";

vi.mock("@/db", () => ({
	db: {
		select: () => makeSelectChain(),
		insert: () => ({
			values: (v: unknown) => {
				dbState.queries.push({ type: "insert-values", values: v });
				return {
					returning: async () => {
						const next = dbState.insertRows.shift();
						return Array.isArray(next) ? next : next ? [next] : [];
					},
				};
			},
		}),
		update: () => makeUpdateChain(),
		transaction: async <T>(
			cb: (tx: {
				select: typeof makeSelectChain;
				update: typeof makeUpdateChain;
				insert: () => {
					values: (v: unknown) => { returning: () => Promise<unknown[]> };
				};
				execute: () => Promise<unknown[]>;
			}) => Promise<T>,
		): Promise<T> =>
			cb({
				select: () => makeSelectChain(),
				update: () => makeUpdateChain(),
				insert: () => ({
					values: (v: unknown) => {
						dbState.queries.push({ type: "insert-values", values: v });
						return {
							returning: async () => {
								const next = dbState.insertRows.shift();
								return Array.isArray(next) ? next : next ? [next] : [];
							},
						};
					},
				}),
				execute: async () =>
					({ rows: [{ locked: true }] }) as unknown as unknown[],
			}),
	},
}));

vi.mock("../services/durable-generation-fence", async (importOriginal) => {
	const mod =
		await importOriginal<
			typeof import("../services/durable-generation-fence")
		>();
	return {
		...mod,
		withProjectGenerationLock: vi.fn(async (_projectId, run) => {
			const controller = new AbortController();
			return { acquired: true, value: await run(controller.signal) };
		}),
	};
});

const creditServiceMock = vi.hoisted(() => ({
	releaseCreditOperation: vi.fn().mockResolvedValue(true),
	quarantineCreditOperation: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/services/credit-service", () => ({
	releaseCreditOperation: creditServiceMock.releaseCreditOperation,
	quarantineCreditOperation: creditServiceMock.quarantineCreditOperation,
}));

const artifactMock = vi.hoisted(() => ({
	read: vi.fn(),
}));

vi.mock("../services/workspace-generation-artifact.server", () => ({
	readWorkspaceGenerationArtifact: artifactMock.read,
}));

import {
	completeGenerationOperation,
	executeGenerationOperationBounded,
	failGenerationOperation,
	getGenerationOperation,
	listGenerationOperations,
	recoverStaleGenerationOperations,
	renewGenerationClaim,
} from "../services/durable-generation.server";

beforeEach(() => {
	vi.clearAllMocks();
	resetDbState();
	artifactMock.read.mockResolvedValue(null);
});

describe("heartbeat and fencing enforcement", () => {
	it("renews lease when claim and jobToken are valid", async () => {
		dbState.updateRows = [[{ id: "op-1" }]];
		const success = await renewGenerationClaim({
			operationId: "op-1",
			token: "valid-token",
		});
		expect(success).toBe(true);
	});

	it("rejects heartbeat when lease expired or token was stolen", async () => {
		dbState.updateRows = [[]];
		const success = await renewGenerationClaim({
			operationId: "op-1",
			token: "stale-token",
		});
		expect(success).toBe(false);
	});

	it("completes operation with result when fencing token matches", async () => {
		dbState.updateRows = [[{ id: "op-1" }]];
		const success = await completeGenerationOperation(
			{ operationId: "op-1", token: "valid-token" },
			{ artifactId: "art-1", result: { ok: true } },
		);
		expect(success).toBe(true);
		const updateQuery = dbState.queries.find((q) => q.type === "update-set");
		const updateValues = updateQuery?.values as
			| Record<string, unknown>
			| undefined;
		expect(updateValues?.status).toBe("completed");
		expect(updateValues?.artifactId).toBe("art-1");
	});

	it("marks operation as failed with classified code when fencing token matches", async () => {
		dbState.updateRows = [[{ id: "op-1" }]];
		const success = await failGenerationOperation(
			{ operationId: "op-1", token: "valid-token" },
			{ message: "Timeout", code: "TIMEOUT_ERROR" },
		);
		expect(success).toBe(true);
		const updateQuery = dbState.queries.find((q) => q.type === "update-set");
		const updateValues = updateQuery?.values as
			| Record<string, unknown>
			| undefined;
		expect(updateValues?.status).toBe("failed");
		expect(updateValues?.errorCode).toBe("TIMEOUT_ERROR");
		// The attempt window is frozen, not rewritten: `startedAt` stays as the claim
		// stamped it, so the settled duration is the attempt's own elapsed time.
		expect(updateValues?.finishedAt).toBeInstanceOf(Date);
		expect(updateValues && "startedAt" in updateValues).toBe(false);
	});
});

describe("bounded execution lifecycle", () => {
	it("executes handler, completes operation, and records persisted artifact evidence", async () => {
		const now = new Date();
		artifactMock.read.mockResolvedValue({
			artifactId: "prd-artifact-123",
			result: { prd: "done" },
		});

		dbState.updateRows = [[{ id: "op-1" }]];
		dbState.selectRows = [
			// verifyClaimLeaseFence: select from codebaseGenerationOperations
			[{ id: "op-1" }],
			// getGenerationOperation: select from codebaseGenerationOperations
			[
				{
					id: "op-1",
					userId: "user-1",
					projectId: "proj-1",
					stage: "prd",
					status: "completed",
					attempt: 1,
					artifactId: "prd-artifact-123",
					result: { prd: "done" },
					createdAt: now,
					updatedAt: now,
					startedAt: now,
					finishedAt: now,
				},
			],
			// assertProjectTenantAccess: select from projects
			[{ id: "proj-1", userId: "user-1", deletedAt: null }],
		];

		const claim = {
			operationId: "op-1",
			userId: "user-1",
			projectId: "proj-1",
			stage: "prd" as const,
			token: "token-1",
			attempt: 1,
			input: {},
			signal: new AbortController().signal,
		};

		const executor = vi.fn().mockResolvedValue({
			artifactId: "prd-artifact-123",
			result: { prd: "done" },
		});

		const result = await executeGenerationOperationBounded(claim, executor, {
			timeoutMs: 5000,
			heartbeatMs: 10000,
		});

		expect(executor).toHaveBeenCalled();
		expect(result.status).toBe("completed");
		expect(result.artifactId).toBe("prd-artifact-123");
	});

	it("never completes an operation whose result has no matching persisted artifact", async () => {
		const now = new Date();
		// The executor claims success, but nothing of that attempt reached storage.
		artifactMock.read.mockResolvedValue(null);
		dbState.updateRows = [[{ id: "op-1" }]];
		dbState.selectRows = [
			// verifyClaimLeaseFence: select from codebaseGenerationOperations
			[{ id: "op-1" }],
			// getGenerationOperation: select from codebaseGenerationOperations
			[
				{
					id: "op-1",
					userId: "user-1",
					projectId: "proj-1",
					stage: "questions",
					status: "failed",
					attempt: 1,
					error: "Generation result has no matching persisted artifact",
					errorCode: "EXECUTION_ERROR",
					createdAt: now,
					updatedAt: now,
					startedAt: now,
					finishedAt: now,
				},
			],
			// assertProjectTenantAccess: select from projects
			[{ id: "proj-1", userId: "user-1", deletedAt: null }],
		];

		const claim = {
			operationId: "op-1",
			userId: "user-1",
			projectId: "proj-1",
			stage: "questions" as const,
			token: "token-1",
			attempt: 1,
			input: {},
			signal: new AbortController().signal,
		};
		const executor = vi.fn().mockResolvedValue({
			artifactId: "art-never-persisted",
			result: { questions: [] },
		});

		const result = await executeGenerationOperationBounded(claim, executor, {
			timeoutMs: 5000,
			heartbeatMs: 10000,
		});

		expect(executor).toHaveBeenCalled();
		expect(result.status).toBe("failed");
		// Success is recorded ONLY after the persisted artifact is read back.
		expect(
			dbState.queries
				.filter((query) => query.type === "update-set")
				.map((query) => query.values),
		).toEqual([expect.objectContaining({ status: "failed" })]);
	});

	it.each([
		"MODEL_RATE_LIMIT",
		"PERSISTENCE_FAILED",
		"ARTIFACT_PERSISTENCE_FAILED",
	])("marks questions failed with classified code %s", async (code) => {
		const now = new Date();
		dbState.updateRows = [[{ id: "op-1" }]];
		dbState.selectRows = [
			// verifyClaimLeaseFence: select from codebaseGenerationOperations
			[{ id: "op-1" }],
			// getGenerationOperation: select from codebaseGenerationOperations
			[
				{
					id: "op-1",
					userId: "user-1",
					projectId: "proj-1",
					stage: "questions",
					status: "failed",
					attempt: 1,
					error: "AI model rate limited",
					errorCode: code,
					createdAt: now,
					updatedAt: now,
					startedAt: now,
					finishedAt: now,
				},
			],
			// assertProjectTenantAccess: select from projects
			[{ id: "proj-1", userId: "user-1", deletedAt: null }],
		];

		const claim = {
			operationId: "op-1",
			userId: "user-1",
			projectId: "proj-1",
			stage: "questions" as const,
			token: "token-1",
			attempt: 1,
			input: {},
			signal: new AbortController().signal,
		};

		const customError = new Error("AI model rate limited") as Error & {
			code?: string;
		};
		customError.code = code;
		const executor = vi.fn().mockRejectedValue(customError);

		const result = await executeGenerationOperationBounded(claim, executor, {
			timeoutMs: 5000,
			heartbeatMs: 10000,
		});

		expect(result.status).toBe("failed");
		expect(result.errorCode).toBe(code);
		expect(
			dbState.queries
				.filter((query) => query.type === "update-set")
				.map((query) => query.values),
		).toEqual([expect.objectContaining({ status: "failed", errorCode: code })]);
	});
});

describe("crash recovery", () => {
	it("reconciles expired jobs: marks terminal failed when no new artifact and releases credit", async () => {
		const now = new Date();
		const expiredJob = {
			id: "op-expired-1",
			userId: "user-1",
			projectId: "proj-1",
			stage: "feature",
			status: "running",
			jobToken: "tok-1",
			baselineArtifactId: "art-baseline-1",
			leaseExpiresAt: new Date(Date.now() - 5000),
			createdAt: now,
			updatedAt: now,
		};

		dbState.selectRows = [
			// 1. Initial query for expired running jobs
			[expiredJob],
			// 2. CAS verification inside lock
			[expiredJob],
			// 3. Credit op lookup
			[{ id: "credit-1", state: "running" }],
		];
		dbState.updateRows = [[{ id: "op-expired-1" }]];

		// No new artifact (artifact reader returns baseline or null)
		artifactMock.read.mockResolvedValueOnce({
			artifactId: "art-baseline-1",
			result: null,
		});

		const count = await recoverStaleGenerationOperations();

		expect(count).toBe(1);
		// Verified credit released
		expect(creditServiceMock.releaseCreditOperation).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: "user-1",
				operationId: "credit-1",
			}),
		);

		const updateQuery = dbState.queries.find((q) => q.type === "update-set");
		const updateValues = updateQuery?.values as
			| Record<string, unknown>
			| undefined;
		expect(updateValues?.status).toBe("failed");
		expect(updateValues?.errorCode).toBe("LEASE_EXPIRED");
	});

	it("reconciles expired jobs: completes job when genuine new persisted artifact exists", async () => {
		const now = new Date();
		const expiredJob = {
			id: "op-expired-2",
			userId: "user-1",
			projectId: "proj-1",
			stage: "prd",
			status: "running",
			jobToken: "tok-2",
			baselineArtifactId: "art-old",
			leaseExpiresAt: new Date(Date.now() - 5000),
			createdAt: now,
			updatedAt: now,
		};

		dbState.selectRows = [
			// 1. Initial query for expired running jobs
			[expiredJob],
			// 2. CAS verification inside lock
			[expiredJob],
		];
		dbState.updateRows = [[{ id: "op-expired-2" }]];

		// Genuine NEW artifact distinct from baseline
		artifactMock.read.mockResolvedValueOnce({
			artifactId: "art-new-999",
			result: { prd: "done" },
		});

		const count = await recoverStaleGenerationOperations();

		expect(count).toBe(1);
		const updateQuery = dbState.queries.find((q) => q.type === "update-set");
		const updateValues = updateQuery?.values as
			| Record<string, unknown>
			| undefined;
		expect(updateValues?.status).toBe("completed");
		expect(updateValues?.artifactId).toBe("art-new-999");
	});
});

describe("tenant isolation and authorization", () => {
	it("lists operations scoped strictly to authorized user and project", async () => {
		const now = new Date();
		dbState.selectRows = [
			// assertProjectTenantAccess
			[{ id: "proj-1", userId: "user-1", deletedAt: null }],
			// select from codebaseGenerationOperations
			[
				{
					id: "op-1",
					projectId: "proj-1",
					stage: "questions",
					status: "completed",
					attempt: 1,
					createdAt: now,
					updatedAt: now,
				},
			],
		];

		const ops = await listGenerationOperations("user-1", "proj-1");

		expect(ops).toHaveLength(1);
		expect(ops[0].id).toBe("op-1");
	});

	it("returns null when accessing an operation owned by a different user", async () => {
		dbState.selectRows = [[]];

		const op = await getGenerationOperation("attacker-user", "op-foreign");

		expect(op).toBeNull();
	});
});
