import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	dbSelect: vi.fn(),
	dbUpdate: vi.fn(),
	readArtifact: vi.fn(),
	resolveSource: vi.fn(),
	verifyLease: vi.fn(),
	handleAsk: vi.fn(),
	handleFeature: vi.fn(),
	handlePrd: vi.fn(),
	handleAc: vi.fn(),
	handleTask: vi.fn(),
}));

vi.mock("@/db", () => ({
	db: { select: mocks.dbSelect, update: mocks.dbUpdate },
}));

vi.mock("../services/workspace-generation-artifact.server", () => ({
	readWorkspaceGenerationArtifact: mocks.readArtifact,
}));

vi.mock("../services/workspace-generation-source.server", () => ({
	resolveWorkspaceGenerationSource: mocks.resolveSource,
}));

vi.mock("../services/durable-generation-fence", () => ({
	verifyClaimLeaseFence: mocks.verifyLease,
}));

vi.mock("../services/workspace-generation-credit.server", () => ({
	computeJobBillingKey: (p: string, s: string, o: string) => `${p}:${s}:${o}`,
	prepareStageCreditGuard: vi.fn().mockResolvedValue(undefined),
	recoverStaleGenerationState: vi.fn().mockResolvedValue({ recovered: true }),
}));

vi.mock("@/features/greenfield/services/ask-options-route.server", () => ({
	handleAskOptionsRequest: mocks.handleAsk,
}));

vi.mock("@/features/greenfield/services/feature-generate.server", () => ({
	handleFeatureGenerateRequest: mocks.handleFeature,
}));

vi.mock("@/features/greenfield/services/prd-chat-route.server", () => ({
	handlePrdChatRequest: mocks.handlePrd,
}));

vi.mock("@/features/greenfield/services/ac-generate.server", () => ({
	handleAcGenerateRequest: mocks.handleAc,
}));

vi.mock("@/features/greenfield/services/task-generate.server", () => ({
	handleTaskGenerateRequest: mocks.handleTask,
}));

import {
	drainGenerationSseStream,
	executeWorkspaceGenerationStage,
} from "../services/workspace-generation-executor.server";
import {
	createMockDbChain,
	createSseStream,
	makeTestClaim,
} from "./workspace-generation-test-helpers";

const { selectChain, updateChain } = createMockDbChain(
	mocks.dbSelect,
	mocks.dbUpdate,
);

beforeEach(() => {
	vi.clearAllMocks();
	selectChain([]);
	updateChain();
	mocks.verifyLease.mockResolvedValue(true);
	mocks.resolveSource.mockResolvedValue({ inputRevision: "rev-1" });
});

describe("workspace generation executor: security fences & source validation", () => {
	it("aborts immediately if claim signal is already aborted", async () => {
		const controller = new AbortController();
		controller.abort();
		const claim = makeTestClaim({ signal: controller.signal });
		await expect(executeWorkspaceGenerationStage(claim)).rejects.toThrow(
			/aborted before starting/,
		);
	});

	it("rejects before invoking AI when source revision changed", async () => {
		mocks.resolveSource.mockResolvedValueOnce({ inputRevision: "rev-changed" });
		const claim = makeTestClaim({
			source: {
				codebaseId: "cb-1",
				snapshotId: "snap-1",
				inputRevision: "rev-initial",
			},
		});
		await expect(executeWorkspaceGenerationStage(claim)).rejects.toMatchObject({
			code: "SOURCE_REVISION_MISMATCH",
		});
		expect(mocks.handleFeature).not.toHaveBeenCalled();
	});

	it("beforePersist fence rejects when source revision changes during AI generation", async () => {
		mocks.resolveSource.mockResolvedValueOnce({ inputRevision: "rev-initial" });
		mocks.handleFeature.mockImplementationOnce(async (_req, ctx) => {
			mocks.resolveSource.mockResolvedValueOnce({
				inputRevision: "rev-mutated",
			});
			await ctx.beforePersist();
			return new Response(JSON.stringify({ featureTree: {} }), { status: 200 });
		});

		const claim = makeTestClaim({
			source: {
				codebaseId: "cb-1",
				snapshotId: "snap-1",
				inputRevision: "rev-initial",
			},
		});
		await expect(executeWorkspaceGenerationStage(claim)).rejects.toMatchObject({
			code: "SOURCE_REVISION_MISMATCH",
		});
	});

	it("beforePersist fence rejects when lease token expires", async () => {
		mocks.verifyLease.mockResolvedValueOnce(false);
		mocks.handleFeature.mockImplementationOnce(async (_req, ctx) => {
			await ctx.beforePersist();
			return new Response(JSON.stringify({ featureTree: {} }), { status: 200 });
		});

		const claim = makeTestClaim({ token: "tok-expired" });
		await expect(executeWorkspaceGenerationStage(claim)).rejects.toMatchObject({
			code: "LEASE_EXPIRED",
		});
	});

	it("beforePersist fence rejects when signal is aborted before save", async () => {
		const controller = new AbortController();
		mocks.handleFeature.mockImplementationOnce(async (_req, ctx) => {
			controller.abort();
			await ctx.beforePersist();
			return new Response(JSON.stringify({ featureTree: {} }), { status: 200 });
		});

		const claim = makeTestClaim({ signal: controller.signal });
		await expect(executeWorkspaceGenerationStage(claim)).rejects.toMatchObject({
			name: "AbortError",
		});
	});
});

describe("workspace generation executor: stage dispatches", () => {
	it("executes questions stage with trusted context and validates artifact", async () => {
		mocks.handleAsk.mockResolvedValueOnce(
			new Response(JSON.stringify({ questions: [] }), { status: 200 }),
		);
		mocks.readArtifact.mockResolvedValueOnce({
			artifactId: "questions:p-1:hash",
			result: { questions: [{ id: "q1", question: "Prompt?" }] },
		});

		const claim = makeTestClaim({
			operationId: "op-q",
			stage: "questions",
			input: { prompt: "Build an app", platform: "web" },
		});
		const result = await executeWorkspaceGenerationStage(claim);

		expect(mocks.handleAsk).toHaveBeenCalledTimes(1);
		const callContext = mocks.handleAsk.mock.calls[0][1];
		expect(callContext.userId).toBe("u-1");
		expect(callContext.billingKey).toBe("p-1:questions:op-q");
		expect(result.artifactId).toBe("questions:p-1:hash");
	});

	it("executes feature stage, resets status on retry, and validates featureTree", async () => {
		mocks.handleFeature.mockResolvedValueOnce(
			new Response(JSON.stringify({ featureTree: { features: [] } }), {
				status: 200,
			}),
		);
		mocks.readArtifact.mockResolvedValueOnce({
			artifactId: "feature:p-1:2026-10-25",
			result: { featureTree: { features: [] } },
		});

		const claim = makeTestClaim({
			operationId: "op-f",
			stage: "feature",
			attempt: 2,
			input: { retry: true },
		});
		const result = await executeWorkspaceGenerationStage(claim);

		expect(mocks.dbUpdate).toHaveBeenCalled();
		expect(mocks.handleFeature).toHaveBeenCalledTimes(1);
		expect(result.artifactId).toBe("feature:p-1:2026-10-25");
	});

	it("executes prd stage, drains SSE stream, and filters model private reasoning", async () => {
		const sseBody = createSseStream([
			JSON.stringify({ type: "started" }),
			JSON.stringify({ type: "thinking", text: "secret model tokens" }),
			JSON.stringify({ type: "delta", text: "# PRD" }),
			JSON.stringify({ type: "done", summaryMessage: "PRD created" }),
		]);

		mocks.handlePrd.mockResolvedValueOnce(
			new Response(sseBody, {
				status: 200,
				headers: { "Content-Type": "text/event-stream" },
			}),
		);
		mocks.readArtifact.mockResolvedValueOnce({
			artifactId: "prd-v1",
			result: { content: "# PRD" },
		});

		const events: unknown[] = [];
		const claim = makeTestClaim({
			operationId: "op-prd",
			stage: "prd",
			input: { message: "PRD please" },
		});
		const result = await executeWorkspaceGenerationStage(claim, (ev) =>
			events.push(ev),
		);

		expect(mocks.handlePrd).toHaveBeenCalledTimes(1);
		expect(result.artifactId).toBe("prd-v1");
		expect(events).toEqual([
			{ type: "started", stage: "prd", phase: "generating" },
			{ type: "activity", stage: "prd", phase: "thinking" },
			{ type: "delta", stage: "prd", phase: "generating" },
			{
				type: "done",
				stage: "prd",
				phase: "done",
				summaryMessage: "PRD created",
			},
		]);
	});

	it("executes ac and task stages with genuine SSE draining", async () => {
		for (const stage of ["ac", "task"] as const) {
			const sseBody = createSseStream([
				JSON.stringify({ type: "started" }),
				JSON.stringify({ type: "done" }),
			]);
			const mockHandler = stage === "ac" ? mocks.handleAc : mocks.handleTask;
			mockHandler.mockResolvedValueOnce(
				new Response(sseBody, {
					status: 200,
					headers: { "Content-Type": "text/event-stream" },
				}),
			);
			mocks.readArtifact.mockResolvedValueOnce({
				artifactId: `${stage}-art`,
				result: { ok: true },
			});

			const claim = makeTestClaim({ operationId: `op-${stage}`, stage });
			const result = await executeWorkspaceGenerationStage(claim);
			expect(result.artifactId).toBe(`${stage}-art`);
		}
	});

	it("throws ARTIFACT_PERSISTENCE_FAILED if artifact is missing after route success", async () => {
		mocks.handleFeature.mockResolvedValueOnce(
			new Response(JSON.stringify({ featureTree: {} }), { status: 200 }),
		);
		mocks.readArtifact.mockResolvedValueOnce(null);

		const claim = makeTestClaim({ stage: "feature" });
		await expect(executeWorkspaceGenerationStage(claim)).rejects.toMatchObject({
			code: "ARTIFACT_PERSISTENCE_FAILED",
		});
	});

	it("throws ARTIFACT_UNCHANGED using trusted backend baselineArtifactId on retry", async () => {
		mocks.handleFeature.mockResolvedValueOnce(
			new Response(JSON.stringify({ featureTree: {} }), { status: 200 }),
		);
		mocks.readArtifact.mockResolvedValueOnce({
			artifactId: "feature:p-1:v1",
			result: {},
		});

		const claim = makeTestClaim({
			stage: "feature",
			attempt: 2,
			baselineArtifactId: "feature:p-1:v1",
			input: { retry: true },
		});

		await expect(executeWorkspaceGenerationStage(claim)).rejects.toMatchObject({
			code: "ARTIFACT_UNCHANGED",
		});
	});
});

describe("SSE stream draining and abort propagation", () => {
	it("aborts SSE draining and throws AbortError when signal is triggered", async () => {
		const controller = new AbortController();
		const sseBody = createSseStream([
			JSON.stringify({ type: "started" }),
			JSON.stringify({ type: "delta", text: "chunk 1" }),
			JSON.stringify({ type: "delta", text: "chunk 2" }),
		]);

		controller.abort();
		await expect(
			drainGenerationSseStream(sseBody, "prd", controller.signal),
		).rejects.toMatchObject({ name: "AbortError" });
	});

	it("throws on mid-stream SSE error", async () => {
		const sseBody = createSseStream([
			JSON.stringify({ type: "started" }),
			JSON.stringify({ type: "error", error: "Provider quota exceeded" }),
		]);

		await expect(
			drainGenerationSseStream(sseBody, "prd", new AbortController().signal),
		).rejects.toThrow("Provider quota exceeded");
	});
});
