import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { StudioLandingPage } from "@/features/studio/components/workspace/studio-landing-page";
import { loadStudioHistory } from "@/features/studio/services/studio-history-loader.functions";

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
