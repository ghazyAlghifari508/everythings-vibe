import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { StudioLandingPage } from "@/features/studio/components/workspace/studio-landing-page";
import { loadStudioHistory } from "@/features/studio/services/studio-history-loader.functions";

export const studioSearchSchema = z.object({
	prompt: z.string().optional(),
	from: z.string().optional(),
});

export const Route = createFileRoute("/design/")({
	head: () => ({
		meta: [
			{ title: "Prompt UI Studio | VibeDesign" },
			{
				name: "description",
				content:
					"Rancang antarmuka HTML/Tailwind dari prompt dengan canvas interaktif dan preview responsif.",
			},
		],
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
	const { history, scrapeSources } = Route.useLoaderData();
	const search = Route.useSearch();
	return (
		<StudioLandingPage
			history={history}
			scrapeSources={scrapeSources}
			search={search}
		/>
	);
}
