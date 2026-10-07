import { createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import {
	type ScrapeHistoryItem,
	ScrapeHistoryList,
} from "@/components/design/scrape-history-list";
import { requireUserServer } from "@/lib/session";

const loadScrapesHistory = createServerFn({ method: "GET" }).handler(
	async (): Promise<{ items: ScrapeHistoryItem[] }> => {
		const user = await requireUserServer();
		const { listScrapes } = await import("@/lib/services/scrape-service");
		const rows = await listScrapes(user.id);
		return {
			items: rows.map((row) => ({
				id: row.id,
				sourceUrl: row.sourceUrl,
				domain: row.domain,
				title: row.title,
				status: row.status,
				createdAt: row.createdAt.toISOString(),
			})),
		};
	},
);

const deleteScrapeItem = createServerFn({ method: "POST" })
	.validator((id: string) => id)
	.handler(async ({ data: id }): Promise<{ ok: true }> => {
		const user = await requireUserServer();
		const { deleteScrape } = await import("@/lib/services/scrape-service");
		return deleteScrape(id, user.id);
	});

export const Route = createFileRoute("/design/scrap/history")({
	head: () => ({
		meta: [{ title: "Riwayat Scrape | VibeDesign" }],
	}),
	loader: async () => loadScrapesHistory(),
	component: ScrapHistoryPage,
});

function ScrapHistoryPage() {
	const { items } = Route.useLoaderData();
	const router = useRouter();

	async function handleDelete(id: string) {
		await deleteScrapeItem({ data: id });
		await router.invalidate();
	}

	return (
		<div className="flex w-full flex-col gap-6 py-4">
			<header className="max-w-2xl">
				<h1 className="text-2xl font-semibold tracking-tight text-snow sm:text-3xl">
					Riwayat Scrape
				</h1>
				<p className="mt-2 text-sm leading-6 text-fog">
					Daftar website yang pernah kamu scrap menjadi index.html dan design.md.
				</p>
			</header>

			<ScrapeHistoryList initialItems={items} onDelete={handleDelete} />
		</div>
	);
}
