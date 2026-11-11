import { and, asc, desc, eq } from "drizzle-orm";
import {
	type StudioJobRow,
	studioFrames,
	studioJobs,
	studioMessages,
	studioProjects,
} from "@/db/schema";
import type { StudioMessageAttachment } from "../types/studio-conversation";
import {
	describeStudioMessageProgress,
	resolveStudioMessageProgress,
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
			content: "Permintaan diterima. Menunggu giliran.",
			status: "queued",
		},
	]);
	await synchronizeStudioConversation(tx, projectId, userId);
}

/** Materializes public progress in the same commit as job/frame state, independent of any browser. */
export async function synchronizeStudioConversation(
	tx: StudioJobTransaction,
	projectId: string,
	userId: string,
) {
	const messages = await tx
		.select()
		.from(studioMessages)
		.where(
			and(
				eq(studioMessages.projectId, projectId),
				eq(studioMessages.userId, userId),
				eq(studioMessages.role, "assistant"),
			),
		)
		.orderBy(asc(studioMessages.order));
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
	for (const message of messages) {
		const progress = resolveStudioMessageProgress(
			message,
			jobs,
			frames.map((row) => row.studio_frames),
		);
		const content = describeStudioMessageProgress(progress);
		if (
			message.status === progress.phase &&
			message.content === content &&
			JSON.stringify(message.progress) === JSON.stringify(progress)
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
