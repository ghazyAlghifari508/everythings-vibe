import { createFileRoute } from "@tanstack/react-router";
import {
	ScrapeDetailErrorView,
	ScrapeDetailView,
} from "@/features/scrape/components/scrape-detail-view";
import { loadScrapeDetail } from "@/features/scrape/services/scrape-detail-loader.functions";
import { parseScrapeHistorySearch } from "@/features/scrape/types/scrape-contract";
import { toScrapeHistorySearchParams } from "@/features/scrape/utils/scrape-history";
import { parseScrapeReturnSearch } from "@/features/scrape/utils/scrape-return-path";

export const Route = createFileRoute("/scrape/$id")({
	head: () => ({
		meta: [{ title: "Hasil Scrape | VibeDesign" }],
	}),
	validateSearch: (search) => ({
		...parseScrapeReturnSearch(search),
		...toScrapeHistorySearchParams(parseScrapeHistorySearch(search)),
	}),
	loader: async ({ params }) => {
		try {
			return await loadScrapeDetail({ data: params.id });
		} catch (e) {
			if (e instanceof Error && e.message === "Unauthorized") {
				const { redirect } = await import("@tanstack/react-router");
				throw redirect({ to: "/login" });
			}
			throw e;
		}
	},
	component: ScrapeDetailPage,
	errorComponent: ScrapeDetailErrorView,
});

function ScrapeDetailPage() {
	const initial = Route.useLoaderData();
	const { id } = Route.useParams();
	const rawSearch = Route.useSearch();
	const { from } = rawSearch;
	const history = parseScrapeHistorySearch(rawSearch);

	if (!initial) throw new Error("NOT_FOUND");

	return (
		<ScrapeDetailView id={id} initial={initial} from={from} history={history} />
	);
}
