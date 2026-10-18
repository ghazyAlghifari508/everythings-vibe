import { createServerFn } from "@tanstack/react-start";
import type { StudioHistoryItem } from "@/features/studio/types/studio";
import { requireUserServer } from "@/lib/session";

export const loadStudioHistory = createServerFn({ method: "GET" }).handler(
	async (): Promise<{ history: StudioHistoryItem[] }> => {
		const user = await requireUserServer();
		const { listStudioProjects } = await import(
			"@/features/studio/services/studio-project-lifecycle"
		);
		const rows = await listStudioProjects(user.id);
		return {
			history: rows.map((row) => ({
				id: row.id,
				title: row.title,
				designMode: row.designMode,
				hasDesignMd: Boolean(row.designMd),
				hasLogo: Boolean(row.logoAssetId),
				createdAt: row.createdAt.toISOString(),
			})),
		};
	},
);
