import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CodebaseGenerationOperationRow } from "@/db/codebase-generation-schema";

const dbState = vi.hoisted(() => ({
	selectRows: [] as unknown[],
	insertRows: [] as unknown[],
	updateRows: [] as unknown[],
	queries: [] as { type: string; values?: unknown; where?: unknown }[],
}));

type MockQueryChain = Promise<unknown[]> & {
	from: (table?: unknown) => MockQueryChain;
	where: (w: unknown) => MockQueryChain;
	orderBy: (o?: unknown) => MockQueryChain;
	limit: (n?: number) => MockQueryChain;
	for: (lock?: unknown, opts?: unknown) => MockQueryChain;
};

type MockUpdateChain = Promise<unknown[]> & {
	set: (v: unknown) => MockUpdateChain;
	where: (w: unknown) => MockUpdateChain;
	returning: () => Promise<unknown[]>;
};

function makeSelectChain(): MockQueryChain {
	const getResult = async () => {
		const next = dbState.selectRows.shift();
		return Array.isArray(next) ? next : next ? [next] : [];
	};
	const promise = getResult();
	const chain = Object.assign(promise, {
		from: () => chain,
		where: (w: unknown) => {
			dbState.queries.push({ type: "select-where", where: w });
			return chain;
		},
		orderBy: () => chain,
		limit: () => chain,
		for: () => chain,
	});
	return chain;
}

function makeUpdateChain(): MockUpdateChain {
	let cached: unknown[] | null = null;
	const getRows = () => {
		if (cached === null) {
			const next = dbState.updateRows.shift();
			cached = Array.isArray(next) ? next : next ? [next] : [];
		}
		return cached;
	};
	const promise = Promise.resolve().then(() => getRows());
	const chain = Object.assign(promise, {
		set: (v: unknown) => {
			dbState.queries.push({ type: "update-set", values: v });
			return chain;
		},
		where: (w: unknown) => {
			dbState.queries.push({ type: "update-where", where: w });
			return chain;
		},
		returning: async () => {
			return getRows();
		},
	});
	return chain;
}

vi.mock("@/db", () => ({
	db: {
		select: () => makeSelectChain(),
		insert: () => {
			return {
				values: (v: unknown) => {
					dbState.queries.push({ type: "insert-values", values: v });
					return {
						returning: async () => {
							const next = dbState.insertRows.shift();
							return Array.isArray(next) ? next : next ? [next] : [];
						},
					};
				},
			};
		},
		update: () => makeUpdateChain(),
		transaction: async <T>(
			cb: (tx: {
				select: () => MockQueryChain;
				update: () => MockUpdateChain;
			}) => Promise<T>,
		): Promise<T> => {
			return cb({
				select: () => makeSelectChain(),
				update: () => makeUpdateChain(),
			});
		},
	},
}));

const artifactMock = vi.hoisted(() => ({
	read: vi.fn(),
}));

vi.mock("../services/workspace-generation-artifact.server", () => ({
	readWorkspaceGenerationArtifact: artifactMock.read,
}));

import {
	claimNextGenerationOperation,
	completeGenerationOperation,
	computeGenerationIdentityHash,
	executeGenerationOperationBounded,
	failGenerationOperation,
	getGenerationOperation,
	getOrCreateGenerationOperation,
	listGenerationOperations,
	recoverStaleGenerationOperations,
	renewGenerationClaim,
	toWorkspaceGenerationOperation,
} from "../services/durable-generation.server";
import type { WorkspaceGenerationRequest } from "../types/workspace-generation";

beforeEach(() => {
	vi.clearAllMocks();
	dbState.selectRows = [];
	dbState.insertRows = [];
	dbState.updateRows = [];
	dbState.queries = [];
	artifactMock.read.mockResolvedValue(null);
});

describe("durable identity hash", () => {
	it("produces deterministic hash regardless of object key ordering", () => {
		const hash1 = computeGenerationIdentityHash({
			userId: "user-1",
			projectId: "proj-1",
			stage: "prd",
			inputRevision: "rev-1",
			input: { b: 2, a: 1, c: { y: "y", x: "x" } },
		});

		const hash2 = computeGenerationIdentityHash({
			userId: "user-1",
			projectId: "proj-1",
			stage: "prd",
			inputRevision: "rev-1",
			input: { a: 1, c: { x: "x", y: "y" }, b: 2 },
		});

		expect(hash1).toBe(hash2);
	});

	it("changes when tenant, project, stage, revision, or input values differ", () => {
		const base = {
			userId: "user-1",
			projectId: "proj-1",
			stage: "prd",
			inputRevision: "rev-1",
			input: { key: "val" },
		};

		const baseHash = computeGenerationIdentityHash(base);

		expect(
			computeGenerationIdentityHash({ ...base, userId: "user-2" }),
		).not.toBe(baseHash);
		expect(
			computeGenerationIdentityHash({ ...base, projectId: "proj-2" }),
		).not.toBe(baseHash);
		expect(
			computeGenerationIdentityHash({ ...base, stage: "feature" }),
		).not.toBe(baseHash);
		expect(
			computeGenerationIdentityHash({ ...base, inputRevision: "rev-2" }),
		).not.toBe(baseHash);
		expect(
			computeGenerationIdentityHash({ ...base, input: { key: "val2" } }),
		).not.toBe(baseHash);
	});
});

describe("DTO projection safety", () => {
	it("strips sensitive job tokens and internal tenant storage from public DTO", () => {
		const now = new Date();
		const row: CodebaseGenerationOperationRow = {
			id: "op-1",
			userId: "secret-user",
			projectId: "proj-1",
			stage: "prd",
			status: "running",
			identityHash: "hash-1",
			input: { secret: "payload" },
			source: { codebaseId: "c1", snapshotId: "s1", inputRevision: "r1" },
			attempt: 1,
			maxAttempts: 3,
			jobToken: "secret-lease-token",
			claimedBy: "worker-1",
			leaseExpiresAt: new Date(Date.now() + 60000),
			heartbeatAt: now,
			artifactId: "art-1",
			result: { ok: true },
			error: null,
			errorCode: null,
			createdAt: now,
			updatedAt: now,
			startedAt: now,
			finishedAt: null,
		};

		const dto = toWorkspaceGenerationOperation(row);

		expect(dto).toEqual({
			id: "op-1",
			projectId: "proj-1",
			stage: "prd",
			status: "running",
			attempt: 1,
			result: { ok: true },
			error: null,
			errorCode: null,
			artifactId: "art-1",
			createdAt: now.toISOString(),
			updatedAt: now.toISOString(),
			startedAt: now.toISOString(),
			finishedAt: null,
		});

		expect(dto).not.toHaveProperty("jobToken");
		expect(dto).not.toHaveProperty("userId");
		expect(dto).not.toHaveProperty("input");
		expect(dto).not.toHaveProperty("source");
		expect(dto).not.toHaveProperty("claimedBy");
		expect(dto).not.toHaveProperty("identityHash");
	});
});

describe("getOrCreateGenerationOperation", () => {
	it("reconciles existing persisted artifact without enqueueing new AI work", async () => {
		artifactMock.read.mockResolvedValueOnce({
			artifactId: "prd-v1",
			result: { content: "# PRD Content" },
		});

		const now = new Date();
		dbState.selectRows = [
			// existing completed query returns null
			[],
		];
		dbState.insertRows = [
			{
				id: "op-persisted",
				projectId: "proj-1",
				stage: "prd",
				status: "completed",
				attempt: 1,
				result: { content: "# PRD Content" },
				artifactId: "prd-v1",
				createdAt: now,
				updatedAt: now,
				startedAt: now,
				finishedAt: now,
			},
		];

		const request: WorkspaceGenerationRequest = {
			projectId: "proj-1",
			stage: "prd",
			input: { message: "Generate", mode: "generate" },
			retry: false,
		};

		const result = await getOrCreateGenerationOperation("user-1", request);

		expect(result.status).toBe("completed");
		expect(result.artifactId).toBe("prd-v1");
		expect(result.result).toEqual({ content: "# PRD Content" });
	});

	it("reuses active in-flight operation when user refreshes or re-requests", async () => {
		const now = new Date();
		dbState.selectRows = [
			// activeOp query returns active operation
			[
				{
					id: "op-running",
					projectId: "proj-1",
					stage: "feature",
					status: "running",
					attempt: 1,
					leaseExpiresAt: new Date(Date.now() + 50000),
					createdAt: now,
					updatedAt: now,
					startedAt: now,
					finishedAt: null,
				},
			],
		];

		const request: WorkspaceGenerationRequest = {
			projectId: "proj-1",
			stage: "feature",
			input: {},
			retry: false,
		};

		const result = await getOrCreateGenerationOperation("user-1", request);

		expect(result.id).toBe("op-running");
		expect(result.status).toBe("running");
		// Ensure no new insert was made
		expect(dbState.queries.some((q) => q.type === "insert-values")).toBe(false);
	});

	it("prevents double execution on retry if operation is actively running with valid lease", async () => {
		const now = new Date();
		dbState.selectRows = [
			[
				{
					id: "op-active-running",
					projectId: "proj-1",
					stage: "ac",
					status: "running",
					attempt: 1,
					leaseExpiresAt: new Date(Date.now() + 45000),
					createdAt: now,
					updatedAt: now,
					startedAt: now,
					finishedAt: null,
				},
			],
		];

		const request: WorkspaceGenerationRequest = {
			projectId: "proj-1",
			stage: "ac",
			input: {},
			retry: true,
		};

		const result = await getOrCreateGenerationOperation("user-1", request);

		expect(result.id).toBe("op-active-running");
		expect(result.status).toBe("running");
	});

	it("cancels stale queued operation when explicit retry is requested", async () => {
		const now = new Date();
		dbState.selectRows = [
			// active op is queued
			[
				{
					id: "op-queued",
					projectId: "proj-1",
					stage: "task",
					status: "queued",
					attempt: 0,
					createdAt: now,
					updatedAt: now,
					startedAt: null,
					finishedAt: null,
				},
			],
		];

		dbState.insertRows = [
			{
				id: "op-fresh-queued",
				projectId: "proj-1",
				stage: "task",
				status: "queued",
				attempt: 0,
				createdAt: now,
				updatedAt: now,
			},
		];

		const request: WorkspaceGenerationRequest = {
			projectId: "proj-1",
			stage: "task",
			input: {},
			retry: true,
		};

		const result = await getOrCreateGenerationOperation("user-1", request);

		expect(result.id).toBe("op-fresh-queued");
		expect(
			dbState.queries.some(
				(q) =>
					q.type === "update-set" &&
					typeof q.values === "object" &&
					q.values !== null &&
					"status" in q.values &&
					q.values.status === "cancelled",
			),
		).toBe(true);
	});
});

describe("worker claim and fencing", () => {
	it("claims a queued operation with a fresh fencing lease token and increments attempt", async () => {
		const now = new Date();
		dbState.selectRows = [
			[
				{
					id: "op-claimable",
					userId: "user-1",
					projectId: "proj-1",
					stage: "prd",
					status: "queued",
					attempt: 0,
					maxAttempts: 3,
					input: { message: "PRD" },
					source: null,
					createdAt: now,
				},
			],
		];

		const claim = await claimNextGenerationOperation("worker-test");

		expect(claim).not.toBeNull();
		expect(claim?.operationId).toBe("op-claimable");
		expect(claim?.attempt).toBe(1);
		expect(claim?.token).toBeDefined();

		const updateQuery = dbState.queries.find((q) => q.type === "update-set");
		expect(updateQuery).toBeDefined();
		const updateValues = updateQuery?.values as
			| Record<string, unknown>
			| undefined;
		expect(updateValues?.status).toBe("running");
		expect(updateValues?.claimedBy).toBe("worker-test");
		expect(updateValues?.jobToken).toBe(claim?.token);
	});

	it("fails abandoned jobs exceeding max attempts during claim", async () => {
		const now = new Date();
		dbState.selectRows = [
			[
				{
					id: "op-exhausted",
					userId: "user-1",
					projectId: "proj-1",
					stage: "prd",
					status: "running",
					attempt: 3,
					maxAttempts: 3,
					leaseExpiresAt: new Date(Date.now() - 1000),
					createdAt: now,
				},
			],
		];

		const claim = await claimNextGenerationOperation("worker-test");

		expect(claim).toBeNull();
		const updateQuery = dbState.queries.find((q) => q.type === "update-set");
		const updateValues = updateQuery?.values as
			| Record<string, unknown>
			| undefined;
		expect(updateValues?.status).toBe("failed");
		expect(updateValues?.errorCode).toBe("MAX_ATTEMPTS_EXCEEDED");
	});
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
	});
});

describe("bounded execution lifecycle", () => {
	it("executes handler, completes operation, and records persisted artifact evidence", async () => {
		const now = new Date();
		dbState.updateRows = [[{ id: "op-1" }]];
		dbState.selectRows = [
			[
				{
					id: "op-1",
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

	it("catches executor error and marks operation as failed with classified code", async () => {
		const now = new Date();
		dbState.updateRows = [[{ id: "op-1" }]];
		dbState.selectRows = [
			[
				{
					id: "op-1",
					projectId: "proj-1",
					stage: "feature",
					status: "failed",
					attempt: 1,
					error: "AI model rate limited",
					errorCode: "MODEL_RATE_LIMIT",
					createdAt: now,
					updatedAt: now,
					startedAt: now,
					finishedAt: now,
				},
			],
		];

		const claim = {
			operationId: "op-1",
			userId: "user-1",
			projectId: "proj-1",
			stage: "feature" as const,
			token: "token-1",
			attempt: 1,
			input: {},
			signal: new AbortController().signal,
		};

		const customError = new Error("AI model rate limited") as Error & {
			code?: string;
		};
		customError.code = "MODEL_RATE_LIMIT";
		const executor = vi.fn().mockRejectedValue(customError);

		const result = await executeGenerationOperationBounded(claim, executor, {
			timeoutMs: 5000,
			heartbeatMs: 10000,
		});

		expect(result.status).toBe("failed");
		expect(result.errorCode).toBe("MODEL_RATE_LIMIT");
		expect(result.error).toBe("AI model rate limited");
	});
});

describe("crash recovery", () => {
	it("recovers stale operations: marks exhausted as failed and re-queues retriable ones", async () => {
		dbState.updateRows = [
			[{ id: "op-exhausted" }], // 1 exhausted marked failed
			[{ id: "op-retriable-1" }, { id: "op-retriable-2" }], // 2 requeued
		];

		const count = await recoverStaleGenerationOperations();

		expect(count).toBe(3);
	});
});

describe("tenant isolation and authorization", () => {
	it("lists operations scoped strictly to authorized user and project", async () => {
		const now = new Date();
		dbState.selectRows = [
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
		const selectQuery = dbState.queries.find((q) => q.type === "select-where");
		expect(selectQuery).toBeDefined();
	});

	it("returns null when accessing an operation owned by a different user", async () => {
		dbState.selectRows = [[]];

		const op = await getGenerationOperation("attacker-user", "op-foreign");

		expect(op).toBeNull();
	});
});
