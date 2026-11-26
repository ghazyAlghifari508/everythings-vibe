import type {
	WorkspaceEvent,
	WorkspaceScope,
	WorkspaceTimelineSource,
} from "../types/workspace-timeline";
import {
	parseRestoredAnswers,
	parseRestoredQuestions,
	restoreAskState,
} from "./chat-flow";

const EVENT_ORDER: Record<WorkspaceEvent["type"], number> = {
	user_message: 0,
	revision_requested: 0,
	generation: 1,
	question_set: 2,
	question_answered: 3,
	artifact_created: 4,
	assistant_message: 5,
	revision_proposed: 5,
	revision_completed: 6,
	revision_rejected: 6,
	handoff_ready: 7,
};
const STATUS_ORDER = {
	queued: 0,
	running: 1,
	failed: 2,
	cancelled: 2,
	completed: 3,
};
export function compareWorkspaceEvents(a: WorkspaceEvent, b: WorkspaceEvent) {
	return (
		a.createdAt.localeCompare(b.createdAt) ||
		EVENT_ORDER[a.type] - EVENT_ORDER[b.type] ||
		a.id.localeCompare(b.id)
	);
}

export function mergeWorkspaceEvents(
	scope: WorkspaceScope,
	...groups: readonly WorkspaceEvent[][]
): WorkspaceEvent[] {
	const events = new Map<string, WorkspaceEvent>();
	for (const group of groups)
		for (const event of group) {
			if (
				event.projectId !== scope.projectId ||
				event.codebaseId !== scope.codebaseId
			)
				continue;
			const prior = events.get(event.id);
			if (
				!prior ||
				event.updatedAt > prior.updatedAt ||
				(event.updatedAt === prior.updatedAt &&
					STATUS_ORDER[event.status] > STATUS_ORDER[prior.status])
			)
				events.set(event.id, {
					...event,
					createdAt: prior?.createdAt ?? event.createdAt,
				});
		}
	return [...events.values()].sort(compareWorkspaceEvents);
}

export function restoreWorkspaceEvents(
	source: WorkspaceTimelineSource,
	persisted: WorkspaceEvent[],
): WorkspaceEvent[] {
	const events: WorkspaceEvent[] = [];
	const add = (
		id: string,
		type: WorkspaceEvent["type"],
		stage: WorkspaceEvent["stage"],
		createdAt: string,
		fields: Partial<WorkspaceEvent> = {},
	) => {
		events.push({
			id,
			codebaseId: source.codebaseId,
			projectId: source.projectId,
			type,
			stage,
			status: "completed",
			createdAt,
			updatedAt: createdAt,
			...fields,
		});
	};
	const prompt = source.handoff?.state?.prompt.trim();
	if (
		prompt &&
		!persisted.some(
			(event) => event.type === "user_message" && event.stage === "questions",
		)
	)
		add(
			`0:prompt:${source.projectId}`,
			"user_message",
			"questions",
			source.createdAt,
			{ content: prompt },
		);
	const questions = parseRestoredQuestions(source.handoff?.state?.questions);
	if (questions.length) {
		const restored = restoreAskState(
			questions,
			parseRestoredAnswers(source.handoff?.answers),
		);
		const prior = persisted
			.filter((event) => event.type === "question_set")
			.at(-1);
		if (!prior)
			add(
				`2:questions:${source.projectId}`,
				"question_set",
				"questions",
				source.handoff?.updatedAt ?? source.createdAt,
				{ questions, answers: restored.answers },
			);
	}
	for (const op of source.operations) {
		if (op.projectId !== source.projectId) continue;
		add(`1:generation:${op.id}`, "generation", op.stage, op.createdAt, {
			operationId: op.id,
			status: op.status,
			updatedAt: op.updatedAt,
			...(op.artifactId ? { artifactId: op.artifactId } : {}),
		});
		if (
			op.status === "completed" &&
			op.artifactId &&
			op.stage !== "questions" &&
			!source.artifacts.some((artifact) => artifact.id === op.artifactId)
		)
			add(
				`3:artifact:${op.artifactId}`,
				"artifact_created",
				op.stage,
				op.finishedAt ?? op.updatedAt,
				{ operationId: op.id, artifactId: op.artifactId },
			);
	}
	for (const artifact of source.artifacts) {
		const op = source.operations.find(
			(op) =>
				op.projectId === source.projectId && op.artifactId === artifact.id,
		);
		const createdAt =
			op?.status === "completed"
				? (op.finishedAt ?? op.updatedAt)
				: artifact.createdAt;
		add(
			`3:artifact:${artifact.id}`,
			"artifact_created",
			artifact.stage,
			createdAt,
			{ artifactId: artifact.id, ...(op ? { operationId: op.id } : {}) },
		);
	}
	for (const proposal of source.revisions) {
		const stage =
			proposal.targetKind === "tasks" ? "task" : proposal.targetKind;
		const request = persisted.find(
			(event) =>
				event.id === proposal.idempotencyKey &&
				event.type === "revision_requested",
		);
		if (!request)
			add(
				`4:revision-request:${proposal.id}`,
				"revision_requested",
				stage,
				proposal.createdAt,
				{ content: proposal.instruction, proposalId: proposal.id },
			);
		add(
			`5:revision-proposed:${proposal.id}`,
			"revision_proposed",
			stage,
			proposal.createdAt,
			{ proposalId: proposal.id },
		);
		if (proposal.status === "approved")
			add(
				`6:revision-applied:${proposal.id}`,
				"revision_completed",
				stage,
				proposal.approvedAt ?? proposal.createdAt,
				{
					proposalId: proposal.id,
					...(proposal.appliedVersionId
						? { artifactId: proposal.appliedVersionId }
						: {}),
				},
			);
		if (proposal.status === "rejected")
			add(
				`6:revision-rejected:${proposal.id}`,
				"revision_rejected",
				stage,
				proposal.approvedAt ?? proposal.createdAt,
				{ proposalId: proposal.id },
			);
	}
	const task = events.find(
		(event) => event.type === "artifact_created" && event.stage === "task",
	);
	if (task)
		add(
			`9:handoff:${source.projectId}`,
			"handoff_ready",
			"handoff",
			task.createdAt,
			{ artifactId: task.artifactId },
		);
	return mergeWorkspaceEvents(source, persisted, events);
}
