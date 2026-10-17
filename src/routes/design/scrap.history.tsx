import {
	createFileRoute,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type { ScrapeHistoryItem } from "@/features/scrape/components/scrape-history-list";
import {
	ScrapeHistoryErrorView,
	ScrapeHistoryPendingView,
	ScrapeHistoryView,
} from "@/features/scrape/components/scrape-history-view";
import {
	parseScrapeHistorySearch,
	resolveScrapeHistoryOffset,
	type ScrapeHistorySearch,
} from "@/features/scrape/types/scrape-contract";
import {
	clampHistoryPage,
	historyTotalPages,
	resolvePageAfterDelete,
	toScrapeHistorySearchParams,
} from "@/features/scrape/utils/scrape-history";
import { requireUserServer } from "@/lib/session";

export interface ScrapeHistoryLoaderData {
	items: ScrapeHistoryItem[];
	total: number;
	page: number;
	pageSize: number;
	sort: ScrapeHistorySearch["sort"];
	mode?: ScrapeHistorySearch["mode"];
	status?: ScrapeHistorySearch["status"];
	q: string;
}

const loadScrapesHistory = createServerFn({ method: "GET" })
	.validator((data: unknown) => parseScrapeHistorySearch(data))
	.handler(async ({ data }): Promise<ScrapeHistoryLoaderData> => {
		const user = await requireUserServer();
		const { listScrapeHistory } = await import(
			"@/features/scrape/services/scrape-service"
		);
		const filters = {
			mode: data.mode,
			status: data.status,
			search: data.q,
			sort: data.sort,
		};
		const first = await listScrapeHistory(user.id, {
			...filters,
			...resolveScrapeHistoryOffset(data),
		});
		const page = clampHistoryPage(
			data.page,
			historyTotalPages(first.total, data.pageSize),
		);
		const settled =
			page === data.page
				? first
				: await listScrapeHistory(user.id, {
						...filters,
						limit: data.pageSize,
						offset: (page - 1) * data.pageSize,
					});
		return {
			items: settled.items.map((row) => ({
				id: row.id,
				sourceUrl: row.sourceUrl,
				domain: row.domain,
				title: row.title,
				status: row.status,
				mode: row.mode,
				imageCounts: row.imageCounts,
				createdAt: row.createdAt.toISOString(),
			})),
			total: settled.total,
			page,
			pageSize: data.pageSize,
			sort: data.sort,
			...(data.mode ? { mode: data.mode } : {}),
			...(data.status ? { status: data.status } : {}),
			q: data.q,
		};
	});

const deleteScrapeItem = createServerFn({ method: "POST" })
	.validator((id: string) => id)
	.handler(async ({ data: id }): Promise<{ ok: true }> => {
		const user = await requireUserServer();
		const { deleteScrape } = await import(
			"@/features/scrape/services/scrape-service"
		);
		return deleteScrape(id, user.id);
	});

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
