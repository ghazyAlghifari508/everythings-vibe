import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { studioFrames, studioJobs, studioProjects } from "@/db/schema";
import { STUDIO_FRAME_CONCURRENCY } from "../types/studio-constants";
import { isTemporarySlot } from "../utils/studio-lifecycle";
import { extractDesignSystemTokens } from "./studio-design-tokens";
import {
	studioFrameErrorCodeFor,
	studioFrameFailureCategory,
} from "./studio-frame-errors";
import { runWithConcurrency } from "./studio-frame-generation";
import { runStudioFrameOperation } from "./studio-frame-operation";
import { generateInitialFrame } from "./studio-initial-frame";
import {
	claimStudioJob,
	refreshStudioJobLease,
	type StudioJobClaim,
	StudioLeaseLostError,
	withStudioJobWrite,
} from "./studio-job-lease";
import { studioJobTiming, withStudioHeartbeat } from "./studio-job-runtime";
import { buildStudioAssetUrl } from "./studio-logo-service";
import {
	persistStudioPlannedFrames,
	planStudioScreens,
} from "./studio-planning";
import { resolveStudioProjectTitle } from "./studio-project-title";
import { validateStudioDesignMode } from "./studio-prompt-validation";
import type { StudioWorkerExecution } from "./studio-worker-scheduler";

export async function runStudioJobPipeline(
	jobId: string,
	projectId: string,
	userId: string,
	shutdownSignal?: AbortSignal,
	execution?: StudioWorkerExecution,
): Promise<void> {
	const workerId = crypto.randomUUID();
	const acquisitionStartedAt = Date.now();
	const job = await claimStudioJob(jobId, userId, workerId);
	studioJobTiming("job-acquire", acquisitionStartedAt, { jobId, projectId });
	if (!job || job.projectId !== projectId || !job.leaseExpiresAt) return;
	const claim: StudioJobClaim = { jobId, projectId, userId, workerId };
	const startedAt = Date.now();
	// A failure before the shared blueprint exists is a planning failure, not a
	// screen failure: the recovery the user needs is the whole plan, not one frame.
	let sharedPlanningCompleted = false;
	studioJobTiming("queue-wait", job.createdAt.getTime(), {
		jobId,
		projectId,
		attempt: job.attempts,
	});
	try {
		await withStudioHeartbeat(
			() => refreshStudioJobLease(jobId, workerId),
			async (signal) => {
				if (job.jobType !== "initial") {
					if (execution)
						await execution.runModel(
							() => runStudioFrameOperation(job, claim, signal),
							signal,
						);
					else await runStudioFrameOperation(job, claim, signal);
					return;
				}
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
				if (!project) throw new StudioLeaseLostError();
				const logoUrl = project.logoAssetId
					? buildStudioAssetUrl(project.logoAssetId, userId)
					: null;
				const designMode = validateStudioDesignMode(project.designMode);
				const dsTokens = extractDesignSystemTokens(project.designMd);
				studioJobTiming("project-context", Date.now(), {
					jobId,
					projectId,
					referenceChars: project.designMd?.length ?? 0,
					prdChars: project.prdContent?.length ?? 0,
				});
				let frames = await db
					.select()
					.from(studioFrames)
					.where(
						and(
							eq(studioFrames.projectId, projectId),
							eq(studioFrames.originJobId, jobId),
						),
					)
					.orderBy(asc(studioFrames.order));
				let blueprint = project.designBlueprint;
				// Planning runs only for slots this job still owns and the planner has not
				// named. Frames from other jobs cannot mask provisional slots because the
				// query above is scoped by origin, and a completed plan is never re-run.
				if (
					!job.planningCompletedAt &&
					(frames.length === 0 || frames.some(isTemporarySlot))
				) {
					const planningStartedAt = Date.now();
					const plan = () =>
						planStudioScreens(job, project, designMode, claim, signal);
					const planning = execution
						? await execution.runModel(plan, signal)
						: await plan();
					signal.throwIfAborted();
					blueprint = planning.designBlueprint;
					const plannedTitle = resolveStudioProjectTitle({
						candidate: planning.screenPlan.projectTitle,
						productName: planning.designBlueprint.productIdentity.productName,
						prompt: job.prompt,
					});
					frames = await withStudioJobWrite(claim, async (tx) => {
						await tx
							.update(studioProjects)
							.set({
								designBlueprint: planning.designBlueprint,
								updatedAt: new Date(),
							})
							.where(
								and(
									eq(studioProjects.id, projectId),
									eq(studioProjects.userId, userId),
								),
							);
						// Planning names only the projects the system still owns. A rename
						// that landed while this job was planning keeps its name because the
						// provenance check runs in the same statement, not against a value
						// read before the plan was produced.
						await tx
							.update(studioProjects)
							.set({ title: plannedTitle, updatedAt: new Date() })
							.where(
								and(
									eq(studioProjects.id, projectId),
									eq(studioProjects.userId, userId),
									eq(studioProjects.titleSource, "auto"),
								),
							);
						return persistStudioPlannedFrames(
							projectId,
							userId,
							planning.screenPlan.screens,
							tx,
							jobId,
						);
					});
					studioJobTiming("planning", planningStartedAt, { jobId, projectId });
				}
				sharedPlanningCompleted = true;
				await withStudioJobWrite(claim, async (tx) => {
					await tx
						.update(studioJobs)
						.set({
							status: "generating",
							planningCompletedAt: new Date(),
							error: null,
							updatedAt: new Date(),
						})
						.where(eq(studioJobs.id, jobId));
				});
				execution?.notify();
				const frameStartedAt = Date.now();
				const allScreenNames = frames.map((frame) => frame.name);
				const results = await runWithConcurrency(
					frames.map((frame) => async () => {
						const generate = () =>
							generateInitialFrame({
								frame,
								jobPrompt: job.prompt,
								allScreenNames,
								designMd: project.designMd,
								logoUrl,
								dsTokens,
								blueprint,
								prdContent: project.prdContent,
								lease: claim,
								signal,
							});
						const result = execution
							? await execution.runModel(generate, signal)
							: await generate();
						execution?.notify();
						if (result.ok && frame.status !== "ready")
							studioJobTiming("frame-ready", job.createdAt.getTime(), {
								jobId,
								projectId,
								frameId: frame.id,
							});
						return result;
					}),
					STUDIO_FRAME_CONCURRENCY,
				);
				signal.throwIfAborted();
				studioJobTiming("frames", frameStartedAt, { jobId, projectId });
				const ready = results.filter((result) => result.ok);
				const persistenceStartedAt = Date.now();
				await withStudioJobWrite(claim, async (tx) => {
					await tx
						.update(studioJobs)
						.set({
							status:
								ready.length === frames.length
									? "completed"
									: ready.length > 0
										? "partial"
										: "failed",
							error:
								ready.length === 0 ? "Semua frame gagal digenerate." : null,
							claimedBy: null,
							claimedAt: null,
							leaseExpiresAt: null,
							finishedAt: new Date(),
							updatedAt: new Date(),
						})
						.where(eq(studioJobs.id, jobId));
					await tx
						.update(studioProjects)
						.set({ updatedAt: new Date() })
						.where(eq(studioProjects.id, projectId));
				});
				studioJobTiming("persistence", persistenceStartedAt, {
					jobId,
					projectId,
				});
				studioJobTiming("project-completion", job.createdAt.getTime(), {
					jobId,
					projectId,
					code:
						ready.length === frames.length
							? "completed"
							: ready.length > 0
								? "partial"
								: "failed",
				});
			},
			{
				jobId,
				workerId,
				leaseExpiresAt: job.leaseExpiresAt,
				shutdownSignal,
			},
		);
	} catch (failure) {
		// Lease loss and worker shutdown are not failures of the work: recovery owns
		// the job again, so finalising here would discard recoverable frames. A job
		// timeout still holds the lease and is finalised normally.
		const finalizable =
			!(failure instanceof StudioLeaseLostError) ||
			failure.reason === "JOB_TIMEOUT";
		if (finalizable) {
			const failureMessage = sharedPlanningCompleted
				? "Gagal memproses desain. Silakan coba lagi."
				: "Rencana layar belum berhasil disusun. Coba lagi.";
			try {
				await withStudioJobWrite(claim, async (tx) => {
					await tx
						.update(studioFrames)
						.set({
							status: "failed",
							error: failureMessage,
							updatedAt: new Date(),
						})
						.where(
							and(
								eq(studioFrames.projectId, projectId),
								inArray(studioFrames.status, ["queued", "generating"]),
								job.targetFrameId
									? and(
											eq(studioFrames.id, job.targetFrameId),
											eq(studioFrames.revision, job.baseRevision ?? 0),
										)
									: and(
											eq(studioFrames.originJobId, jobId),
											// A screen that already produced HTML is never failed by
											// a sibling's failure; only this job's own ungenerated
											// slots reach the failed state.
											isNull(studioFrames.htmlCode),
										),
							),
						);
					await tx
						.update(studioJobs)
						.set({
							status: "failed",
							error: failureMessage,
							errorCode: studioFrameErrorCodeFor(failure),
							claimedBy: null,
							claimedAt: null,
							leaseExpiresAt: null,
							finishedAt: new Date(),
							updatedAt: new Date(),
						})
						.where(eq(studioJobs.id, jobId));
				});
			} catch (writeFailure) {
				if (!(writeFailure instanceof StudioLeaseLostError)) throw writeFailure;
			}
		}
		studioJobTiming("failure", startedAt, {
			jobId,
			projectId,
			code:
				failure instanceof StudioLeaseLostError
					? failure.reason
					: studioFrameErrorCodeFor(failure),
			category: studioFrameFailureCategory(studioFrameErrorCodeFor(failure)),
		});
	} finally {
		studioJobTiming("job-total", startedAt, {
			jobId,
			projectId,
			attempt: job.attempts,
		});
	}
}
