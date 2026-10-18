import { createServerFn } from "@tanstack/react-start";
import type { ScrapeDesignSource } from "@/features/scrape/services/scrape-design-md-service";
import type { StudioHistoryItem } from "@/features/studio/types/studio";
import { requireUserServer } from "@/lib/session";

export const loadStudioHistory = createServerFn({ method: "GET" }).handler(
	async (): Promise<{
		history: StudioHistoryItem[];
		scrapeSources: ScrapeDesignSource[];
	}> => {
		const user = await requireUserServer();
		const { listStudioProjects } = await import(
			"@/features/studio/services/studio-project-lifecycle"
		);
		const { listScrapeDesignSources } = await import(
			"@/features/scrape/services/scrape-design-md-service"
		);
		const [rows, scrapeSources] = await Promise.all([
			listStudioProjects(user.id),
			listScrapeDesignSources(user.id),
		]);
		return {
			history: rows.map((row) => ({
				id: row.id,
				title: row.title,
				designMode: row.designMode,
				hasDesignMd: Boolean(row.designMd),
				hasLogo: Boolean(row.logoAssetId),
				createdAt: row.createdAt.toISOString(),
			})),
			scrapeSources,
		};
	},
);
