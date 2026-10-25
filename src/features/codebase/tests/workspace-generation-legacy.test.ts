import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	rows: [] as unknown[][],
	user: vi.fn(),
	accept: vi.fn(),
	get: vi.fn(),
}));
vi.mock("@/db", () => ({
	db: {
		select: () => {
			const query = {
				from: () => query,
				where: () => query,
				limit: async () => mocks.rows.shift() ?? [],
			};
			return query;
		},
	},
}));
vi.mock("@/lib/session", () => ({ requireUser: mocks.user }));
vi.mock("../services/workspace-generation-route.server", () => ({
	handleWorkspaceGenerationPost: mocks.accept,
}));
vi.mock("../services/durable-generation.server", () => ({
	getGenerationOperation: mocks.get,
}));

import { handleLegacyWorkspaceGeneration } from "../services/workspace-generation-legacy.server";

const request = (body: unknown) =>
	new Request("https://example.test/api/features/generate", {
		method: "POST",
		body: JSON.stringify(body),
	});
const fallback = vi.fn(async () => Response.json({ legacy: true }));
beforeEach(() => {
	vi.resetAllMocks();
	mocks.rows = [];
	mocks.user.mockResolvedValue({ id: "owner" });
	fallback.mockResolvedValue(Response.json({ legacy: true }));
});
it("preserves greenfield and handoff handlers", async () => {
	mocks.rows = [[{ projectMode: "greenfield" }]];
	expect(
		await (
			await handleLegacyWorkspaceGeneration(
				request({ projectId: "project" }),
				"feature",
				fallback,
			)
		).json(),
	).toEqual({ legacy: true });
	await handleLegacyWorkspaceGeneration(
		request({ projectId: "project", action: "get-handoff" }),
		"questions",
		fallback,
	);
	expect(fallback).toHaveBeenCalledTimes(2);
	expect(mocks.accept).not.toHaveBeenCalled();
});
it("uses durable acceptance for existing-codebase calls and returns persisted JSON", async () => {
	mocks.rows = [[{ projectMode: "existing_codebase" }]];
	mocks.accept.mockResolvedValue(
		Response.json({
			operation: {
				id: "op",
				projectId: "project",
				stage: "feature",
				status: "completed",
				result: { featureTree: { phases: [] } },
				artifactId: "artifact",
				createdAt: "2026-01-01",
				updatedAt: "2026-01-01",
			},
		}),
	);
	const response = await handleLegacyWorkspaceGeneration(
		request({ projectId: "project" }),
		"feature",
		fallback,
	);
	expect(await response.json()).toEqual({ featureTree: { phases: [] } });
	expect(fallback).not.toHaveBeenCalled();
	const acceptedRequest = mocks.accept.mock.calls[0]?.[0];
	expect(acceptedRequest).toBeInstanceOf(Request);
	if (acceptedRequest instanceof Request)
		expect(await acceptedRequest.json()).toEqual({
			projectId: "project",
			stage: "feature",
			input: {},
		});
});
it("does not run a legacy provider request after durable acceptance failure", async () => {
	mocks.rows = [[{ projectMode: "existing_codebase" }]];
	mocks.accept.mockResolvedValue(
		Response.json({ error: "Unavailable" }, { status: 503 }),
	);
	expect(
		(
			await handleLegacyWorkspaceGeneration(
				request({ projectId: "project" }),
				"feature",
				fallback,
			)
		).status,
	).toBe(503);
	expect(fallback).not.toHaveBeenCalled();
});
