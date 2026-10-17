import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { studioProjects, studioRevisions } from "@/db/schema";
import { ScrapeError } from "@/lib/design-errors";
import type { StudioProjectDetail } from "../types/studio-service";
import { buildStudioAssetUrl } from "./studio-logo-service";

export async function getStudioProject(
	projectId: string,
	userId: string,
): Promise<StudioProjectDetail> {
	const [project] = await db
		.select()
		.from(studioProjects)
		.where(
			and(eq(studioProjects.id, projectId), eq(studioProjects.userId, userId)),
		)
		.limit(1);

	if (!project)
		throw new ScrapeError("WEBSITE_BLOCKED", "Studio tidak ditemukan.");

	const revisions = await db
		.select()
		.from(studioRevisions)
		.where(eq(studioRevisions.projectId, projectId))
		.orderBy(desc(studioRevisions.version));

	const logoUrl = project.logoAssetId
		? buildStudioAssetUrl(project.logoAssetId, userId)
		: null;

	return {
		...project,
		revisions,
		latest: revisions[0] ?? null,
		logoUrl,
	};
}
