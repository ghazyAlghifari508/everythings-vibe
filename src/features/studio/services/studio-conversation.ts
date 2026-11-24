import { isDeepStrictEqual } from "node:util";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import {
	type StudioJobRow,
	type StudioMessageRow,
	studioFrames,
	studioJobs,
	studioMessages,
	studioProjects,
	studioRevisions,
} from "@/db/schema";
import type { StudioMessageAttachment } from "../types/studio-conversation";
import { composeStudioAssistantContent } from "./studio-conversation-content";
import {
	resolveStudioMessageProgress,
	type StudioRevisionHtml,
	studioMessageHistoryNeeds,
} from "./studio-conversation-progress";
import { StudioFrameError } from "./studio-frame-errors";
import type { StudioJobTransaction } from "./studio-job-lease";

/** Caller holds the project lock (or has just inserted the project) in this transaction. */
export async function appendStudioConversation(
	tx: StudioJobTransaction,
	input: {
		projectId: string;
		userId: string;
		operationId: string;
		prompt: string;
		jobs: StudioJobRow[];
		attachments?: StudioMessageAttachment[];
	},
) {
	const { projectId, userId, operationId } = input;
	const [owned] = await tx
		.select({ id: studioProjects.id })
		.from(studioProjects)
		.where(
			and(eq(studioProjects.id, projectId), eq(studioProjects.userId, userId)),
		);
	if (
		!owned ||
		!input.jobs.length ||
		input.jobs.some(
			(job) => job.projectId !== projectId || job.userId !== userId,
		)
	)
		throw new StudioFrameError("STUDIO_NOT_FOUND");
	const [previous] = await tx
		.select({ id: studioMessages.id })
		.from(studioMessages)
		.where(
			and(
				eq(studioMessages.projectId, projectId),
				eq(studioMessages.userId, userId),
				eq(studioMessages.operationId, operationId),
			),
		)
		.limit(1);
	if (previous) return;
	const [tail] = await tx
		.select({ order: studioMessages.order })
		.from(studioMessages)
		.where(
			and(
				eq(studioMessages.projectId, projectId),
				eq(studioMessages.userId, userId),
			),
		)
		.orderBy(desc(studioMessages.order))
		.limit(1);
	const order = (tail?.order ?? -1) + 1;
	const common = {
		projectId,
		userId,
		operationId,
		jobIds: input.jobs.map((job) => job.id),
		attachments: input.attachments ?? [],
	};
	await tx.insert(studioMessages).values([
		{
			...common,
			order,
			role: "user",
			content: input.prompt,
			status: "accepted",
		},
		{
			...common,
			order: order + 1,
			role: "assistant",
			content: "",
			status: "queued",
		},
	]);
	await synchronizeStudioConversation(tx, projectId, userId);
}

/**
 * Committed HTML a revise turn still has to compare. Frozen results are never
 * read again, so a normal progress tick issues no extra query.
 */
async function readRevisionHistory(
	tx: StudioJobTransaction,
	projectId: string,
	messages: StudioMessageRow[],
	jobs: StudioJobRow[],
): Promise<StudioRevisionHtml[]> {
	const jobIds = new Set<string>();
	const before: { frameId: string; revision: number }[] = [];
	for (const message of messages) {
		const needs = studioMessageHistoryNeeds(message, jobs);
		for (const id of needs.jobIds) jobIds.add(id);
		before.push(...needs.before);
	}
	if (!jobIds.size) return [];
	return tx
		.select({
			frameId: studioRevisions.frameId,
			frameRevision: studioRevisions.frameRevision,
			jobId: studioRevisions.jobId,
			htmlCode: studioRevisions.htmlCode,
		})
		.from(studioRevisions)
		.where(
			and(
				eq(studioRevisions.projectId, projectId),
				or(
					inArray(studioRevisions.jobId, [...jobIds]),
					...before.map((entry) =>
						and(
							eq(studioRevisions.frameId, entry.frameId),
							eq(studioRevisions.frameRevision, entry.revision),
						),
					),
				),
			),
		)
		.orderBy(asc(studioRevisions.version));
}

/** Materializes public progress in the same commit as job/frame state, independent of any browser. */
export async function synchronizeStudioConversation(
	tx: StudioJobTransaction,
	projectId: string,
	userId: string,
) {
	const turns = await tx
		.select()
		.from(studioMessages)
		.where(
			and(
				eq(studioMessages.projectId, projectId),
				eq(studioMessages.userId, userId),
			),
		)
		.orderBy(asc(studioMessages.order));
	const messages = turns.filter((turn) => turn.role === "assistant");
	if (!messages.length) return;
	const jobs = await tx
		.select()
		.from(studioJobs)
		.where(
			and(eq(studioJobs.projectId, projectId), eq(studioJobs.userId, userId)),
		);
	const frames = await tx
		.select()
		.from(studioFrames)
		.innerJoin(studioProjects, eq(studioFrames.projectId, studioProjects.id))
		.where(
			and(
				eq(studioFrames.projectId, projectId),
				eq(studioProjects.userId, userId),
			),
		)
		.orderBy(asc(studioFrames.order));
	const [project] = await tx
		.select({ blueprint: studioProjects.designBlueprint })
		.from(studioProjects)
		.where(
			and(eq(studioProjects.id, projectId), eq(studioProjects.userId, userId)),
		);
	const deferred = project?.blueprint?.initialScope?.deferred;
	const history = await readRevisionHistory(tx, projectId, messages, jobs);
	for (const message of messages) {
		if (!message.jobIds.length) continue;
		const progress = resolveStudioMessageProgress(
			message,
			jobs,
			frames.map((row) => row.studio_frames),
			deferred,
			history,
		);
		// Composed from persisted plan and frame results only; no model call.
		const request = turns.find(
			(turn) =>
				turn.role === "user" && turn.operationId === message.operationId,
		);
		const composed = composeStudioAssistantContent({
			progress,
			blueprint: project?.blueprint,
			request: request?.content ?? "",
		});
		// Authored explanation is kept if its frames are no longer reportable
		// (for example deleted); it is never swapped for a shorter template.
		const content =
			composed ||
			(message.progress?.frames?.some((frame) => frame.status === "ready")
				? message.content
				: "");
		if (
			message.status === progress.phase &&
			message.content === content &&
			isDeepStrictEqual(message.progress, progress)
		)
			continue;
		await tx
			.update(studioMessages)
			.set({ progress, status: progress.phase, content, updatedAt: new Date() })
			.where(
				and(
					eq(studioMessages.projectId, projectId),
					eq(studioMessages.userId, userId),
					eq(studioMessages.id, message.id),
				),
			);
	}
}

export async function readStudioConversation(
	tx: StudioJobTransaction,
	projectId: string,
	userId: string,
) {
	return tx
		.select()
		.from(studioMessages)
		.where(
			and(
				eq(studioMessages.projectId, projectId),
				eq(studioMessages.userId, userId),
			),
		)
		.orderBy(asc(studioMessages.order));
}
