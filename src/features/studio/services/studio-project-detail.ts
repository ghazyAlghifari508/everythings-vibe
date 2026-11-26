import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
	studioFrames,
	studioJobs,
	studioProjects,
	studioRevisions,
} from "@/db/schema";
import { ScrapeError } from "@/lib/design-errors";
import type { StudioProjectFullDetail } from "../types/studio-service";
import { readStudioConversation } from "./studio-conversation";
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
						originJobId: null,
						initialSlot: null,
						revision: 1,
						lastJobId: null,
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
				.orderBy(
					sql`case when ${studioJobs.status} in ('planning', 'generating') then 0 when ${studioJobs.status} = 'queued' then 1 else 2 end`,
					desc(studioJobs.createdAt),
					desc(studioJobs.id),
				)
				// Live jobs sort first, so the cap only trims old terminal history.
				.limit(100);

			// Live jobs sort first, so `activeJob` is the job the canvas must follow;
			// once everything is terminal it is the newest finished job, which is
			// what the planning-failure and partial-result states read.
			const activeJob = jobs[0] ?? null;

			const logoUrl = project.logoAssetId
				? buildStudioAssetUrl(project.logoAssetId, userId)
				: null;

			return {
				project,
				frames,
				activeJob,
				jobs,
				messages: await readStudioConversation(tx, projectId, userId),
				logoUrl,
				revisions,
				latest,
			};
		},
		{ isolationLevel: "repeatable read", accessMode: "read only" },
	);
}
