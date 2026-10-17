import {
	createFileRoute,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import {
	ScrapeHistoryErrorView,
	ScrapeHistoryPendingView,
	ScrapeHistoryView,
} from "@/features/scrape/components/scrape-history-view";
import {
	deleteScrapeItem,
	loadScrapesHistory,
} from "@/features/scrape/services/scrape-history-loader.functions";
import {
	parseScrapeHistorySearch,
	type ScrapeHistorySearch,
} from "@/features/scrape/types/scrape-contract";
import {
	resolvePageAfterDelete,
	toScrapeHistorySearchParams,
} from "@/features/scrape/utils/scrape-history";

export function validateScrapeHistoryRouteSearch(search: unknown) {
	return toScrapeHistorySearchParams(parseScrapeHistorySearch(search));
}

export const Route = createFileRoute("/design/scrap/history")({
	head: () => ({
		meta: [{ title: "Riwayat Scrape | VibeDesign" }],
	}),
	validateSearch: (search) => validateScrapeHistoryRouteSearch(search),
	loaderDeps: ({ search }) => ({ ...search }),
	loader: async ({ deps }) => {
		try {
			const query = parseScrapeHistorySearch(deps);
			return await loadScrapesHistory({ data: query });
		} catch (e) {
			if (e instanceof Error && e.message === "Unauthorized") {
				const { redirect } = await import("@tanstack/react-router");
				throw redirect({ to: "/login" });
			}
			throw e;
		}
	},
	component: ScrapHistoryPage,
	pendingComponent: ScrapeHistoryPendingView,
	errorComponent: ({ reset }) => (
		<ScrapeHistoryErrorView onReset={() => reset()} />
	),
});

function ScrapHistoryPage() {
	const loaderData = Route.useLoaderData();
	const search = parseScrapeHistorySearch(Route.useSearch());
	const navigate = useNavigate();
	const router = useRouter();

	function handleQueryChange(next: ScrapeHistorySearch) {
		void navigate({ to: ".", search: toScrapeHistorySearchParams(next) });
	}

	async function handleDelete(id: string) {
		await deleteScrapeItem({ data: id });
		const nextPage = resolvePageAfterDelete(
			loaderData.total,
			search.page,
			search.pageSize,
		);
		if (nextPage !== search.page) {
			await navigate({
				to: ".",
				search: (prev) => ({ ...prev, page: nextPage }),
			});
		} else {
			await router.invalidate();
		}
	}

	return (
		<ScrapeHistoryView
			items={loaderData.items}
			total={loaderData.total}
			search={search}
			onQueryChange={handleQueryChange}
			onDelete={handleDelete}
		/>
	);
}
