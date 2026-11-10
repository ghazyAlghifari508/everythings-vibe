import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
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
import {
	ensureStudioInitialOwnership,
	findStudioInitialJob,
	studioFrameDependency,
} from "./studio-job-dependencies";
import {
	readStudioOperationRequest,
	studioOperationHash,
} from "./studio-operation-request";
import { validateStudioPrompt } from "./studio-prompt-validation";

export interface EnqueueStudioOperationInput {
	prompt: string;
	frameIds?: string[];
	requestId: string;
	/** Optional for existing clients; when supplied every target must match. */
	baseRevisions?: Record<string, number>;
}
export type EnqueueStudioOperationResult =
	| { intent: "add_screen"; jobs: StudioJobRow[]; frames: StudioFrameRow[] }
	| { intent: "revise_selected" | "revise_project"; jobs: StudioJobRow[] }
	| { intent: "clarify"; message: string };

function assertNewScreenNames(
	decision: StudioIntentDecision,
	frames: StudioFrameRow[],
) {
	if (decision.screens.length > STUDIO_MAX_PAGE_COUNT)
		throw new StudioFrameError("STUDIO_SCREEN_LIMIT");
	const names = decision.screens.map((name) => name.trim());
	const keys = names.map((name) => name.toLowerCase());
	if (
		new Set(keys).size !== keys.length ||
		frames.some((frame) => keys.includes(frame.name.trim().toLowerCase()))
	)
		throw new StudioFrameError("STUDIO_DUPLICATE_SCREEN");
	return names.length > 0 ? names : [null];
}

export async function enqueueStudioOperation(
	projectId: string,
	userId: string,
	input: EnqueueStudioOperationInput,
): Promise<EnqueueStudioOperationResult> {
	const checked = validateStudioPrompt(input.prompt);
	if (!checked.ok) throw new ScrapeError("INVALID_URL", checked.error);
	if (!input.requestId.trim())
		throw new StudioFrameError("STUDIO_INVALID_INPUT");
	const [project] = await db
		.select()
		.from(studioProjects)
		.where(
			and(eq(studioProjects.id, projectId), eq(studioProjects.userId, userId)),
		)
		.limit(1);
	if (!project) throw new StudioFrameError("STUDIO_NOT_FOUND");
	const hash = studioOperationHash(input);
	const previous = await readStudioOperationRequest(
		projectId,
		userId,
		input.requestId,
		hash,
	);
	if (previous) return previous;
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
		return { intent: "clarify", message: decision.message ?? "" };
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
		if (!locked) throw new StudioFrameError("STUDIO_NOT_FOUND");
		const repeated = await readStudioOperationRequest(
			projectId,
			userId,
			input.requestId,
			hash,
			tx,
		);
		if (repeated) return repeated;
		const initial = await findStudioInitialJob(tx, projectId, userId);
		if (initial) await ensureStudioInitialOwnership(tx, initial);
		const current = await tx
			.select()
			.from(studioFrames)
			.where(eq(studioFrames.projectId, projectId))
			.orderBy(asc(studioFrames.order));
		const common = {
			projectId,
			userId,
			prompt: checked.prompt,
			requestId: input.requestId,
			requestHash: hash,
			operationIntent: intent,
			blueprintJobId: initial?.id ?? null,
			status: "queued",
		};
		const jobs: StudioJobRow[] = [];
		if (intent === "add_screen") {
			const names = assertNewScreenNames(decision, current);
			const order = Math.max(-1, ...current.map((frame) => frame.order)) + 1;
			const created: StudioFrameRow[] = [];
			for (const [index, name] of names.entries()) {
				const id = crypto.randomUUID();
				const [frame] = await tx
					.insert(studioFrames)
					.values({
						projectId,
						originJobId: id,
						name: name ?? STUDIO_ADD_FRAME_PLACEHOLDER_NAME,
						description: checked.prompt,
						viewport: locked.designMode,
						order: order + index,
					})
					.returning();
				if (!frame) throw new ScrapeError("STORAGE_FAILED");
				const [job] = await tx
					.insert(studioJobs)
					.values({
						...common,
						id,
						jobType: "add",
						targetFrameId: frame.id,
						operationIndex: index,
						baseRevision: 0,
					})
					.returning();
				if (!job) throw new ScrapeError("STORAGE_FAILED");
				jobs.push(job);
				created.push(frame);
			}
			await tx
				.update(studioProjects)
				.set({ updatedAt: new Date() })
				.where(
					and(
						eq(studioProjects.id, projectId),
						eq(studioProjects.userId, userId),
					),
				);
			return { intent, jobs, frames: created };
		}
		const ids = [
			...new Set(
				intent === "revise_project"
					? current.map((frame) => frame.id)
					: (input.frameIds ?? []),
			),
		];
		if (
			!ids.length ||
			ids.some((id) => !current.some((frame) => frame.id === id))
		)
			throw new StudioFrameError("STUDIO_INVALID_INPUT");
		for (const [index, id] of ids.entries()) {
			const frame = current.find((entry) => entry.id === id);
			if (!frame) throw new StudioFrameError("STUDIO_NOT_FOUND");
			const explicitBase = input.baseRevisions?.[id];
			if (
				input.baseRevisions &&
				(!Number.isInteger(explicitBase) || explicitBase !== frame.revision)
			)
				throw new StudioFrameError("STUDIO_STALE_REVISION");
			const dependency = await studioFrameDependency(tx, frame, userId);
			if (
				frame.status === "failed" &&
				!frame.htmlCode &&
				!dependency.dependsOnJobId
			)
				throw new StudioFrameError("STUDIO_DEPENDENCY_FAILED");
			const [job] = await tx
				.insert(studioJobs)
				.values({
					...common,
					jobType: "revise",
					targetFrameId: id,
					operationIndex: index,
					...dependency,
				})
				.returning();
			if (!job) throw new ScrapeError("STORAGE_FAILED");
			jobs.push(job);
		}
		return { intent, jobs };
	});
}
