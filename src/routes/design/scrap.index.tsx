import { createFileRoute } from "@tanstack/react-router";
import { ScrapeWorkspaceView } from "@/features/scrape/components/scrape-workspace-view";
import {
	parseScrapeWorkspaceSearch,
	resolveScrapeWorkspaceMode,
} from "@/features/scrape/types/scrape-contract";

export const Route = createFileRoute("/design/scrap/")({
	head: () => ({
		meta: [{ title: "Scrap website | VibeDesign" }],
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
