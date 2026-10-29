import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
	studioFrames,
	studioJobs,
	studioProjects,
	studioRevisions,
} from "@/db/schema";
import { STUDIO_FRAME_CONCURRENCY } from "../types/studio-constants";
import { extractDesignSystemTokens } from "./studio-design-tokens";
import {
	studioFrameErrorCodeFor,
	studioFrameFailureCategory,
} from "./studio-frame-errors";
import {
	generateInitialFrame,
	isTemporarySlot,
	runWithConcurrency,
} from "./studio-frame-generation";
import { runStudioFrameOperation } from "./studio-frame-operation";
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
import { validateStudioDesignMode } from "./studio-prompt-validation";

export async function runStudioJobPipeline(
	jobId: string,
	projectId: string,
	userId: string,
	shutdownSignal?: AbortSignal,
): Promise<void> {
	const workerId = crypto.randomUUID();
	const acquisitionStartedAt = Date.now();
	const job = await claimStudioJob(jobId, userId, workerId);
	studioJobTiming("job-acquire", acquisitionStartedAt, { jobId, projectId });
	if (!job || job.projectId !== projectId || !job.leaseExpiresAt) return;
	const claim: StudioJobClaim = { jobId, projectId, userId, workerId };
	const startedAt = Date.now();
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
					await runStudioFrameOperation(job, claim, signal);
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
					skillId: project.designSkillId,
					referenceChars: project.designMd?.length ?? 0,
					prdChars: project.prdContent?.length ?? 0,
				});
				let frames = await db
					.select()
					.from(studioFrames)
					.where(eq(studioFrames.projectId, projectId))
					.orderBy(asc(studioFrames.order));
				let blueprint = project.designBlueprint;
				if (frames.length === 0 || frames.some(isTemporarySlot)) {
					const planningStartedAt = Date.now();
					const planning = await planStudioScreens(
						job,
						project,
						designMode,
						claim,
						signal,
					);
					signal.throwIfAborted();
					blueprint = planning.designBlueprint;
					frames = await withStudioJobWrite(claim, async (tx) => {
						await tx
							.update(studioProjects)
							.set({
								...(planning.screenPlan.projectTitle
									? { title: planning.screenPlan.projectTitle.slice(0, 200) }
									: {}),
								designBlueprint: planning.designBlueprint,
								updatedAt: new Date(),
							})
							.where(
								and(
									eq(studioProjects.id, projectId),
									eq(studioProjects.userId, userId),
								),
							);
						return persistStudioPlannedFrames(
							projectId,
							userId,
							planning.screenPlan.screens,
							tx,
						);
					});
					studioJobTiming("planning", planningStartedAt, { jobId, projectId });
				}
				await withStudioJobWrite(claim, async (tx) => {
					await tx
						.update(studioJobs)
						.set({ status: "generating", error: null, updatedAt: new Date() })
						.where(eq(studioJobs.id, jobId));
				});
				const frameStartedAt = Date.now();
				const allScreenNames = frames.map((frame) => frame.name);
				const results = await runWithConcurrency(
					frames.map((frame) => async () => {
						const result = await generateInitialFrame({
							frame,
							jobPrompt: job.prompt,
							allScreenNames,
							designSkillId: project.designSkillId,
							designMd: project.designMd,
							logoUrl,
							dsTokens,
							blueprint,
							prdContent: project.prdContent,
							lease: claim,
							signal,
						});
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
				const first = ready[0];
				const persistenceStartedAt = Date.now();
				await withStudioJobWrite(claim, async (tx) => {
					if (first?.ok) {
						const [existing] = await tx
							.select({ id: studioRevisions.id })
							.from(studioRevisions)
							.where(eq(studioRevisions.projectId, projectId))
							.limit(1);
						if (!existing)
							await tx.insert(studioRevisions).values({
								projectId,
								prompt: job.prompt,
								htmlCode: first.htmlCode,
								version: 1,
							});
					}
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
			try {
				await withStudioJobWrite(claim, async (tx) => {
					await tx
						.update(studioFrames)
						.set({
							status: "failed",
							error: "Pemrosesan terhenti. Silakan coba lagi.",
							updatedAt: new Date(),
						})
						.where(
							and(
								eq(studioFrames.projectId, projectId),
								inArray(studioFrames.status, ["queued", "generating"]),
								job.targetFrameId
									? eq(studioFrames.id, job.targetFrameId)
									: undefined,
							),
						);
					await tx
						.update(studioJobs)
						.set({
							status: "failed",
							error: "Gagal memproses desain. Silakan coba lagi.",
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
