import { createFileRoute, redirect } from "@tanstack/react-router";
import { parseScrapeHistorySearch } from "@/features/scrape/types/scrape-contract";
import { toScrapeHistorySearchParams } from "@/features/scrape/utils/scrape-history";

export const Route = createFileRoute("/design/scrap/history")({
	validateSearch: (search) =>
		toScrapeHistorySearchParams(parseScrapeHistorySearch(search)),
	beforeLoad: ({ search, location }) => {
		throw redirect({
			to: "/scrape/history",
			search: toScrapeHistorySearchParams(parseScrapeHistorySearch(search)),
			hash: location.hash,
			replace: true,
		});
	},
});
