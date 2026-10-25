import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CodebaseGenerationOperationRow } from "@/db/codebase-generation-schema";
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

const artifactMock = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("../services/workspace-generation-artifact.server", () => ({
	readWorkspaceGenerationArtifact: artifactMock.read,
}));

import {
	claimNextGenerationOperation,
	computeGenerationIdentityHash,
	getOrCreateGenerationOperation,
	toWorkspaceGenerationOperation,
} from "../services/durable-generation.server";
import type { WorkspaceGenerationRequest } from "../types/workspace-generation";

beforeEach(() => {
	vi.clearAllMocks();
	resetDbState();
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
			baselineArtifactId: null,
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
			baselineArtifactId: null,
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
			[{ id: "proj-1", userId: "user-1", deletedAt: null }],
			[{ id: "proj-1" }],
			[],
			[],
		];
		dbState.insertRows = [
			{
				id: "op-persisted",
				projectId: "proj-1",
				stage: "prd",
				status: "completed",
				attempt: 0,
				result: { content: "# PRD Content" },
				artifactId: "prd-v1",
				createdAt: now,
				updatedAt: now,
				startedAt: null,
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
			[{ id: "proj-1", userId: "user-1", deletedAt: null }],
			[{ id: "proj-1" }],
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
		expect(dbState.queries.some((q) => q.type === "insert-values")).toBe(false);
	});

	it("prevents double execution on retry if operation is actively running with valid lease", async () => {
		const now = new Date();
		dbState.selectRows = [
			[{ id: "proj-1", userId: "user-1", deletedAt: null }],
			[{ id: "proj-1" }],
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

	it("joins existing queued operation when explicit retry is requested without cancelling", async () => {
		const now = new Date();
		dbState.selectRows = [
			[{ id: "proj-1", userId: "user-1", deletedAt: null }],
			[{ id: "proj-1" }],
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
		const request: WorkspaceGenerationRequest = {
			projectId: "proj-1",
			stage: "task",
			input: {},
			retry: true,
		};
		const result = await getOrCreateGenerationOperation("user-1", request);
		expect(result.id).toBe("op-queued");
		expect(result.status).toBe("queued");
		expect(
			dbState.queries.some(
				(q) =>
					q.type === "update-set" &&
					typeof q.values === "object" &&
					q.values !== null &&
					"status" in q.values &&
					q.values.status === "cancelled",
			),
		).toBe(false);
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
					baselineArtifactId: null,
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
					status: "queued",
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
