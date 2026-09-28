import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { HubBreadcrumb } from "@/components/home/hub-breadcrumb";
import {
	HtmlScraper,
	type ScrapeHistoryItem,
} from "@/components/design/html-scraper";
import { requireUserServer } from "@/lib/session";

const loadScrapeHistory = createServerFn({ method: "GET" }).handler(
	async (): Promise<{ history: ScrapeHistoryItem[] }> => {
		const user = await requireUserServer();
		const { listScrapes } = await import("@/lib/services/scrape-service");
		const rows = await listScrapes(user.id);
		return {
			history: rows.map((row) => ({
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

export const Route = createFileRoute("/design/scrap/")({
	head: () => ({
		meta: [{ title: "Scrap HTML & design.md | VibeDesign" }],
	}),
	loader: async () => loadScrapeHistory(),
	component: ScrapPage,
});

function ScrapPage() {
	const { history } = Route.useLoaderData();
	return (
		<main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
			<HubBreadcrumb current="Scrap HTML & design.md" />
			<header className="max-w-2xl">
				<h1 className="text-3xl font-semibold tracking-tight text-snow sm:text-4xl">
					Scrap website menjadi 2 file siap pakai
				</h1>
				<p className="mt-3 text-sm leading-6 text-fog">
					Masukkan URL website live. Sistem menyerap HTML-nya, menulis
					design.md setara audit desainer senior, dan menyiapkan preview
					desktop 1440px yang bisa disalin atau diunduh sebagai ZIP.
				</p>
			</header>
			<HtmlScraper history={history} />
		</main>
	);
}
