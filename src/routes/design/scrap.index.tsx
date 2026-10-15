import { createFileRoute } from "@tanstack/react-router";
import { ScrapModeSwitcher } from "@/components/design/scrap-mode-switcher";
import {
	parseScrapeWorkspaceSearch,
	resolveScrapeWorkspaceMode,
} from "@/lib/scrape-contract";

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
		<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
			<main className="flex w-full flex-col items-center justify-center py-6 sm:py-12">
				<div className="w-full max-w-2xl text-center">
					<h1 className="text-3xl font-semibold tracking-tight text-snow sm:text-4xl">
						Website Extraction Workspace
					</h1>
					<p className="mt-3 text-sm leading-6 text-fog">
						Crawl, scrape, dan analisis website publik.
					</p>
				</div>

				<div className="mt-8 w-full">
					<ScrapModeSwitcher initialMode={resolveScrapeWorkspaceMode(search)} />
				</div>
			</main>
		</div>
	);
}
