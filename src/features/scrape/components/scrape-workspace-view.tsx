import { HubBreadcrumb } from "@/components/home/hub-breadcrumb";
import type { ScrapeMode } from "@/db/schema";
import { ScrapModeSwitcher } from "./scrap-mode-switcher";

export interface ScrapeWorkspaceViewProps {
	initialMode: ScrapeMode;
	mode?: ScrapeMode;
	onModeChange?: (mode: ScrapeMode) => void;
}

export function ScrapeWorkspaceView({
	initialMode,
	mode,
	onModeChange,
}: ScrapeWorkspaceViewProps) {
	return (
		<main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
			{/* The breadcrumb shares the max-w-3xl column with the form so its left edge lines up with the form, not the wider page shell. */}
			<div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
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
						<ScrapModeSwitcher
							initialMode={initialMode}
							mode={mode}
							onModeChange={onModeChange}
						/>
					</div>
				</div>
			</div>
		</main>
	);
}
