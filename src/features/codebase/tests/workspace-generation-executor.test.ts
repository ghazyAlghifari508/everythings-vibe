import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	dbSelect: vi.fn(),
	dbUpdate: vi.fn(),
	readArtifact: vi.fn(),
	handleAsk: vi.fn(),
	handleFeature: vi.fn(),
	handlePrd: vi.fn(),
	handleAc: vi.fn(),
	handleTask: vi.fn(),
	releaseCredit: vi.fn(),
	quarantineCredit: vi.fn(),
}));

vi.mock("@/db", () => ({
	db: {
		select: mocks.dbSelect,
		update: mocks.dbUpdate,
	},
}));

vi.mock("../services/workspace-generation-artifact.server", () => ({
	readWorkspaceGenerationArtifact: mocks.readArtifact,
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

vi.mock("@/lib/services/credit-service", () => ({
	isReleasableReservation: (state: string) =>
		["quoted", "reserved", "running"].includes(state),
	releaseCreditOperation: mocks.releaseCredit,
	quarantineCreditOperation: mocks.quarantineCredit,
}));

import {
	drainGenerationSseStream,
	executeWorkspaceGenerationStage,
	prepareStageCreditGuard,
	recoverStaleGenerationState,
} from "../services/workspace-generation-executor.server";

function createSseStream(chunks: string[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream({
		start(controller) {
			for (const chunk of chunks) {
				controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
			}
			controller.close();
		},
	});
}

function mockDbSelectResult(result: unknown[]) {
	const chain = {
		from: () => chain,
		where: () => chain,
		orderBy: () => chain,
		limit: async () => result,
	};
	mocks.dbSelect.mockReturnValue(chain);
}

function mockDbUpdateResult() {
	const chain = {
		set: () => chain,
		where: async () => [{ id: "mock" }],
	};
	mocks.dbUpdate.mockReturnValue(chain);
}

beforeEach(() => {
	vi.clearAllMocks();
	mockDbSelectResult([]);
	mockDbUpdateResult();
});

describe("workspace generation executor adapter", () => {
	it("aborts immediately if claim signal is already aborted", async () => {
		const controller = new AbortController();
		controller.abort();

		const claim = {
			operationId: "op-1",
			userId: "u-1",
			projectId: "p-1",
			stage: "questions" as const,
			token: "tok-1",
			attempt: 1,
			input: {},
			signal: controller.signal,
		};

		await expect(executeWorkspaceGenerationStage(claim)).rejects.toThrow(
			/aborted before starting/,
		);
	});

	it("executes questions stage with trusted context and validates artifact", async () => {
		mocks.handleAsk.mockResolvedValueOnce(
			new Response(JSON.stringify({ questions: [] }), { status: 200 }),
		);
		mocks.readArtifact.mockResolvedValueOnce({
			artifactId: "questions:p-1:hash",
			result: { questions: [{ id: "q1", question: "Prompt?" }] },
		});

		const claim = {
			operationId: "op-q",
			userId: "u-1",
			projectId: "p-1",
			stage: "questions" as const,
			token: "tok-1",
			attempt: 1,
			input: { prompt: "Build an app", platform: "web" },
			signal: new AbortController().signal,
		};

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

		const claim = {
			operationId: "op-f",
			userId: "u-1",
			projectId: "p-1",
			stage: "feature" as const,
			token: "tok-1",
			attempt: 2,
			input: { retry: true },
			signal: new AbortController().signal,
		};

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
		const claim = {
			operationId: "op-prd",
			userId: "u-1",
			projectId: "p-1",
			stage: "prd" as const,
			token: "tok-1",
			attempt: 1,
			input: { message: "PRD please" },
			signal: new AbortController().signal,
		};

		const result = await executeWorkspaceGenerationStage(claim, (ev) =>
			events.push(ev),
		);

		expect(mocks.handlePrd).toHaveBeenCalledTimes(1);
		expect(result.artifactId).toBe("prd-v1");
		// Verify events were emitted without raw reasoning text
		expect(events).toEqual([
			{ type: "started", stage: "prd", phase: "generating" },
			{ type: "activity", stage: "prd", phase: "thinking" },
			{ type: "delta", stage: "prd", phase: "generating" },
			{ type: "done", stage: "prd", phase: "done", summaryMessage: "PRD created" },
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

			const claim = {
				operationId: `op-${stage}`,
				userId: "u-1",
				projectId: "p-1",
				stage,
				token: "tok-1",
				attempt: 1,
				input: {},
				signal: new AbortController().signal,
			};

			const result = await executeWorkspaceGenerationStage(claim);
			expect(result.artifactId).toBe(`${stage}-art`);
		}
	});

	it("throws ARTIFACT_PERSISTENCE_FAILED if artifact is missing after route success", async () => {
		mocks.handleFeature.mockResolvedValueOnce(
			new Response(JSON.stringify({ featureTree: {} }), { status: 200 }),
		);
		mocks.readArtifact.mockResolvedValueOnce(null);

		const claim = {
			operationId: "op-missing",
			userId: "u-1",
			projectId: "p-1",
			stage: "feature" as const,
			token: "tok-1",
			attempt: 1,
			input: {},
			signal: new AbortController().signal,
		};

		await expect(executeWorkspaceGenerationStage(claim)).rejects.toMatchObject({
			code: "ARTIFACT_PERSISTENCE_FAILED",
		});
	});

	it("throws ARTIFACT_UNCHANGED if retry produces identical artifactId as baseline", async () => {
		mocks.handleFeature.mockResolvedValueOnce(
			new Response(JSON.stringify({ featureTree: {} }), { status: 200 }),
		);
		mocks.readArtifact.mockResolvedValueOnce({
			artifactId: "feature:p-1:v1",
			result: {},
		});

		const claim = {
			operationId: "op-unchanged",
			userId: "u-1",
			projectId: "p-1",
			stage: "feature" as const,
			token: "tok-1",
			attempt: 2,
			input: { retry: true, baselineArtifactId: "feature:p-1:v1" },
			signal: new AbortController().signal,
		};

		await expect(executeWorkspaceGenerationStage(claim)).rejects.toMatchObject({
			code: "ARTIFACT_UNCHANGED",
		});
	});
});

describe("credit audit and safety guards", () => {
	it("blocks execution if existing credit operation is quarantined", async () => {
		mockDbSelectResult([{ id: "credit-q", state: "quarantined" }]);

		const claim = {
			operationId: "op-guard",
			userId: "u-1",
			projectId: "p-1",
			stage: "prd" as const,
			token: "tok-1",
			attempt: 1,
			input: {},
			signal: new AbortController().signal,
		};

		await expect(prepareStageCreditGuard(claim)).rejects.toMatchObject({
			code: "CREDIT_QUARANTINED",
		});
	});

	it("releases stale running credit reservation when crashed without artifact", async () => {
		mockDbSelectResult([{ id: "credit-stale", state: "running" }]);
		mocks.readArtifact.mockResolvedValueOnce(null);

		const claim = {
			operationId: "op-clean",
			userId: "u-1",
			projectId: "p-1",
			stage: "ac" as const,
			token: "tok-1",
			attempt: 2,
			input: {},
			signal: new AbortController().signal,
		};

		await prepareStageCreditGuard(claim);
		expect(mocks.releaseCredit).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: "u-1",
				operationId: "credit-stale",
			}),
		);
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

describe("recoverStaleGenerationState", () => {
	it("recovers completed state when valid artifact was persisted before crash", async () => {
		mocks.readArtifact.mockResolvedValueOnce({
			artifactId: "art-recovered",
			result: {},
		});

		const res = await recoverStaleGenerationState("u-1", "p-1", "feature");
		expect(res.recovered).toBe(true);
		expect(res.artifactId).toBe("art-recovered");
		expect(mocks.dbUpdate).toHaveBeenCalled();
	});

	it("resets project status and releases stuck credit reservations when no artifact exists", async () => {
		mocks.readArtifact.mockResolvedValueOnce(null);
		const chain = {
			from: () => chain,
			where: () => chain,
			orderBy: async () => [{ id: "op-stuck", state: "reserved" }],
		};
		mocks.dbSelect.mockReturnValue(chain);

		const res = await recoverStaleGenerationState("u-1", "p-1", "task");
		expect(res.recovered).toBe(true);
		expect(res.reset).toBe(true);
		expect(mocks.releaseCredit).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: "u-1",
				operationId: "op-stuck",
			}),
		);
	});
});
