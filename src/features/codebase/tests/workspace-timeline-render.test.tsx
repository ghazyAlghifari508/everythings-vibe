// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { CodebaseChatWorkspace } from "../components/chat/codebase-chat-workspace";
import type { WorkspaceEvent } from "../types/workspace-timeline";

afterEach(cleanup);
const scope = { codebaseId: "repo", projectId: "plan" };
function event(
	id: string,
	type: WorkspaceEvent["type"],
	stage: WorkspaceEvent["stage"],
	n: number,
): WorkspaceEvent {
	const at = new Date(n * 1000).toISOString();
	return {
		...scope,
		id,
		type,
		stage,
		status: "completed",
		createdAt: at,
		updatedAt: at,
		content: id,
	};
}
it("renders persisted message-stage associations in chronology, including after handoff", () => {
	const rows = [
		event("prompt", "user_message", "questions", 0),
		{
			...event("questions", "question_set", "questions", 1),
			questions: [{ id: "q", question: "Boundary?", type: "text" as const }],
		},
		event("prd", "artifact_created", "prd", 2),
		event("ac", "artifact_created", "ac", 3),
		event("assistant", "assistant_message", "ac", 4),
		event("task", "artifact_created", "task", 5),
		event("handoff", "handoff_ready", "handoff", 5),
		event("revision", "revision_requested", "ac", 6),
	];
	const artifact = (id: string) => ({
		id,
		fileName: `${id}.md`,
		fileSizeBytes: 1,
		badge: "Document",
		description: "Stored",
	});
	const props = {
		...scope,
		featureName: "Plan",
		messages: [],
		questions: [
			{ id: "q", title: "Boundary?", type: "text" as const, options: [] },
		],
		answers: { q: "Private" },
		artifacts: [
			artifact("prd-plan"),
			artifact("ac-plan"),
			artifact("tasks-plan"),
		],
		timelineEvents: rows,
		stage: "handoff" as const,
		projectIdForHandoff: "plan",
	};
	const { container, unmount } = render(<CodebaseChatWorkspace {...props} />);
	const associations = () =>
		[...container.querySelectorAll("[data-workspace-event]")].map((node) => [
			node.getAttribute("data-workspace-event"),
			node.getAttribute("data-workspace-stage"),
		]);
	expect(associations()).toEqual(rows.map((row) => [row.id, row.stage]));
	unmount();
	const reopened = render(<CodebaseChatWorkspace {...props} />);
	expect(
		[...reopened.container.querySelectorAll("[data-workspace-event]")].map(
			(node) => node.getAttribute("data-workspace-event"),
		),
	).toEqual(rows.map((row) => row.id));
});
