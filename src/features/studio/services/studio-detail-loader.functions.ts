import { createServerFn } from "@tanstack/react-start";
import type { StudioDetailLoaderData } from "@/features/studio/types/studio";
import { requireUserServer } from "@/lib/session";

export const loadStudioDetail = createServerFn({ method: "GET" })
	.validator((id: string) => id)
	.handler(async ({ data: id }): Promise<StudioDetailLoaderData> => {
		const user = await requireUserServer();
		const { getStudioProjectDetail } = await import(
			"@/features/studio/services/studio-project-detail"
		);
		const { listScrapeDesignSources } = await import(
			"@/features/scrape/services/scrape-design-md-service"
		);
		const [detail, scrapeSources] = await Promise.all([
			getStudioProjectDetail(id, user.id),
			listScrapeDesignSources(user.id),
		]);
		return {
			project: detail.project,
			frames: detail.frames,
			activeJob: detail.activeJob,
			logoUrl: detail.logoUrl,
			revisions: detail.revisions,
			latest: detail.latest,
			scrapeSources,
		};
	});
