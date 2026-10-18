import { createFileRoute, redirect } from "@tanstack/react-router";
import { parseScrapeWorkspaceSearch } from "@/features/scrape/types/scrape-contract";

export const Route = createFileRoute("/design/scrap/")({
	validateSearch: parseScrapeWorkspaceSearch,
	beforeLoad: ({ search, location }) => {
		throw redirect({
			to: "/scrape",
			search: parseScrapeWorkspaceSearch(search),
			hash: location.hash,
			replace: true,
		});
	},
});
