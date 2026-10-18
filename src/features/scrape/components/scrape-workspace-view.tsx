import type { ScrapeMode } from "@/db/schema";
import { ScrapModeSwitcher } from "./scrap-mode-switcher";

export interface ScrapeWorkspaceViewProps {
	initialMode: ScrapeMode;
}

export function ScrapeWorkspaceView({ initialMode }: ScrapeWorkspaceViewProps) {
	return (
		<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
			<main className="flex w-full flex-col items-center justify-center py-6 sm:py-12">
				<div className="w-full max-w-2xl text-center">
					<h1 className="text-3xl font-semibold tracking-tight text-snow sm:text-4xl">
						VibeScrape
					</h1>
					<p className="mt-3 text-sm leading-6 text-fog">
						Crawl, scrape, dan analisis website publik.
					</p>
				</div>

				<div className="mt-8 w-full">
					<ScrapModeSwitcher initialMode={initialMode} />
				</div>
			</main>
		</div>
	);
}
