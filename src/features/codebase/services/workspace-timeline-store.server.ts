import { createHash } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversations, messages, projects } from "@/db/schema";
import {
	type WorkspaceEvent,
	type WorkspaceMessageInput,
	type WorkspaceScope,
	workspaceMessageInputSchema,
} from "../types/workspace-timeline";
import { ONBOARDING_FEATURE_MESSAGE } from "./analysis";
import {
	parseRestoredAnswers,
	parseRestoredQuestions,
	restoreAskState,
} from "./chat-flow";
import type { AskHandoff } from "./generation-context-handoff";
import { isProvisionalCodebaseName } from "./naming";

type Executor = Pick<typeof db, "select" | "insert">;
export const workspaceConversationId = (projectId: string) =>
	`workspace:${projectId}`;

export async function assertWorkspaceScope(
	executor: Executor,
	userId: string,
	scope: WorkspaceScope,
) {
	const [project] = await executor
		.select()
		.from(projects)
		.where(
			and(
				eq(projects.id, scope.projectId),
				eq(projects.codebaseId, scope.codebaseId),
				eq(projects.userId, userId),
				eq(projects.projectMode, "existing_codebase"),
				isNull(projects.deletedAt),
			),
		)
		.limit(1);
	if (!project) throw new Error("PROJECT_NOT_FOUND");
	return project;
}

export async function persistWorkspaceEvents(
	executor: Executor,
	userId: string,
	scope: WorkspaceScope,
	events: WorkspaceEvent[],
) {
	if (!events.length) return;
	const conversationId = workspaceConversationId(scope.projectId);
	await executor
		.insert(conversations)
		.values({ id: conversationId, projectId: scope.projectId, userId })
		.onConflictDoNothing();
	await executor
		.insert(messages)
		.values(
			events.map((event) => ({
				id: `${conversationId}:${event.id}`,
				conversationId,
				role:
					event.type === "user_message" || event.type === "revision_requested"
						? "user"
						: event.type === "assistant_message"
							? "assistant"
							: "system",
				content: event.content ?? "",
				workspaceEvent: event,
				createdAt: new Date(event.createdAt),
			})),
		)
		.onConflictDoUpdate({
			target: messages.id,
			set: {
				workspaceEvent: sql`jsonb_set(excluded.workspace_event, '{createdAt}', ${messages.workspaceEvent}->'createdAt')`,
			},
			setWhere: and(
				eq(messages.conversationId, conversationId),
				sql`excluded.workspace_event->>'type' IN ('generation', 'question_set') AND (excluded.workspace_event->>'updatedAt' > ${messages.workspaceEvent}->>'updatedAt' OR (excluded.workspace_event->>'updatedAt' = ${messages.workspaceEvent}->>'updatedAt' AND excluded.workspace_event->>'status' IN ('completed', 'failed', 'cancelled') AND ${messages.workspaceEvent}->>'status' IN ('queued', 'running')))`,
			),
		});
}

export async function appendWorkspaceMessage(
	userId: string,
	input: WorkspaceMessageInput,
) {
	const clean = workspaceMessageInputSchema.parse(input);
	return db.transaction(async (tx) => {
		await assertWorkspaceScope(tx, userId, clean);
		const now = new Date().toISOString();
		const event: WorkspaceEvent = {
			...clean,
			status: "completed",
			createdAt: now,
			updatedAt: now,
		};
		await persistWorkspaceEvents(tx, userId, clean, [event]);
		const [saved] = await tx
			.select({ event: messages.workspaceEvent })
			.from(messages)
			.innerJoin(conversations, eq(conversations.id, messages.conversationId))
			.where(
				and(
					eq(
						messages.id,
						`${workspaceConversationId(clean.projectId)}:${clean.id}`,
					),
					eq(conversations.userId, userId),
					eq(conversations.projectId, clean.projectId),
				),
			)
			.limit(1);
		if (
			!saved?.event ||
			saved.event.content !== clean.content ||
			saved.event.stage !== clean.stage ||
			saved.event.type !== clean.type
		)
			throw new Error("MESSAGE_IDENTITY_CONFLICT");
		return saved.event;
	});
}

export async function persistAskWorkspaceEvents(
	executor: Executor,
	userId: string,
	handoff: AskHandoff,
) {
	const [project] = await executor
		.select({ codebaseId: projects.codebaseId })
		.from(projects)
		.where(
			and(
				eq(projects.id, handoff.projectId),
				eq(projects.userId, userId),
				eq(projects.projectMode, "existing_codebase"),
				isNull(projects.deletedAt),
			),
		)
		.limit(1);
	if (!project?.codebaseId) return;
	const scope = {
		projectId: handoff.projectId,
		codebaseId: project.codebaseId,
	};
	const now = handoff.updatedAt ?? new Date().toISOString();
	const events: WorkspaceEvent[] = [];
	const base = {
		...scope,
		status: "completed" as const,
		stage: "questions" as const,
		createdAt: now,
		updatedAt: now,
	};
	const prompt = handoff.state?.prompt.trim();
	const [priorPrompt] = await executor
		.select({ id: messages.id })
		.from(messages)
		.innerJoin(conversations, eq(messages.conversationId, conversations.id))
		.where(
			and(
				eq(conversations.projectId, scope.projectId),
				eq(conversations.userId, userId),
				sql`${messages.workspaceEvent}->>'type' = 'user_message' AND ${messages.workspaceEvent}->>'stage' = 'questions'`,
			),
		)
		.limit(1);
	if (
		prompt &&
		!priorPrompt &&
		prompt !== ONBOARDING_FEATURE_MESSAGE &&
		!isProvisionalCodebaseName(prompt)
	)
		events.push({
			...base,
			id: `0:prompt:${scope.projectId}`,
			type: "user_message",
			content: prompt,
		});
	const questions = parseRestoredQuestions(handoff.state?.questions);
	if (questions.length) {
		const key = createHash("sha256")
			.update(JSON.stringify(questions))
			.digest("hex");
		const restored = restoreAskState(
			questions,
			parseRestoredAnswers(handoff.answers),
		);
		const priorSets = await executor
			.select({ event: messages.workspaceEvent })
			.from(messages)
			.innerJoin(conversations, eq(conversations.id, messages.conversationId))
			.where(
				and(
					eq(conversations.projectId, scope.projectId),
					eq(conversations.userId, userId),
					sql`${messages.workspaceEvent}->>'type' = 'question_set'`,
				),
			);
		const priorSet = priorSets.find(
			(row) =>
				JSON.stringify(row.event?.questions) === JSON.stringify(questions),
		)?.event;
		events.push({
			...base,
			id: priorSet?.id ?? `2:questions:${key}`,
			type: "question_set",
			questions,
			answers: restored.answers,
		});
		for (const [questionId, content] of Object.entries(restored.answers))
			events.push({
				...base,
				id: `2:answer:${key}:${questionId}:${createHash("sha256").update(content).digest("hex")}`,
				type: "question_answered",
				questionId,
				content,
			});
	}
	await persistWorkspaceEvents(executor, userId, scope, events);
}
