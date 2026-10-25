import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rows: [] as unknown[][] }));
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
vi.mock("@/features/greenfield/services/task-service", () => ({
	getTaskTree: vi.fn(async () => ({
		features: [{ name: "Feature", tasks: [{ name: "Task" }] }],
	})),
}));

import { readWorkspaceGenerationArtifact } from "../services/workspace-generation-artifact.server";

beforeEach(() => {
	state.rows = [];
});

describe("persisted workspace generation evidence", () => {
	it("rejects an inaccessible or deleted project before reading artifacts", async () => {
		state.rows = [[]];
		expect(
			await readWorkspaceGenerationArtifact("owner", "project", "prd"),
		).toBeNull();
	});
	it.each([
		"prd",
		"ac",
	] as const)("requires nonempty persisted %s content", async (stage) => {
		state.rows = [[{ id: "project" }], [{ id: "version", content: "  " }]];
		expect(
			await readWorkspaceGenerationArtifact("owner", "project", stage),
		).toBeNull();
		state.rows = [
			[{ id: "project" }],
			[{ id: "version", content: "# Document" }],
		];
		expect(
			await readWorkspaceGenerationArtifact("owner", "project", stage),
		).toEqual({ artifactId: "version", result: { content: "# Document" } });
	});
	it("does not mistake a generating flag for a feature artifact", async () => {
		state.rows = [
			[{ id: "project", featureTree: null, featuresStatus: "generating" }],
		];
		expect(
			await readWorkspaceGenerationArtifact("owner", "project", "feature"),
		).toBeNull();
	});
	it("does not accept empty or malformed question sets", async () => {
		state.rows = [
			[{ id: "project" }],
			[{ id: "handoff", state: { questions: [] } }],
		];
		expect(
			await readWorkspaceGenerationArtifact("owner", "project", "questions"),
		).toBeNull();
	});
	it("recovers a validated persisted question set without another model call", async () => {
		const questions = [1, 2, 3].map((id) => ({
			id: `q${id}`,
			question: `Question ${id}`,
			type: "text",
		}));
		state.rows = [
			[{ id: "project" }],
			[{ id: "handoff", state: { questions } }],
		];
		const artifact = await readWorkspaceGenerationArtifact(
			"owner",
			"project",
			"questions",
		);
		expect(artifact?.result).toEqual({ questions });
		expect(artifact?.artifactId).toMatch(/^questions:handoff:[a-f0-9]{64}$/);
		state.rows = [
			[{ id: "project" }],
			[
				{
					id: "handoff",
					state: {
						questions: questions.map((question) => ({
							...question,
							question: `${question.question} changed`,
						})),
					},
				},
			],
		];
		const changed = await readWorkspaceGenerationArtifact(
			"owner",
			"project",
			"questions",
		);
		expect(changed?.artifactId).not.toBe(artifact?.artifactId);
	});
	it("uses an actual task row identity rather than a process-local random artifact id", async () => {
		state.rows = [
			[{ id: "project", taskStatus: "completed" }],
			[{ id: "task-row" }],
		];
		const result = await readWorkspaceGenerationArtifact(
			"owner",
			"project",
			"task",
		);
		expect(result?.artifactId).toBe("task-row");
		expect(result?.result.taskTree).toEqual({
			features: [{ name: "Feature", tasks: [{ name: "Task" }] }],
		});
	});
});
