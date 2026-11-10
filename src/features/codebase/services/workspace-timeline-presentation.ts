import type { CodebaseArtifactRef } from "../components/explorer/codebase-file-card";
import type { WorkspaceEvent } from "../types/workspace-timeline";
import type { CodebaseRunState } from "./chat-flow";
import { compareWorkspaceEvents } from "./workspace-timeline";

type EntryBase = { id: string; stage: WorkspaceEvent["stage"] };
export type WorkspaceTimelineEntry = EntryBase &
	(
		| { kind: "message"; role: "user" | "assistant"; content: string }
		| { kind: "questions"; event?: WorkspaceEvent }
		| { kind: "artifact"; artifact: CodebaseArtifactRef }
		| {
				kind: "operation";
				event?: WorkspaceEvent;
				run: CodebaseRunState | null;
		  }
		| { kind: "revision"; event: WorkspaceEvent }
		| { kind: "handoff" }
	);

export function buildWorkspaceTimeline(input: {
	events: readonly WorkspaceEvent[];
	artifacts: readonly CodebaseArtifactRef[];
	hasQuestions: boolean;
	hasHandoff: boolean;
	run: CodebaseRunState | null;
}): WorkspaceTimelineEntry[] {
	const entries: WorkspaceTimelineEntry[] = [];
	const shownArtifacts = new Set<string>();
	let shownQuestions = false;
	let shownHandoff = false;
	let shownRun = false;
	const appendArtifact = (stage: WorkspaceEvent["stage"], id: string) => {
		const prefix = stage === "task" ? "tasks-" : `${stage}-`;
		const artifact = input.artifacts.find((item) => item.id.startsWith(prefix));
		if (!artifact || shownArtifacts.has(artifact.id)) return;
		shownArtifacts.add(artifact.id);
		entries.push({ id, stage, kind: "artifact", artifact });
	};
	const events = [...input.events].sort(compareWorkspaceEvents);
	for (const event of events) {
		const base = { id: event.id, stage: event.stage };
		switch (event.type) {
			case "user_message":
			case "assistant_message":
			case "revision_requested":
				entries.push({
					...base,
					kind: "message",
					role: event.type === "assistant_message" ? "assistant" : "user",
					content: event.content ?? "",
				});
				break;
			case "question_set":
				entries.push({ ...base, kind: "questions", event });
				shownQuestions = true;
				break;
			case "generation": {
				const run =
					input.run?.operationId === event.operationId ? input.run : null;
				if (run) shownRun = true;
				if (run || event.status !== "completed")
					entries.push({ ...base, kind: "operation", event, run });
				break;
			}
			case "artifact_created":
				appendArtifact(event.stage, event.id);
				break;
			case "revision_proposed":
			case "revision_completed":
			case "revision_rejected":
				entries.push({ ...base, kind: "revision", event });
				break;
			case "handoff_ready":
				if (input.hasHandoff && !shownHandoff)
					entries.push({ ...base, kind: "handoff" });
				shownHandoff = true;
				break;
		}
	}
	// Hydration may finish before its timeline read; keep real artifacts reachable.
	if (input.hasQuestions && !shownQuestions)
		entries.push({
			id: "current-questions",
			stage: "questions",
			kind: "questions",
		});
	for (const stage of ["feature", "prd", "ac", "task"] as const)
		appendArtifact(stage, `current-${stage}`);
	if (input.run && !shownRun) {
		const entry: WorkspaceTimelineEntry = {
			id: `run:${input.run.requestId}`,
			stage: input.run.stage,
			kind: "operation",
			run: input.run,
		};
		const next = entries.findIndex(
			(item) =>
				item.stage === input.run?.stage &&
				(item.kind === "artifact" || item.kind === "questions"),
		);
		if (next < 0) entries.push(entry);
		else entries.splice(next, 0, entry);
	}
	if (input.hasHandoff && !shownHandoff)
		entries.push({ id: "current-handoff", stage: "handoff", kind: "handoff" });
	return entries;
}
