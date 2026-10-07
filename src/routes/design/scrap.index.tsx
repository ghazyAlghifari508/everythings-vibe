import { createFileRoute } from "@tanstack/react-router";
import { ScrapModeSwitcher } from "@/components/design/scrap-mode-switcher";

export const Route = createFileRoute("/design/scrap/")({
	head: () => ({
		meta: [{ title: "Scrap website | VibeDesign" }],
	}),
	component: ScrapIndexPage,
});

function ScrapIndexPage() {
	return (
		<main className="flex w-full flex-col items-center justify-center py-6 sm:py-12">
			<div className="w-full max-w-2xl text-center">
				<h1 className="text-3xl font-semibold tracking-tight text-snow sm:text-4xl">
					Scrap website
				</h1>
				<p className="mt-3 text-sm leading-6 text-fog">
					Ambil design system atau HTML dari website publik.
				</p>
			</div>

			<div className="mt-8 w-full">
				<ScrapModeSwitcher />
			</div>
		</main>
	);
}
