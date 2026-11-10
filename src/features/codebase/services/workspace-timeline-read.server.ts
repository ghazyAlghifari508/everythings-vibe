import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
	acVersions,
	codebaseGenerationOperations,
	codebaseRevisionProposals,
	conversations,
	messages,
	prdVersions,
	projects,
	tasks,
} from "@/db/schema";
import {
	type WorkspaceEvent,
	type WorkspaceScope,
	type WorkspaceTimelineSource,
	workspaceEventSchema,
} from "../types/workspace-timeline";
import { toWorkspaceGenerationOperation } from "./durable-generation-ops";
import { getAskHandoff } from "./generation-context-store.server";
import { restoreWorkspaceEvents } from "./workspace-timeline";
import {
	assertWorkspaceScope,
	persistWorkspaceEvents,
} from "./workspace-timeline-store.server";

export async function readWorkspaceTimeline(
	userId: string,
	scope: WorkspaceScope,
) {
	return db.transaction(async (tx) => {
		const project = await assertWorkspaceScope(tx, userId, scope);
		const handoff = await getAskHandoff(scope.projectId, userId);
		const rows = await tx
			.select({
				id: messages.id,
				role: messages.role,
				content: messages.content,
				event: messages.workspaceEvent,
				createdAt: messages.createdAt,
			})
			.from(messages)
			.innerJoin(conversations, eq(conversations.id, messages.conversationId))
			.where(
				and(
					eq(conversations.projectId, scope.projectId),
					eq(conversations.userId, userId),
				),
			)
			.orderBy(asc(messages.createdAt), asc(messages.id));
		const persisted: WorkspaceEvent[] = [];
		for (const row of rows) {
			if (row.event !== null) {
				const parsed = workspaceEventSchema.parse(row.event);
				if (
					parsed.projectId !== scope.projectId ||
					parsed.codebaseId !== scope.codebaseId
				)
					throw new Error("WORKSPACE_EVENT_SCOPE_MISMATCH");
				persisted.push(parsed);
			} else if (
				(row.role === "user" || row.role === "assistant") &&
				row.content.trim()
			) {
				const createdAt = (row.createdAt ?? project.createdAt)?.toISOString();
				if (createdAt)
					persisted.push({
						...scope,
						id: `legacy:${row.id}`,
						type: row.role === "user" ? "user_message" : "assistant_message",
						stage: "prd",
						status: "completed",
						content: row.content,
						createdAt,
						updatedAt: createdAt,
					});
			}
		}
		const operations = await tx
			.select()
			.from(codebaseGenerationOperations)
			.where(
				and(
					eq(codebaseGenerationOperations.projectId, scope.projectId),
					eq(codebaseGenerationOperations.userId, userId),
				),
			)
			.orderBy(asc(codebaseGenerationOperations.createdAt));
		const artifacts: WorkspaceTimelineSource["artifacts"] = [];
		const featureDate = project.featureTree?.createdAt;
		if (featureDate && Number.isFinite(Date.parse(featureDate)))
			artifacts.push({
				id: `feature:${scope.projectId}:${featureDate}`,
				stage: "feature",
				createdAt: new Date(featureDate).toISOString(),
			});
		for (const [stage, table] of [
			["prd", prdVersions],
			["ac", acVersions],
			["task", tasks],
		] as const) {
			const [artifact] = await tx
				.select({ id: table.id, createdAt: table.createdAt })
				.from(table)
				.innerJoin(projects, eq(projects.id, table.projectId))
				.where(
					and(
						eq(table.projectId, scope.projectId),
						eq(projects.userId, userId),
					),
				)
				.orderBy(asc(table.createdAt), asc(table.id))
				.limit(1);
			if (artifact?.createdAt)
				artifacts.push({
					id: artifact.id,
					stage,
					createdAt: artifact.createdAt.toISOString(),
				});
		}
		const revisions = await tx
			.select()
			.from(codebaseRevisionProposals)
			.where(
				and(
					eq(codebaseRevisionProposals.projectId, scope.projectId),
					eq(codebaseRevisionProposals.userId, userId),
				),
			)
			.orderBy(asc(codebaseRevisionProposals.createdAt));
		const source: WorkspaceTimelineSource = {
			...scope,
			createdAt:
				project.createdAt?.toISOString() ??
				handoff?.updatedAt ??
				new Date(0).toISOString(),
			handoff,
			operations: operations.map(toWorkspaceGenerationOperation),
			artifacts,
			revisions: revisions.map((row) => ({
				...row,
				createdAt: row.createdAt.toISOString(),
				approvedAt: row.approvedAt?.toISOString() ?? null,
			})),
		};
		const restored = restoreWorkspaceEvents(source, persisted);
		await persistWorkspaceEvents(tx, userId, scope, restored);
		return { events: restored };
	});
}
