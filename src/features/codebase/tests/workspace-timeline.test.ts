import { describe, expect, it } from "vitest";
import { resolveWorkspaceHistoryView } from "../services/workspace-hydration";
import {
	mergeWorkspaceEvents,
	restoreWorkspaceEvents,
} from "../services/workspace-timeline";
import { buildWorkspaceTimeline } from "../services/workspace-timeline-presentation";
import type {
	WorkspaceEvent,
	WorkspaceTimelineSource,
} from "../types/workspace-timeline";

const scope = { codebaseId: "repo", projectId: "plan-a" };
const at = (n: number) => new Date(1_800_000_000_000 + n * 1000).toISOString();
function event(
	id: string,
	n: number,
	fields: Partial<WorkspaceEvent> = {},
): WorkspaceEvent {
	return {
		...scope,
		id,
		type: "user_message",
		stage: "questions",
		status: "completed",
		content: id,
		createdAt: at(n),
		updatedAt: at(n),
		...fields,
	};
}
function source(
	fields: Partial<WorkspaceTimelineSource> = {},
): WorkspaceTimelineSource {
	return {
		...scope,
		createdAt: at(0),
		handoff: null,
		operations: [],
		artifacts: [],
		revisions: [],
		...fields,
	};
}

describe("workspace timeline restoration", () => {
	it("orders equal-time events consistently and never buckets messages above older stages", () => {
		const rows = [
			event("assistant-ac", 5, { type: "assistant_message", stage: "ac" }),
			event("question-set", 1, { type: "question_set" }),
			event("initial", 0),
			event("prd", 3, { type: "artifact_created", stage: "prd" }),
		];
		expect(mergeWorkspaceEvents(scope, rows).map((row) => row.id)).toEqual([
			"initial",
			"question-set",
			"prd",
			"assistant-ac",
		]);
		expect(
			mergeWorkspaceEvents(scope, [event("z", 0), event("a", 0)]).map(
				(row) => row.id,
			),
		).toEqual(["a", "z"]);
	});

	it("restores only the selected repository and feature and deduplicates stable identities", () => {
		const rows = [
			event("keep", 0),
			event("foreign-plan", 1, { projectId: "plan-b" }),
			event("foreign-repo", 1, { codebaseId: "other" }),
		];
		expect(
			mergeWorkspaceEvents(scope, rows, rows).map((row) => row.id),
		).toEqual(["keep"]);
	});

	it("keeps a completed lifecycle when a delayed older running snapshot arrives", () => {
		const running = event("op", 1, {
			type: "generation",
			stage: "ac",
			status: "running",
		});
		const done = {
			...running,
			status: "completed" as const,
			artifactId: "ac-v1",
			updatedAt: at(3),
		};
		expect(mergeWorkspaceEvents(scope, [done], [running])).toEqual([done]);
	});

	it("preserves the stored initial prompt even when there are no questions", () => {
		const input = source({
			handoff: {
				projectId: scope.projectId,
				answers: [],
				state: { prompt: "User-owned prompt", questions: [] },
			},
		});
		const first = restoreWorkspaceEvents(input, []);
		const again = restoreWorkspaceEvents(input, first);
		expect(again).toEqual(first);
		expect(
			again
				.filter((row) => row.type === "user_message")
				.map((row) => row.content),
		).toEqual(["User-owned prompt"]);
	});

	it("never fabricates assistant replies during legacy artifact restoration", () => {
		const rows = restoreWorkspaceEvents(
			source({
				artifacts: [
					{ id: "prd-v1", stage: "prd", createdAt: at(3) },
					{ id: "task-v1", stage: "task", createdAt: at(5) },
				],
			}),
			[],
		);
		expect(rows.some((row) => row.type === "assistant_message")).toBe(false);
		expect(rows.map((row) => row.type)).toEqual([
			"artifact_created",
			"artifact_created",
			"handoff_ready",
		]);
	});

	it("restores stages, operation references, and handoff without duplicating completion events", () => {
		const input = source({
			operations: [
				{
					id: "op-ac",
					projectId: scope.projectId,
					stage: "ac",
					status: "completed",
					artifactId: "ac-v1",
					createdAt: at(3),
					updatedAt: at(4),
					finishedAt: at(4),
				},
			],
			artifacts: [{ id: "ac-v1", stage: "ac", createdAt: at(4) }],
		});
		const rows = restoreWorkspaceEvents(input, []);
		expect(rows.filter((row) => row.type === "artifact_created")).toHaveLength(
			1,
		);
		expect(rows.find((row) => row.type === "generation")).toMatchObject({
			operationId: "op-ac",
			stage: "ac",
			status: "completed",
			artifactId: "ac-v1",
		});
		expect(restoreWorkspaceEvents(input, rows)).toEqual(rows);
	});

	it("keeps late completion in its original feature when restoring another feature", () => {
		const rows = restoreWorkspaceEvents(
			source({
				operations: [
					{
						id: "late",
						projectId: "plan-b",
						stage: "ac",
						status: "completed",
						createdAt: at(0),
						updatedAt: at(2),
						artifactId: "b-ac",
					},
				],
			}),
			[],
		);
		expect(rows).toEqual([]);
	});
});

it("places stage messages, live runs and artifacts at their event positions", () => {
	const entries = buildWorkspaceTimeline({
		events: [
			event("initial", 0),
			event("questions", 1, { type: "question_set" }),
			event("prd", 2, { type: "artifact_created", stage: "prd" }),
			event("ac-run", 3, {
				type: "generation",
				stage: "ac",
				operationId: "op-ac",
				status: "running",
			}),
			event("reply", 4, { type: "assistant_message", stage: "ac" }),
		],
		artifacts: [
			{
				id: "prd-plan-a",
				fileName: "prd.md",
				fileSizeBytes: 12,
				badge: "PRD",
				description: "",
			},
		],
		hasQuestions: true,
		hasHandoff: false,
		run: {
			requestId: "request-ac",
			operationId: "op-ac",
			attempt: 1,
			stage: "ac",
			status: "running",
			startedAt: 1800000003000,
			finishedAt: null,
			error: null,
		},
	});
	expect(entries.map((entry) => [entry.kind, entry.stage])).toEqual([
		["message", "questions"],
		["questions", "questions"],
		["artifact", "prd"],
		["operation", "ac"],
		["message", "ac"],
	]);
});

it("renders existing artifacts once even when duplicate lifecycle references are restored", () => {
	const artifact = {
		id: "tasks-plan-a",
		fileName: "task.md",
		fileSizeBytes: null,
		badge: "TASK",
		description: "",
	};
	const entries = buildWorkspaceTimeline({
		events: [
			event("task-one", 1, { type: "artifact_created", stage: "task" }),
			event("task-two", 2, { type: "artifact_created", stage: "task" }),
			event("handoff", 2, { type: "handoff_ready", stage: "handoff" }),
			event("revise", 3, { type: "revision_requested", stage: "ac" }),
		],
		artifacts: [artifact],
		hasQuestions: false,
		hasHandoff: true,
		run: null,
	});
	expect(entries.map((entry) => entry.kind)).toEqual([
		"artifact",
		"handoff",
		"message",
	]);
});

it("uses operation completion time over ambiguous legacy artifact timestamps", () => {
	const rows = restoreWorkspaceEvents(
		source({
			operations: [
				{
					id: "prd-op",
					projectId: scope.projectId,
					stage: "prd",
					status: "completed",
					artifactId: "prd-v1",
					createdAt: at(2),
					updatedAt: at(3),
					finishedAt: at(3),
				},
				{
					id: "ac-op",
					projectId: scope.projectId,
					stage: "ac",
					status: "running",
					createdAt: at(4),
					updatedAt: at(4),
				},
			],
			artifacts: [{ id: "prd-v1", stage: "prd", createdAt: at(20000) }],
		}),
		[event("initial", 0)],
	);
	expect(rows.map((row) => row.id)).toEqual([
		"initial",
		"1:generation:prd-op",
		"3:artifact:prd-v1",
		"1:generation:ac-op",
	]);
});

it("does not turn unknown history into an empty workspace or hide readable documents", () => {
	expect(resolveWorkspaceHistoryView({ kind: "pristine" }, "pending")).toEqual({
		kind: "loading",
	});
	expect(resolveWorkspaceHistoryView({ kind: "pristine" }, "failed")).toEqual({
		kind: "plan_unavailable",
		reason: "load_failed",
	});
	expect(
		resolveWorkspaceHistoryView(
			{ kind: "active", failedArtifacts: ["ac"] },
			"failed",
		),
	).toEqual({ kind: "active", failedArtifacts: ["ac"] });
});

it("prefers a terminal lifecycle over an equal-time pending delivery", () => {
	const running = event("op", 0, { type: "generation", status: "running" });
	const completed = { ...running, status: "completed" as const };
	expect(
		mergeWorkspaceEvents(scope, [running], [completed], [running]),
	).toEqual([completed]);
});
