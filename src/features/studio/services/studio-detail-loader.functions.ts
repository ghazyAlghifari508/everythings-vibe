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
		const detail = await getStudioProjectDetail(id, user.id);
		return {
			project: detail.project,
			frames: detail.frames,
			activeJob: detail.activeJob,
			logoUrl: detail.logoUrl,
			revisions: detail.revisions,
			latest: detail.latest,
		};
	});
