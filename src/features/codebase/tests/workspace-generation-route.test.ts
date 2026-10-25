import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	requireUser: vi.fn(),
	source: vi.fn(),
	enqueue: vi.fn(),
	list: vi.fn(),
	get: vi.fn(),
	existing: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("../services/workspace-generation-source.server", () => ({
	resolveWorkspaceGenerationSource: mocks.source,
}));
vi.mock("../services/durable-generation.server", async (importOriginal) => ({
	DurableGenerationError: (
		await importOriginal<
			typeof import("../services/durable-generation.server")
		>()
	).DurableGenerationError,
	getOrCreateGenerationOperation: mocks.enqueue,
	listGenerationOperations: mocks.list,
	getGenerationOperation: mocks.get,
	getExistingGenerationOperation: mocks.existing,
}));

import {
	handleWorkspaceGenerationGet,
	handleWorkspaceGenerationPost,
} from "../services/workspace-generation-route.server";

const operation = {
	id: "operation",
	projectId: "project",
	stage: "prd",
	status: "queued",
	result: null,
	error: null,
	createdAt: new Date(),
	updatedAt: new Date(),
};
const post = (body: unknown) =>
	new Request("https://example.test/api/codebase/generation", {
		method: "POST",
		body: JSON.stringify(body),
		headers: { "Content-Type": "application/json" },
	});
beforeEach(() => {
	vi.resetAllMocks();
	mocks.requireUser.mockResolvedValue({ id: "owner" });
	mocks.source.mockResolvedValue({
		codebaseId: "codebase",
		snapshotId: "snapshot",
		inputRevision: "revision",
	});
	mocks.enqueue.mockResolvedValue(operation);
	mocks.list.mockResolvedValue([operation]);
	mocks.get.mockResolvedValue(operation);
});
describe("durable generation API", () => {
	it("reconciles ambiguous acceptance without enqueuing another paid action", async () => {
		mocks.existing.mockResolvedValue(null);
		const response = await handleWorkspaceGenerationPost(
			new Request("https://example.test/api/codebase/generation?reconcile=1", {
				method: "POST",
				body: JSON.stringify({
					projectId: "project",
					stage: "feature",
					input: {},
				}),
			}),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ operation: null });
		expect(mocks.existing).toHaveBeenCalled();
		expect(mocks.enqueue).not.toHaveBeenCalled();
	});
	it("requires a session for both reads and writes", async () => {
		mocks.requireUser.mockRejectedValue(new Error("Unauthorized"));
		expect(
			(
				await handleWorkspaceGenerationGet(
					new Request(
						"https://example.test/api/codebase/generation?projectId=project",
					),
				)
			).status,
		).toBe(401);
		expect((await handleWorkspaceGenerationPost(post({}))).status).toBe(401);
		expect(mocks.enqueue).not.toHaveBeenCalled();
	});
	it("rejects malformed payload before accepting work", async () => {
		expect(
			(
				await handleWorkspaceGenerationPost(
					post({
						projectId: "project",
						stage: "prd",
						input: { mode: "revise" },
					}),
				)
			).status,
		).toBe(400);
		expect(mocks.enqueue).not.toHaveBeenCalled();
	});
	it("does not enqueue unknown or unowned projects", async () => {
		mocks.source.mockResolvedValue(null);
		expect(
			(
				await handleWorkspaceGenerationPost(
					post({ projectId: "project", stage: "feature", input: {} }),
				)
			).status,
		).toBe(404);
		expect(mocks.enqueue).not.toHaveBeenCalled();
	});
	it("accepts a server-owned identity without persisting session headers", async () => {
		const response = await handleWorkspaceGenerationPost(
			post({ projectId: "project", stage: "feature", input: {} }),
		);
		expect(response.status).toBe(202);
		expect(mocks.enqueue).toHaveBeenCalledWith(
			"owner",
			{ projectId: "project", stage: "feature", input: {}, retry: false },
			{
				codebaseId: "codebase",
				snapshotId: "snapshot",
				inputRevision: "revision",
			},
		);
		const body = await response.json();
		expect(body.operation.id).toBe("operation");
	});
	it("reads only through tenant-scoped operation services and disables caching", async () => {
		const response = await handleWorkspaceGenerationGet(
			new Request(
				"https://example.test/api/codebase/generation?projectId=project",
			),
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(mocks.list).toHaveBeenCalledWith("owner", "project");
	});
	it("rejects an operation belonging to another project even when the caller owns both", async () => {
		mocks.get.mockResolvedValue({ ...operation, projectId: "other-project" });
		const response = await handleWorkspaceGenerationGet(
			new Request(
				"https://example.test/api/codebase/generation?projectId=project&operationId=operation",
			),
		);
		expect(response.status).toBe(404);
	});
	it("returns unavailable rather than claiming acceptance after storage failure", async () => {
		mocks.enqueue.mockRejectedValue(new Error("Storage unavailable"));
		const response = await handleWorkspaceGenerationPost(
			post({ projectId: "project", stage: "feature", input: {} }),
		);
		expect(response.status).toBe(503);
		expect(await response.json()).not.toHaveProperty("operation");
	});
	it("does not leak internal persisted input or leases in operation DTOs", async () => {
		mocks.list.mockResolvedValue([
			{
				...operation,
				userId: "owner",
				input: { source: "private" },
				jobToken: "secret-lease",
			},
		]);
		const response = await handleWorkspaceGenerationGet(
			new Request(
				"https://example.test/api/codebase/generation?projectId=project",
			),
		);
		const body = await response.json();
		expect(body.operations[0]).not.toHaveProperty("input");
		expect(body.operations[0]).not.toHaveProperty("jobToken");
		expect(body.operations[0]).not.toHaveProperty("userId");
	});
});
