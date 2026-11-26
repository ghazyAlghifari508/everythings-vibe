import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
	studioFrames,
	studioJobs,
	studioProjects,
	studioRevisions,
} from "@/db/schema";
import { ScrapeError } from "@/lib/design-errors";
import type { StudioProjectFullDetail } from "../types/studio-service";
import { buildStudioAssetUrl } from "./studio-logo-service";

export async function getStudioProjectDetail(
	projectId: string,
	userId: string,
): Promise<StudioProjectFullDetail> {
	// Planning replaces slots atomically; every row in a poll must see that same commit.
	return db.transaction(
		async (tx) => {
			const [project] = await tx
				.select()
				.from(studioProjects)
				.where(
					and(
						eq(studioProjects.id, projectId),
						eq(studioProjects.userId, userId),
					),
				)
				.limit(1);

			if (!project)
				throw new ScrapeError("WEBSITE_BLOCKED", "Studio tidak ditemukan.");

			let frames = await tx
				.select()
				.from(studioFrames)
				.where(eq(studioFrames.projectId, projectId))
				.orderBy(asc(studioFrames.order));

			const revisions = await tx
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

			const jobs = await tx
				.select()
				.from(studioJobs)
				.where(
					and(
						eq(studioJobs.projectId, projectId),
						eq(studioJobs.userId, userId),
					),
				)
				.orderBy(desc(studioJobs.createdAt), desc(studioJobs.id))
				.limit(1);

			const activeJob = jobs[0] ?? null;

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
		},
		{ isolationLevel: "repeatable read", accessMode: "read only" },
	);
}
