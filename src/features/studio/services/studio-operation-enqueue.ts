import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
	type InsertStudioFrameRow,
	type InsertStudioJobRow,
	type StudioFrameRow,
	type StudioJobRow,
	studioFrames,
	studioJobs,
	studioProjects,
} from "@/db/schema";
import { ScrapeError } from "@/lib/design-errors";
import {
	STUDIO_ADD_FRAME_PLACEHOLDER_NAME,
	type StudioIntentDecision,
} from "./studio-composer-intent";
import { resolveStudioOperationIntent } from "./studio-composer-intent.server";
import { StudioFrameError } from "./studio-frame-errors";
import { STUDIO_MAX_PAGE_COUNT } from "./studio-generation-options";
import type { StudioJobTransaction } from "./studio-job-lease";
import { validateStudioPrompt } from "./studio-prompt-validation";

export interface EnqueueStudioOperationInput {
	prompt: string;
	/** Frames the user actually selected on the canvas, if any. */
	frameIds?: string[];
	requestId: string;
}

export type EnqueueStudioOperationResult =
	| { intent: "add_screen"; jobs: StudioJobRow[]; frames: StudioFrameRow[] }
	| { intent: "revise_selected" | "revise_project"; jobs: StudioJobRow[] }
	| { intent: "clarify"; message: string };

function assertNewScreenNames(
	decision: StudioIntentDecision,
	existingNames: string[],
): string[] {
	// An empty name list means one screen whose name the generator still picks.
	if (decision.screens.length === 0) return [];
	if (decision.screens.length > STUDIO_MAX_PAGE_COUNT)
		throw new StudioFrameError("STUDIO_SCREEN_LIMIT");
	const requested = decision.screens.map((name) => name.trim());
	const lowered = requested.map((name) => name.toLowerCase());
	if (new Set(lowered).size !== lowered.length)
		throw new StudioFrameError("STUDIO_DUPLICATE_SCREEN");
	const existing = new Set(
		existingNames.map((name) => name.trim().toLowerCase()),
	);
	if (lowered.some((name) => existing.has(name)))
		throw new StudioFrameError("STUDIO_DUPLICATE_SCREEN");
	return requested;
}

async function enqueueAddedScreens(
	tx: StudioJobTransaction,
	input: {
		projectId: string;
		userId: string;
		prompt: string;
		requestId: string;
		viewport: StudioFrameRow["viewport"];
		existingFrames: StudioFrameRow[];
		decision: StudioIntentDecision;
	},
): Promise<{ jobs: StudioJobRow[]; frames: StudioFrameRow[] }> {
	const plannedJobIds = (
		input.decision.screens.length > 0 ? input.decision.screens : [null]
	).map((_, index) => `${input.requestId}:add:${index}`);
	// A repeated submit reuses the already-queued jobs instead of creating a
	// second screen that would then collide with the first one's name.
	const previous = await tx
		.select()
		.from(studioJobs)
		.where(
			and(
				inArray(studioJobs.id, plannedJobIds),
				eq(studioJobs.userId, input.userId),
			),
		);
	if (previous.length > 0) return { jobs: previous, frames: [] };
	const names = assertNewScreenNames(
		input.decision,
		input.existingFrames.map((frame) => frame.name),
	);
	const picks = names.length > 0 ? names : [null];
	const baseOrder =
		input.existingFrames.reduce(
			(max, frame) => Math.max(max, frame.order),
			-1,
		) + 1;
	const jobs: StudioJobRow[] = [];
	const created: StudioFrameRow[] = [];
	for (const [index, name] of picks.entries()) {
		const jobId = plannedJobIds[index] ?? `${input.requestId}:add:${index}`;
		const [frame] = await tx
			.insert(studioFrames)
			.values({
				projectId: input.projectId,
				name: name ?? STUDIO_ADD_FRAME_PLACEHOLDER_NAME,
				description: input.prompt,
				viewport: input.viewport,
				order: baseOrder + index,
				status: "queued",
			} satisfies InsertStudioFrameRow)
			.returning();
		if (!frame) throw new ScrapeError("STORAGE_FAILED");
		const [job] = await tx
			.insert(studioJobs)
			.values({
				id: jobId,
				projectId: input.projectId,
				userId: input.userId,
				prompt: input.prompt,
				jobType: "add",
				targetFrameId: frame.id,
				status: "queued",
			} satisfies InsertStudioJobRow)
			.returning();
		if (!job) throw new ScrapeError("STORAGE_FAILED");
		jobs.push(job);
		created.push(frame);
	}
	return { jobs, frames: created };
}

async function enqueueFrameRevisions(
	tx: StudioJobTransaction,
	input: {
		projectId: string;
		userId: string;
		prompt: string;
		requestId: string;
		frameIds: string[];
		existingFrames: StudioFrameRow[];
	},
): Promise<StudioJobRow[]> {
	const ids = [...new Set(input.frameIds)];
	if (
		ids.length === 0 ||
		ids.some((id) => !input.existingFrames.some((frame) => frame.id === id))
	)
		throw new StudioFrameError("STUDIO_INVALID_INPUT");
	const targets = input.existingFrames.filter((frame) =>
		ids.includes(frame.id),
	);
	const jobs: StudioJobRow[] = [];
	for (const frame of targets) {
		const jobId = `${input.requestId}:${frame.id}`;
		const [existing] = await tx
			.select()
			.from(studioJobs)
			.where(and(eq(studioJobs.id, jobId), eq(studioJobs.userId, input.userId)))
			.limit(1);
		if (existing) {
			jobs.push(existing);
			continue;
		}
		if (frame.status === "queued" || frame.status === "generating")
			throw new StudioFrameError("STUDIO_INVALID_INPUT");
		const [job] = await tx
			.insert(studioJobs)
			.values({
				id: jobId,
				projectId: input.projectId,
				userId: input.userId,
				prompt: input.prompt,
				jobType: "revise",
				targetFrameId: frame.id,
				status: "queued",
			} satisfies InsertStudioJobRow)
			.returning();
		if (!job) throw new ScrapeError("STORAGE_FAILED");
		await tx
			.update(studioFrames)
			.set({ status: "queued", error: null, updatedAt: new Date() })
			.where(
				and(
					eq(studioFrames.id, frame.id),
					eq(studioFrames.projectId, input.projectId),
				),
			);
		jobs.push(job);
	}
	return jobs;
}

/**
 * Resolves one composer message into an explicit operation and persists the
 * work. A missing frame selection is only ever a clarification input, never a
 * request to regenerate the whole project.
 */
export async function enqueueStudioOperation(
	projectId: string,
	userId: string,
	input: EnqueueStudioOperationInput,
): Promise<EnqueueStudioOperationResult> {
	const checked = validateStudioPrompt(input.prompt);
	if (!checked.ok) throw new ScrapeError("INVALID_URL", checked.error);
	const [project] = await db
		.select()
		.from(studioProjects)
		.where(
			and(eq(studioProjects.id, projectId), eq(studioProjects.userId, userId)),
		)
		.limit(1);
	if (!project)
		throw new ScrapeError("WEBSITE_BLOCKED", "Studio tidak ditemukan.");
	const frames = await db
		.select()
		.from(studioFrames)
		.where(eq(studioFrames.projectId, projectId))
		.orderBy(asc(studioFrames.order));
	const decision = await resolveStudioOperationIntent({
		prompt: checked.prompt,
		selectedFrameIds: input.frameIds ?? [],
		existingScreenNames: frames.map((frame) => frame.name),
		projectTitle: project.title,
	});
	if (decision.intent === "clarify")
		return {
			intent: "clarify",
			message: decision.message ?? "",
		};
	const intent = decision.intent;
	return db.transaction(async (tx) => {
		const [locked] = await tx
			.select()
			.from(studioProjects)
			.where(
				and(
					eq(studioProjects.id, projectId),
					eq(studioProjects.userId, userId),
				),
			)
			.for("update");
		if (!locked)
			throw new ScrapeError("WEBSITE_BLOCKED", "Studio tidak ditemukan.");
		const currentFrames = await tx
			.select()
			.from(studioFrames)
			.where(eq(studioFrames.projectId, projectId))
			.orderBy(asc(studioFrames.order));
		if (intent === "add_screen") {
			const added = await enqueueAddedScreens(tx, {
				projectId,
				userId,
				prompt: checked.prompt,
				requestId: input.requestId,
				viewport: locked.designMode,
				existingFrames: currentFrames,
				decision,
			});
			if (added.frames.length > 0)
				await tx
					.update(studioProjects)
					.set({ updatedAt: new Date() })
					.where(eq(studioProjects.id, projectId));
			return { intent: "add_screen" as const, ...added };
		}
		const targetIds =
			intent === "revise_project"
				? currentFrames.map((frame) => frame.id)
				: (input.frameIds ?? []);
		const jobs = await enqueueFrameRevisions(tx, {
			projectId,
			userId,
			prompt: checked.prompt,
			requestId: input.requestId,
			frameIds: targetIds,
			existingFrames: currentFrames,
		});
		return { intent, jobs };
	});
}
