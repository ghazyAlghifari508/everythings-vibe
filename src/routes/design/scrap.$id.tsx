import { createFileRoute, redirect } from "@tanstack/react-router";
import { parseScrapeHistorySearch } from "@/features/scrape/types/scrape-contract";
import { toScrapeHistorySearchParams } from "@/features/scrape/utils/scrape-history";
import { parseScrapeReturnSearch } from "@/features/scrape/utils/scrape-return-path";

export const Route = createFileRoute("/design/scrap/$id")({
	validateSearch: (search) => ({
		...parseScrapeReturnSearch(search),
		...toScrapeHistorySearchParams(parseScrapeHistorySearch(search)),
	}),
	beforeLoad: ({ params, search, location }) => {
		throw redirect({
			to: "/scrape/$id",
			params: { id: params.id },
			search: {
				...parseScrapeReturnSearch(search),
				...toScrapeHistorySearchParams(parseScrapeHistorySearch(search)),
			},
			hash: location.hash,
			replace: true,
		});
	},
});
