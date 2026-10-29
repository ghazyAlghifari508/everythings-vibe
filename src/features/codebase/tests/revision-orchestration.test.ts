import { describe, expect, it, vi } from "vitest";
import {
	proposePrdRevision,
	proposeRevision,
} from "../services/revision-orchestration";

const request = {
	projectId: "project",
	codebaseId: "repo",
	targetArtifactKind: "prd",
	targetArtifactVersionId: "v1",
	userInstruction: "Update",
	sourceSnapshotId: "snapshot",
};
const source = {
	ok: true as const,
	content: "<!-- SECTION: Overview -->\nOriginal\n<!-- /SECTION -->",
	analysis: { projectId: "project", snapshotId: "snapshot" },
	references: [],
	upstream: { feature: null, prd: null },
	dependencies: { ac: null, tasks: [] },
	impact: {},
};

describe("revision orchestration", () => {
	it("does not call the provider for invalid or unauthorized source", async () => {
		const generate = vi.fn();
		const resolve = vi
			.fn()
			.mockResolvedValue({ ok: false, code: "PROJECT_NOT_FOUND" });
		expect(await proposePrdRevision("u", request, resolve, generate)).toEqual({
			kind: "source_error",
			code: "PROJECT_NOT_FOUND",
		});
		expect(generate).not.toHaveBeenCalled();
	});
	it("only generates a PRD proposal and retains the source for review", async () => {
		const resolve = vi.fn().mockResolvedValue(source);
		const generate = vi.fn().mockResolvedValue({
			text: JSON.stringify({
				kind: "patch",
				patch: ":::UPDATE_SECTION[Overview]:::\nUpdated\n:::END_UPDATE:::",
			}),
			finishReason: "stop",
		});
		expect(
			await proposePrdRevision("u", request, resolve, generate),
		).toMatchObject({
			kind: "proposal",
			base: source.content,
			content: expect.stringContaining("Updated"),
		});
		expect(generate).toHaveBeenCalledOnce();
	});
	it("rejects a proposal when its source becomes stale during generation", async () => {
		const resolve = vi
			.fn()
			.mockResolvedValueOnce(source)
			.mockResolvedValueOnce({ ok: false, code: "VERSION_CONFLICT" });
		const generate = vi.fn().mockResolvedValue({
			text: JSON.stringify({
				kind: "patch",
				patch: ":::UPDATE_SECTION[Overview]:::\nUpdated\n:::END_UPDATE:::",
			}),
			finishReason: "stop",
		});
		expect(await proposePrdRevision("u", request, resolve, generate)).toEqual({
			kind: "source_error",
			code: "VERSION_CONFLICT",
		});
	});
	it("rejects a proposal if dependencies change during generation", async () => {
		const resolve = vi
			.fn()
			.mockResolvedValueOnce(source)
			.mockResolvedValueOnce({
				...source,
				dependencies: { ac: { id: "new", content: "AC" }, tasks: [] },
			});
		const generate = vi.fn().mockResolvedValue({
			text: JSON.stringify({
				kind: "patch",
				patch: ":::UPDATE_SECTION[Overview]:::\nUpdated\n:::END_UPDATE:::",
			}),
			finishReason: "stop",
		});
		expect(await proposePrdRevision("u", request, resolve, generate)).toEqual({
			kind: "source_error",
			code: "SOURCE_CHANGED",
		});
	});
	it("does not report a conflict based on a source that changed during generation", async () => {
		const resolve = vi
			.fn()
			.mockResolvedValueOnce(source)
			.mockResolvedValueOnce({ ok: false, code: "VERSION_CONFLICT" });
		const generate = vi.fn().mockResolvedValue({
			text: JSON.stringify({ kind: "conflict", explanation: "Conflict" }),
			finishReason: "stop",
		});
		expect(await proposePrdRevision("u", request, resolve, generate)).toEqual({
			kind: "source_error",
			code: "VERSION_CONFLICT",
		});
	});
	it("generates an AC revision proposal and computes downstream impact on Tasks", async () => {
		const acSource = {
			...source,
			content: "### Kriteria 1\nGIVEN state WHEN action THEN result",
			impact: { tasks: "NEEDS_REVIEW" as const },
		};
		const resolve = vi.fn().mockResolvedValue(acSource);
		const generate = vi.fn().mockResolvedValue({
			text: "### Kriteria 1\nGIVEN state WHEN action THEN result\n### Kriteria 2\nGIVEN url WHEN filter THEN saved",
			finishReason: "stop",
		});
		const result = await proposeRevision(
			"u",
			{ ...request, targetArtifactKind: "ac" },
			resolve,
			generate,
		);
		expect(result).toMatchObject({
			kind: "proposal",
			impact: { tasks: "NEEDS_REVIEW" },
			content: expect.stringContaining("Kriteria 2"),
		});
	});

	it("generates a Feature Specification revision proposal and validates against schema", async () => {
		const oldTree = {
			productName: "App",
			createdAt: "2026-01-01T00:00:00Z",
			features: [
				{
					id: "feat-1",
					name: "Old Name",
					phase: 1,
					description: "Desc",
					subfeatures: [
						{ id: "subfeat-1.1", name: "Sub 1", description: "Desc" },
						{ id: "subfeat-1.2", name: "Sub 2", description: "Desc" },
					],
				},
			],
		};
		const featSource = {
			...source,
			content: JSON.stringify(oldTree),
			impact: {
				prd: "NEEDS_REVIEW" as const,
				ac: "NEEDS_REVIEW" as const,
				tasks: "NEEDS_REVIEW" as const,
			},
		};
		const resolve = vi.fn().mockResolvedValue(featSource);
		const newTree = {
			...oldTree,
			features: [{ ...oldTree.features[0], name: "New Feature Name" }],
		};
		const generate = vi.fn().mockResolvedValue({
			text: JSON.stringify(newTree),
			finishReason: "stop",
		});
		const result = await proposeRevision(
			"u",
			{ ...request, targetArtifactKind: "feature" },
			resolve,
			generate,
		);
		expect(result).toMatchObject({
			kind: "proposal",
			impact: {
				prd: "NEEDS_REVIEW",
				ac: "NEEDS_REVIEW",
				tasks: "NEEDS_REVIEW",
			},
			content: expect.stringContaining("New Feature Name"),
		});
	});

	it("generates a Task breakdown revision proposal with reconciliation protecting Kanban", async () => {
		const existingTasks = [
			{
				id: "t1",
				title: "Active Work",
				description: "",
				status: "in_progress",
				subtasks: [],
				order: 0,
			},
		];
		const taskSource = {
			...source,
			content: JSON.stringify({
				features: [
					{
						name: "Feat",
						tasks: [
							{
								name: "Active Work",
								priority: "medium",
								covers: [],
								surfaces: [],
								subtasks: [],
							},
						],
					},
				],
			}),
			dependencies: { ac: null, tasks: existingTasks },
			impact: {},
		};
		const resolve = vi.fn().mockResolvedValue(taskSource);
		const proposedTree = {
			features: [
				{
					name: "Feat",
					tasks: [
						{
							name: "Active Work",
							description: "Updated notes",
							priority: "high" as const,
							covers: ["AC-1"],
							surfaces: [],
							subtasks: [],
						},
						{
							name: "New Task",
							description: "Brand new",
							priority: "medium" as const,
							covers: ["AC-2"],
							surfaces: [],
							subtasks: [],
						},
					],
				},
			],
		};
		const generate = vi.fn().mockResolvedValue({
			text: JSON.stringify(proposedTree),
			finishReason: "stop",
		});
		const result = await proposeRevision(
			"u",
			{ ...request, targetArtifactKind: "tasks" },
			resolve,
			generate,
		);
		expect(result).toMatchObject({
			kind: "proposal",
			reconciliation: expect.arrayContaining([
				expect.objectContaining({ name: "Active Work", action: "modified" }),
				expect.objectContaining({ name: "New Task", action: "added" }),
			]),
		});
	});

	it("does not generate for an invalid target", async () => {
		const generate = vi.fn();
		const resolve = vi.fn().mockResolvedValue(source);
		expect(
			await proposeRevision(
				"u",
				{ ...request, targetArtifactKind: "invalid" },
				resolve,
				generate,
			),
		).toEqual({ kind: "source_error", code: "INVALID_REQUEST" });
		expect(generate).not.toHaveBeenCalled();
	});
});
