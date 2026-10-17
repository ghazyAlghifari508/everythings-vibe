import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { StudioLandingPage } from "@/features/studio/components/workspace/studio-landing-page";
import type { StudioHistoryItem } from "@/features/studio/types/studio";
import { requireUserServer } from "@/lib/session";

const loadStudioHistory = createServerFn({ method: "GET" }).handler(
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

export const studioSearchSchema = z.object({
	prompt: z.string().optional(),
	from: z.string().optional(),
});

export const Route = createFileRoute("/design/studio/")({
	head: () => ({
		meta: [{ title: "Prompt UI Studio | VibeDesign" }],
	}),
	validateSearch: (search) => studioSearchSchema.parse(search),
	loader: async () => {
		try {
			return await loadStudioHistory();
		} catch (e) {
			if (e instanceof Error && e.message === "Unauthorized") {
				throw redirect({ to: "/login" });
			}
			throw e;
		}
	},
	component: StudioPage,
});

function StudioPage() {
	const { history } = Route.useLoaderData();
	const search = Route.useSearch();
	return <StudioLandingPage history={history} search={search} />;
}
