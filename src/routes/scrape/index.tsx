import { createFileRoute } from "@tanstack/react-router";
import { ScrapeWorkspaceView } from "@/features/scrape/components/scrape-workspace-view";
import {
	parseScrapeWorkspaceSearch,
	resolveScrapeWorkspaceMode,
} from "@/features/scrape/types/scrape-contract";

export const Route = createFileRoute("/scrape/")({
	head: () => ({
		meta: [
			{ title: "Scrape website | VibeScrape" },
			{
				name: "description",
				content:
					"Ekstrak HTML, token desain, dan aset gambar dari website publik.",
			},
		],
	}),
	validateSearch: (search) => parseScrapeWorkspaceSearch(search),
	component: ScrapIndexPage,
});

function ScrapIndexPage() {
	const search = Route.useSearch();
	return (
		<ScrapeWorkspaceView initialMode={resolveScrapeWorkspaceMode(search)} />
	);
}
