import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
	type InsertStudioRevisionRow,
	type StudioFrameRow,
	studioFrames,
	studioJobs,
	studioProjects,
	studioRevisions,
} from "@/db/schema";
import { STUDIO_FRAME_CONCURRENCY } from "@/features/studio/types/studio-constants";
import type { StudioDesignBlueprint } from "./studio-design-blueprint";
import { extractDesignSystemTokens } from "./studio-design-tokens";
import {
	generateInitialFrame,
	isTemporarySlot,
	runWithConcurrency,
} from "./studio-frame-generation";
import { runStudioFrameOperation } from "./studio-frame-operation";
import { claimStudioJob, refreshStudioJobLease } from "./studio-job-lease";
import { buildStudioAssetUrl } from "./studio-logo-service";
import {
	persistStudioPlannedFrames,
	planStudioScreens,
} from "./studio-planning";
import { validateStudioDesignMode } from "./studio-prompt-validation";

const activeStudioJobs = new Set<string>();

export async function runStudioJobPipeline(
	jobId: string,
	projectId: string,
	userId: string,
): Promise<void> {
	if (activeStudioJobs.has(jobId)) return;
	activeStudioJobs.add(jobId);

	try {
		const [operation] = await db
			.select()
			.from(studioJobs)
			.where(and(eq(studioJobs.id, jobId), eq(studioJobs.userId, userId)))
			.limit(1);
		if (operation && operation.jobType !== "initial") {
			await runStudioFrameOperation(operation);
			return;
		}
		const [job] = await db
			.select()
			.from(studioJobs)
			.where(and(eq(studioJobs.id, jobId), eq(studioJobs.userId, userId)))
			.limit(1);
		if (
			!job ||
			job.status === "completed" ||
			job.status === "partial" ||
			job.status === "failed"
		)
			return;

		const workerId = crypto.randomUUID();
		const claimed = await claimStudioJob(job.id, userId, workerId);
		if (!claimed) return;
		const pipelineStart = Date.now();

		const [project] = await db
			.select()
			.from(studioProjects)
			.where(
				and(
					eq(studioProjects.id, projectId),
					eq(studioProjects.userId, userId),
				),
			)
			.limit(1);
		if (!project) {
			await db
				.update(studioJobs)
				.set({
					status: "failed",
					error: "Project tidak ditemukan",
					updatedAt: new Date(),
				})
				.where(eq(studioJobs.id, jobId));
			return;
		}

		const logoUrl = project.logoAssetId
			? buildStudioAssetUrl(project.logoAssetId, userId)
			: null;
		const designMode = validateStudioDesignMode(project.designMode);
		const dsTokens = extractDesignSystemTokens(project.designMd);

		const existingFrames = await db
			.select()
			.from(studioFrames)
			.where(eq(studioFrames.projectId, projectId))
			.orderBy(asc(studioFrames.order));

		const framesToProcess: StudioFrameRow[] = [...existingFrames];

		const needsPlanning =
			framesToProcess.length === 0 ||
			framesToProcess.some((frame) => isTemporarySlot(frame));

		let designBlueprint: StudioDesignBlueprint | null = null;

		if (needsPlanning) {
			const planningStart = Date.now();
			const planning = await planStudioScreens(job, project, designMode);
			if (!planning) return;
			const { screenPlan } = planning;
			designBlueprint = planning.designBlueprint;

			await db
				.update(studioProjects)
				.set({
					...(screenPlan.projectTitle &&
					screenPlan.projectTitle !== project.title
						? { title: screenPlan.projectTitle.slice(0, 200) }
						: {}),
					designBlueprint,
					updatedAt: new Date(),
				})
				.where(eq(studioProjects.id, projectId));

			const persisted = await persistStudioPlannedFrames(
				projectId,
				userId,
				screenPlan.screens,
			);
			framesToProcess.length = 0;
			framesToProcess.push(...persisted);
			// Planning may outlive the lease; verify ownership before generation.
			const stillOwnerAfterPlanning = await refreshStudioJobLease(
				jobId,
				workerId,
			);
			if (!stillOwnerAfterPlanning) return;
			console.info(
				JSON.stringify({
					scope: "studio",
					stage: "planning",
					durationMs: Date.now() - planningStart,
					projectId,
					jobId,
				}),
			);
		}

		await db
			.update(studioJobs)
			.set({ status: "generating", updatedAt: new Date() })
			.where(and(eq(studioJobs.id, jobId), eq(studioJobs.claimedBy, workerId)));

		const allScreenNames = framesToProcess.map((f) => f.name);
		const framesStart = Date.now();

		const frameResults = await runWithConcurrency(
			framesToProcess.map(
				(frame) => () =>
					generateInitialFrame({
						frame,
						jobPrompt: job.prompt,
						allScreenNames,
						designSkillId: project.designSkillId,
						designMd: project.designMd,
						logoUrl,
						dsTokens,
						blueprint: designBlueprint ?? project.designBlueprint,
						prdContent: project.prdContent,
						lease: { jobId, workerId },
					}),
			),
			STUDIO_FRAME_CONCURRENCY,
		);

		let readyCount = 0;
		let firstReadyHtml: string | null = null;
		for (const result of frameResults) {
			if (result.ok) {
				readyCount++;
				if (!firstReadyHtml) firstReadyHtml = result.htmlCode;
			}
		}

		const failedCount = frameResults.length - readyCount;
		console.info(
			JSON.stringify({
				scope: "studio",
				stage: "frames",
				durationMs: Date.now() - framesStart,
				projectId,
				jobId,
				ready: readyCount,
				failed: failedCount,
				concurrency: STUDIO_FRAME_CONCURRENCY,
			}),
		);

		// Do not finalize after lease handoff or project deletion.
		const stillOwner = await refreshStudioJobLease(jobId, workerId);
		if (!stillOwner) return;
		const [projectStillThere] = await db
			.select({ id: studioProjects.id })
			.from(studioProjects)
			.where(
				and(
					eq(studioProjects.id, projectId),
					eq(studioProjects.userId, userId),
				),
			)
			.limit(1);
		if (!projectStillThere) return;

		if (readyCount > 0 && firstReadyHtml) {
			const existingRev = await db
				.select()
				.from(studioRevisions)
				.where(eq(studioRevisions.projectId, projectId))
				.limit(1);

			if (existingRev.length === 0) {
				await db.insert(studioRevisions).values({
					projectId,
					prompt: job.prompt,
					htmlCode: firstReadyHtml,
					version: 1,
				} satisfies InsertStudioRevisionRow);
			}

			await db
				.update(studioJobs)
				.set({
					status:
						readyCount === framesToProcess.length ? "completed" : "partial",
					finishedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(
					and(eq(studioJobs.id, jobId), eq(studioJobs.claimedBy, workerId)),
				);
			console.info(
				JSON.stringify({
					scope: "studio",
					stage: "complete",
					durationMs: Date.now() - pipelineStart,
					projectId,
					jobId,
					ready: readyCount,
					failed: failedCount,
				}),
			);
		} else {
			await db
				.update(studioJobs)
				.set({
					status: "failed",
					error: "Semua frame gagal digenerate.",
					finishedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(
					and(eq(studioJobs.id, jobId), eq(studioJobs.claimedBy, workerId)),
				);
		}

		await db
			.update(studioProjects)
			.set({ updatedAt: new Date() })
			.where(eq(studioProjects.id, projectId));
	} catch (pipelineErr) {
		const errorMsg =
			pipelineErr instanceof Error ? pipelineErr.message : "Pipeline error";
		await db
			.update(studioJobs)
			.set({
				status: "failed",
				error: errorMsg,
				finishedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(studioJobs.id, jobId));
	} finally {
		activeStudioJobs.delete(jobId);
		const queued = await db
			.select()
			.from(studioJobs)
			.where(
				and(
					eq(studioJobs.userId, userId),
					eq(studioJobs.projectId, projectId),
					eq(studioJobs.status, "queued"),
				),
			)
			.orderBy(asc(studioJobs.createdAt))
			.limit(1);
		if (queued[0] && queued[0].id !== jobId)
			void runStudioJobPipeline(queued[0].id, projectId, userId);
	}
}
