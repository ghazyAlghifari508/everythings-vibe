import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Globe, Sparkles } from "lucide-react";
import { HubBreadcrumb } from "@/components/home/hub-breadcrumb";

export const Route = createFileRoute("/design/")({
	head: () => ({
		meta: [
			{ title: "VibeDesign Studio | VibeEverything" },
			{
				name: "description",
				content:
					"Rancang antarmuka HTML/Tailwind dari prompt dengan canvas interaktif dan preview responsif.",
			},
		],
	}),
	component: DesignPage,
});

const OPTIONS = [
	{
		icon: Sparkles,
		title: "VibeDesign Studio",
		description:
			"Buat dan revisi antarmuka HTML/Tailwind dari prompt di canvas interaktif dengan preview desktop, tablet, dan mobile.",
		to: "/design/studio",
		action: "Buka Studio",
	},
	{
		icon: Globe,
		title: "VibeScrape",
		description:
			"Butuh ekstraksi website publik? Buka VibeScrape, produk terpisah untuk mengambil HTML, token desain, dan aset gambar.",
		to: "/scrape",
		action: "Buka VibeScrape",
	},
] as const;

function DesignPage() {
	return (
		<main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
			<HubBreadcrumb current="VibeDesign Studio" />

			<header className="mx-auto max-w-2xl text-center">
				<h1 className="text-3xl font-semibold tracking-tight text-snow sm:text-4xl">
					Rancang antarmuka dari prompt di Studio
				</h1>
				<p className="mt-3 text-sm leading-6 text-fog">
					Buat antarmuka HTML/Tailwind, periksa preview responsif, lalu revisi
					desain di canvas interaktif.
				</p>
			</header>

			<section className="grid gap-4 sm:grid-cols-2">
				{OPTIONS.map((item) => {
					const Icon = item.icon;
					return (
						<Link
							key={item.title}
							to={item.to}
							className="group flex flex-col gap-4 rounded-xl border border-graphite bg-charcoal p-7 transition-colors hover:border-steel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
						>
							<span className="flex h-10 w-10 items-center justify-center rounded-lg border border-graphite bg-onyx text-snow">
								<Icon size={20} aria-hidden />
							</span>
							<span>
								<span className="block text-lg font-semibold text-snow">
									{item.title}
								</span>
								<span className="mt-1 block text-sm leading-6 text-fog">
									{item.description}
								</span>
							</span>
							<span className="inline-flex items-center gap-1 text-sm font-semibold text-snow">
								{item.action}
								<ArrowRight
									size={16}
									aria-hidden
									className="transition-transform group-hover:translate-x-1"
								/>
							</span>
						</Link>
					);
				})}
			</section>
		</main>
	);
}
