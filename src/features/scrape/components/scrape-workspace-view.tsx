import { HubBreadcrumb } from "@/components/home/hub-breadcrumb";
import type { ScrapeMode } from "@/db/schema";
import { ScrapModeSwitcher } from "./scrap-mode-switcher";

export interface ScrapeWorkspaceViewProps {
	initialMode: ScrapeMode;
}

export function ScrapeWorkspaceView({ initialMode }: ScrapeWorkspaceViewProps) {
	return (
		<main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
			<HubBreadcrumb current="VibeScrape" />

			<div className="flex w-full flex-col items-center justify-center pt-2 pb-6 sm:pb-8">
				<header className="w-full max-w-2xl text-center">
					<h1 className="text-2xl font-semibold tracking-tight text-snow sm:text-3xl">
						Ekstrak website
					</h1>
					<p className="mt-2 text-sm leading-6 text-fog">
						Ambil struktur halaman, panduan desain, HTML, atau gambar dari URL
						website.
					</p>
				</header>

				<div className="mt-6 w-full sm:mt-8">
					<ScrapModeSwitcher initialMode={initialMode} />
				</div>
			</div>
		</main>
	);
}
