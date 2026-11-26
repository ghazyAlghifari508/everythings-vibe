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

const artifactMock = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("../services/workspace-generation-artifact.server", () => ({
	readWorkspaceGenerationArtifact: artifactMock.read,
}));

import {
	attemptStartEpoch,
	isRunActive,
	observeOperation,
	queueRun,
	runDurationSeconds,
	runFromOperation,
	settleRun,
	settleRunForOperation,
} from "../services/chat-flow";
import {
	claimNextGenerationOperation,
	getOrCreateGenerationOperation,
} from "../services/durable-generation.server";
import { computeJobBillingKey } from "../services/workspace-generation-credit.server";
import type { WorkspaceGenerationRequest } from "../types/workspace-generation";

const iso = (epoch: number) => new Date(epoch).toISOString();

function operationRow(
	overrides: Partial<Record<string, unknown>> & { status: string },
) {
	const now = new Date();
	return {
		id: "op-questions-1",
		userId: "user-1",
		projectId: "proj-1",
		stage: "questions",
		attempt: 1,
		maxAttempts: 3,
		input: { prompt: "Tambah fitur pencarian", platform: "web" },
		source: null,
		baselineArtifactId: null,
		error: null,
		errorCode: null,
		createdAt: now,
		updatedAt: now,
		startedAt: null,
		finishedAt: null,
		...overrides,
	};
}

const retryRequest: WorkspaceGenerationRequest = {
	projectId: "proj-1",
	stage: "questions",
	input: { prompt: "Tambah fitur pencarian", platform: "web" },
	retry: true,
};

beforeEach(() => {
	vi.clearAllMocks();
	resetDbState();
	artifactMock.read.mockResolvedValue(null);
});

describe("attempt window on the durable operation", () => {
	it("stamps a fresh attempt start and clears the previous attempt's finish on claim", async () => {
		const previousAttemptStart = new Date(Date.now() - 60_000);
		dbState.selectRows = [
			[
				operationRow({
					status: "queued",
					attempt: 1,
					startedAt: previousAttemptStart,
					finishedAt: previousAttemptStart,
				}),
			],
		];

		const claim = await claimNextGenerationOperation("worker-test");
		expect(claim?.attempt).toBe(2);

		const updateValues = dbState.queries.find((q) => q.type === "update-set")
			?.values as Record<string, unknown> | undefined;
		// The claim opens the new attempt at claim time: the start of the attempt
		// before it can never leak into the retry's window.
		expect(updateValues?.startedAt).toBeInstanceOf(Date);
		expect((updateValues?.startedAt as Date).getTime()).toBeGreaterThan(
			previousAttemptStart.getTime(),
		);
		expect(updateValues?.finishedAt).toBeNull();
		expect(updateValues?.attempt).toBe(2);
	});

	it("re-queues the SAME operation on retry and clears its attempt window", async () => {
		dbState.selectRows = [
			[{ id: "proj-1", userId: "user-1", deletedAt: null }],
			[{ id: "proj-1" }],
			[
				operationRow({
					status: "failed",
					attempt: 1,
					startedAt: new Date(Date.now() - 43_000),
					finishedAt: new Date(),
					error: "Generasi terhenti.",
					errorCode: "PERSISTENCE_FAILED",
				}),
			],
		];
		dbState.updateRows = [
			[
				operationRow({
					status: "queued",
					attempt: 1,
					error: null,
					errorCode: null,
				}),
			],
		];

		const result = await getOrCreateGenerationOperation("user-1", retryRequest);

		// Same operation identity: one durable job, one billing key, no duplicate.
		expect(result.id).toBe("op-questions-1");
		expect(result.status).toBe("queued");
		expect(dbState.queries.some((q) => q.type === "insert-values")).toBe(false);

		const requeue = dbState.queries.find((q) => q.type === "update-set")
			?.values as Record<string, unknown> | undefined;
		expect(requeue?.status).toBe("queued");
		// A queued operation carries no attempt window at all, so the client cannot
		// inherit the failed attempt's duration on the retry.
		expect(requeue?.startedAt).toBeNull();
		expect(requeue?.finishedAt).toBeNull();
		// The attempted count stays cumulative: retries remain bounded by maxAttempts.
		expect(requeue?.attempt).toBeUndefined();
	});

	it("keeps the billing identity stable across attempts of one operation", () => {
		const first = computeJobBillingKey("proj-1", "questions", "op-questions-1");
		const second = computeJobBillingKey(
			"proj-1",
			"questions",
			"op-questions-1",
		);
		expect(first).toBe(second);
		expect(first).toBe("proj-1:questions:op-questions-1");
		// A different operation is a different charge, never the same one reused.
		expect(
			computeJobBillingKey("proj-1", "questions", "op-questions-2"),
		).not.toBe(first);
	});

	it("refuses a retry while another attempt for the project is still active", async () => {
		dbState.selectRows = [
			[{ id: "proj-1", userId: "user-1", deletedAt: null }],
			[{ id: "proj-1" }],
			[
				operationRow({
					status: "failed",
					errorCode: "QUESTION_GENERATION_FAILED",
				}),
			],
			[operationRow({ id: "op-running", status: "queued", attempt: 0 })],
		];

		await expect(
			getOrCreateGenerationOperation("user-1", retryRequest),
		).rejects.toMatchObject({ code: "GENERATION_CONFLICT" });
		// No second job may be created while the first is still queued or running.
		expect(dbState.queries.some((q) => q.type === "insert-values")).toBe(false);
		expect(dbState.queries.some((q) => q.type === "update-set")).toBe(false);
	});

	it("allows a retry after a rejected generation output and keeps it bounded", async () => {
		dbState.selectRows = [
			[{ id: "proj-1", userId: "user-1", deletedAt: null }],
			[{ id: "proj-1" }],
			[
				operationRow({
					status: "failed",
					attempt: 1,
					error: "AI tidak mengembalikan pertanyaan yang valid.",
					errorCode: "QUESTION_GENERATION_FAILED",
					startedAt: new Date(Date.now() - 44_000),
					finishedAt: new Date(),
				}),
			],
		];
		dbState.updateRows = [[operationRow({ status: "queued" })]];

		const result = await getOrCreateGenerationOperation("user-1", retryRequest);
		expect(result.status).toBe("queued");
		const requeue = dbState.queries.find((q) => q.type === "update-set")
			?.values as Record<string, unknown> | undefined;
		expect(requeue?.error).toBeNull();
		expect(requeue?.errorCode).toBeNull();
	});

	it("stops retrying once the attempt budget is exhausted", async () => {
		dbState.selectRows = [
			[{ id: "proj-1", userId: "user-1", deletedAt: null }],
			[{ id: "proj-1" }],
			[
				operationRow({
					status: "failed",
					attempt: 3,
					maxAttempts: 3,
					errorCode: "LEASE_EXPIRED",
				}),
			],
		];

		await expect(
			getOrCreateGenerationOperation("user-1", retryRequest),
		).rejects.toMatchObject({ code: "ATTEMPTS_EXHAUSTED" });
		expect(dbState.queries.some((q) => q.type === "update-set")).toBe(false);
		expect(dbState.queries.some((q) => q.type === "insert-values")).toBe(false);
	});
});

describe("frontend attempt timing", () => {
	it("reports the attempt's own elapsed window after a reconnect, not the queue wait", () => {
		const accepted = 1_000_000;
		const attemptStart = 1_004_000;
		const settled = settleRunForOperation(
			runFromOperation({
				id: "op-questions-1",
				stage: "questions",
				status: "running",
				attempt: 2,
				createdAt: iso(accepted),
				startedAt: iso(attemptStart),
			}),
			{
				id: "op-questions-1",
				stage: "questions",
				status: "failed",
				attempt: 2,
			},
			"failed",
			attemptStart + 12_000,
			"Generasi terhenti.",
		);

		expect(settled?.attempt).toBe(2);
		// 12s of real execution, not the 16s since the retry was accepted.
		expect(runDurationSeconds(settled)).toBe(12);
	});

	it("shows a remount on a queued operation as waiting, with no attempt clock", () => {
		const run = runFromOperation({
			id: "op-questions-1",
			stage: "questions",
			status: "queued",
			attempt: 1,
			createdAt: iso(1_000_000),
			startedAt: null,
		});

		expect(run.status).toBe("queued");
		expect(isRunActive(run)).toBe(true);
		expect(run.startedAt).toBeNull();
		expect(run.operationId).toBe("op-questions-1");
		expect(runDurationSeconds(run)).toBeNull();
		expect(
			attemptStartEpoch({
				status: "queued",
				createdAt: iso(1_000_000),
				startedAt: null,
			}),
		).toBeNull();
	});

	it("never restarts a completed attempt when the same operation is polled again", () => {
		const completed = settleRun(
			runFromOperation({
				id: "op-questions-1",
				stage: "questions",
				status: "running",
				attempt: 1,
				startedAt: iso(2_000),
			}),
			"done",
			5_000,
		);

		const late = observeOperation(completed, {
			id: "op-questions-1",
			stage: "questions",
			status: "running",
			attempt: 1,
			createdAt: iso(1_000),
			startedAt: iso(2_000),
		});
		expect(late).toBe(completed);
		expect(runDurationSeconds(late)).toBe(3);
	});

	it("treats a repeated snapshot of the same attempt as the same attempt", () => {
		const snapshot = {
			id: "op-questions-1",
			stage: "questions" as const,
			status: "running" as const,
			attempt: 1,
			createdAt: iso(1_000),
			startedAt: iso(2_000),
		};
		const started = observeOperation(queueRun("questions"), snapshot);
		// A second rapid retry click that returns the SAME attempt adds no second clock.
		expect(observeOperation(started, snapshot)?.startedAt).toBe(2_000);
		expect(observeOperation(started, snapshot)?.requestId).toBe(
			started?.requestId,
		);
	});
});
