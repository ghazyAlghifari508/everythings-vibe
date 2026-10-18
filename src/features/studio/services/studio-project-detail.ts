import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
	studioFrames,
	studioJobs,
	studioProjects,
	studioRevisions,
} from "@/db/schema";
import { ScrapeError } from "@/lib/design-errors";
import type { StudioProjectFullDetail } from "../types/studio-service";
import { recoverStalledStudioJobs } from "./studio-job-lease";
import { runStudioJobPipeline } from "./studio-job-pipeline";
import { buildStudioAssetUrl } from "./studio-logo-service";

export async function getStudioProjectDetail(
	projectId: string,
	userId: string,
): Promise<StudioProjectFullDetail> {
	const [project] = await db
		.select()
		.from(studioProjects)
		.where(
			and(eq(studioProjects.id, projectId), eq(studioProjects.userId, userId)),
		)
		.limit(1);

	if (!project)
		throw new ScrapeError("WEBSITE_BLOCKED", "Studio tidak ditemukan.");

	let frames = await db
		.select()
		.from(studioFrames)
		.where(eq(studioFrames.projectId, projectId))
		.orderBy(asc(studioFrames.order));

	const revisions = await db
		.select()
		.from(studioRevisions)
		.where(eq(studioRevisions.projectId, projectId))
		.orderBy(desc(studioRevisions.version));

	const latest = revisions[0] ?? null;

	if (frames.length === 0 && latest) {
		frames = [
			{
				id: `legacy-${project.id}`,
				projectId: project.id,
				name: project.title,
				description: "Main screen",
				viewport: project.designMode,
				htmlCode: latest.htmlCode,
				status: "ready",
				order: 0,
				error: null,
				attempts: 0,
				visualHash: null,
				promptHash: null,
				createdAt: latest.createdAt,
				updatedAt: latest.createdAt,
			},
		];
	}

	const jobs = await db
		.select()
		.from(studioJobs)
		.where(eq(studioJobs.projectId, projectId))
		.orderBy(desc(studioJobs.createdAt))
		.limit(1);

	const activeJob = jobs[0] ?? null;
	if (
		activeJob &&
		(activeJob.status === "queued" ||
			activeJob.status === "planning" ||
			activeJob.status === "generating")
	) {
		try {
			await recoverStalledStudioJobs();
		} catch (err) {
			console.warn(
				"[studio] stall recovery failed",
				err instanceof Error ? err.message : err,
			);
		}
	}
	const pendingOperations = await db
		.select()
		.from(studioJobs)
		.where(
			and(
				eq(studioJobs.projectId, projectId),
				eq(studioJobs.userId, userId),
				inArray(studioJobs.status, ["queued", "generating"]),
			),
		)
		.orderBy(asc(studioJobs.createdAt))
		.limit(100);
	for (const operation of pendingOperations)
		if (operation.jobType !== "initial")
			void runStudioJobPipeline(operation.id, projectId, userId);

	if (
		activeJob &&
		(activeJob.status === "queued" ||
			((activeJob.status === "planning" || activeJob.status === "generating") &&
				Date.now() - new Date(activeJob.updatedAt).getTime() > 150_000))
	) {
		void runStudioJobPipeline(activeJob.id, projectId, userId);
	}

	const logoUrl = project.logoAssetId
		? buildStudioAssetUrl(project.logoAssetId, userId)
		: null;

	return {
		project,
		frames,
		activeJob,
		logoUrl,
		revisions,
		latest,
	};
}
