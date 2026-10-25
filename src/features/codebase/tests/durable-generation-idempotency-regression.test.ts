import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	rows: [] as unknown[][],
	update: vi.fn(),
	insert: vi.fn(),
}));
vi.mock("@/db", () => ({
	db: {
		transaction: async (run: (tx: unknown) => Promise<unknown>) => {
			const module = await import("@/db");
			return run(module.db);
		},
		select: () => {
			const query = {
				from: () => query,
				where: () => query,
				orderBy: () => query,
				for: () => query,
				limit: async () => state.rows.shift() ?? [],
			};
			return query;
		},
		update: state.update,
		insert: state.insert,
	},
}));
vi.mock("../services/durable-generation-tenant", () => ({
	assertProjectTenantAccess: vi.fn(async () => ({})),
	checkProjectTenantAccess: vi.fn(async () => true),
}));
vi.mock("../services/workspace-generation-artifact.server", () => ({
	readWorkspaceGenerationArtifact: vi.fn(async () => ({
		artifactId: "persisted",
		result: { content: "document" },
	})),
}));

import { getOrCreateGenerationOperation } from "../services/durable-generation.server";

beforeEach(() => {
	vi.clearAllMocks();
	state.rows = [];
});
it("an identical explicit retry after success never requeues, reserves credits, or invokes a provider", async () => {
	state.rows = [
		[{ id: "project" }],
		[
			{
				id: "operation",
				projectId: "project",
				userId: "owner",
				stage: "prd",
				status: "completed",
				attempt: 1,
				maxAttempts: 3,
				artifactId: "persisted",
				result: { content: "document" },
				createdAt: new Date(),
				updatedAt: new Date(),
				startedAt: new Date(),
				finishedAt: new Date(),
				error: null,
				errorCode: null,
			},
		],
	];
	const result = await getOrCreateGenerationOperation(
		"owner",
		{
			projectId: "project",
			stage: "prd",
			input: { message: "Generate", mode: "generate" },
			retry: true,
		},
		{
			codebaseId: "codebase",
			snapshotId: "snapshot",
			inputRevision: "revision",
		},
	);
	expect(result.status).toBe("completed");
	expect(result.artifactId).toBe("persisted");
	expect(state.update).not.toHaveBeenCalled();
	expect(state.insert).not.toHaveBeenCalled();
});
