import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rows: [] as unknown[][], context: vi.fn() }));
vi.mock("@/db", () => ({
	db: {
		select: () => {
			const chain = {
				from: () => chain,
				innerJoin: () => chain,
				where: () => chain,
				orderBy: () => chain,
				limit: async () => state.rows.shift() ?? [],
			};
			return chain;
		},
	},
}));
vi.mock("../services/generation-context", () => ({
	requireProjectGenerationContext: state.context,
}));

import { resolveWorkspaceGenerationSource } from "../services/workspace-generation-source.server";

const project = {
	id: "project",
	name: "Scope",
	description: "Feature",
	language: "id",
	codebaseId: "codebase",
	projectMode: "existing_codebase",
	featureTree: null,
};
beforeEach(() => {
	state.rows = [];
	state.context.mockReset();
	state.context.mockResolvedValue({
		context: { snapshotId: "snapshot", analysisId: "analysis" },
	});
});
it("does not resolve private context for inaccessible projects", async () => {
	state.rows = [[]];
	expect(
		await resolveWorkspaceGenerationSource("owner", "project", "prd"),
	).toBeNull();
	expect(state.context).not.toHaveBeenCalled();
});
it("does not accept greenfield projects into the durable codebase worker", async () => {
	state.rows = [[{ ...project, projectMode: "greenfield" }]];
	expect(
		await resolveWorkspaceGenerationSource("owner", "project", "prd"),
	).toBeNull();
});
it("fails closed on unavailable snapshot context", async () => {
	state.rows = [[project]];
	state.context.mockResolvedValue({
		code: "CONTEXT_UNAVAILABLE",
		status: 409,
		error: "Unavailable",
	});
	expect(
		await resolveWorkspaceGenerationSource("owner", "project", "prd"),
	).toEqual({ code: "CONTEXT_UNAVAILABLE", status: 409, error: "Unavailable" });
});
it("binds server-owned snapshot and upstream version identities", async () => {
	state.rows = [
		[project],
		[{ answers: [], state: null, compiledPrompt: null }],
		[{ id: "prd-v1" }],
		[{ id: "ac-v1" }],
	];
	const original = await resolveWorkspaceGenerationSource(
		"owner",
		"project",
		"task",
	);
	state.rows = [
		[project],
		[{ answers: [], state: null, compiledPrompt: null }],
		[{ id: "prd-v1" }],
		[{ id: "ac-v2" }],
	];
	const revised = await resolveWorkspaceGenerationSource(
		"owner",
		"project",
		"task",
	);
	expect(original).toMatchObject({
		codebaseId: "codebase",
		snapshotId: "snapshot",
		analysisId: "analysis",
	});
	expect(
		original && "inputRevision" in original ? original.inputRevision : null,
	).not.toEqual(
		revised && "inputRevision" in revised ? revised.inputRevision : null,
	);
});
