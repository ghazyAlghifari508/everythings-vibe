import {
	createFileRoute,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type { ScrapeHistoryItem } from "@/components/design/scrape-history-list";
import { ScrapeHistoryList } from "@/components/design/scrape-history-list";
import {
	parseScrapeHistorySearch,
	resolveScrapeHistoryOffset,
	type ScrapeHistorySearch,
} from "@/lib/scrape-contract";
import {
	clampHistoryPage,
	historyTotalPages,
	resolvePageAfterDelete,
	toScrapeHistorySearchParams,
} from "@/lib/scrape-history";
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
		const { listScrapeHistory } = await import("@/lib/services/scrape-service");
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
		const { deleteScrape } = await import("@/lib/services/scrape-service");
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
	pendingComponent: ScrapHistoryPending,
	errorComponent: ({ reset }) => (
		<main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
			<div
				role="alert"
				className="rounded-xl border border-graphite bg-charcoal p-8 text-center"
			>
				<h1 className="text-base font-semibold text-snow">
					Riwayat scrape gagal dimuat
				</h1>
				<p className="mx-auto mt-1 max-w-md text-sm leading-6 text-fog">
					Periksa koneksi lalu coba muat ulang daftar riwayat scrape.
				</p>
				<button
					type="button"
					onClick={() => reset()}
					className="mt-4 min-h-11 rounded-lg border border-graphite px-4 text-sm font-medium text-snow transition-colors hover:bg-onyx focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					Coba lagi
				</button>
			</div>
		</main>
	),
});

function ScrapHistoryPending() {
	return (
		<main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
			<output className="sr-only">Memuat riwayat scrape...</output>
			<div aria-hidden="true" className="flex w-full flex-col gap-6 py-4">
				<div className="max-w-2xl">
					<div className="h-8 w-48 animate-pulse rounded-lg bg-onyx" />
					<div className="mt-2 h-4 w-80 animate-pulse rounded-md bg-onyx" />
				</div>
				<div className="h-11 w-full animate-pulse rounded-lg bg-onyx" />
				<div className="flex gap-2">
					<div className="h-8 w-20 animate-pulse rounded-lg bg-onyx" />
					<div className="h-8 w-20 animate-pulse rounded-lg bg-onyx" />
					<div className="h-8 w-24 animate-pulse rounded-lg bg-onyx" />
				</div>
				<div className="flex flex-col gap-2.5">
					<div className="h-20 animate-pulse rounded-xl bg-onyx" />
					<div className="h-20 animate-pulse rounded-xl bg-onyx" />
					<div className="h-20 animate-pulse rounded-xl bg-onyx" />
				</div>
			</div>
		</main>
	);
}

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
		<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
			<div className="flex w-full flex-col gap-6 py-4">
				<header className="max-w-2xl">
					<h1 className="text-2xl font-semibold tracking-tight text-snow sm:text-3xl">
						Riwayat Scrape
					</h1>
					<p className="mt-2 text-sm leading-6 text-fog">
						Temukan dan kelola hasil ekstraksi website.
					</p>
				</header>

				<ScrapeHistoryList
					items={loaderData.items}
					total={loaderData.total}
					search={search}
					onQueryChange={handleQueryChange}
					onDelete={handleDelete}
				/>
			</div>
		</div>
	);
}
