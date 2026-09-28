import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Globe, Sparkles } from "lucide-react";
import { HubBreadcrumb } from "@/components/home/hub-breadcrumb";

export const Route = createFileRoute("/design/")({
	head: () => ({
		meta: [
			{ title: "VibeDesign | VibeEverything" },
			{
				name: "description",
				content:
					"Modul perancangan antarmuka VibeDesign..fitur scraping dan Prompt UI Studio direncanakan untuk fase berikutnya.",
			},
		],
	}),
	component: DesignPage,
});

const PLANNED = [
	{
		icon: Globe,
		title: "Scrap HTML & design.md",
		description:
			"Ekstrak URL web live menjadi dua file keluaran: design.md (aturan desain dan token) serta index.html (kode HTML utuh beserta preview 1440px desktop).",
	},
	{
		icon: Sparkles,
		title: "Prompt UI Studio",
		description:
			"Studio antarmuka interaktif: rancang aplikasi web atau mobile hanya lewat prompt teks alami, pilih inspirasi, dan lihat preview interaktif.",
	},
];

function DesignPage() {
	return (
		<main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
			<HubBreadcrumb current="VibeDesign" />

			<header className="mx-auto max-w-2xl text-center">
				<p className="mb-4 inline-flex items-center gap-2 rounded-full border border-graphite bg-charcoal px-3 py-1 font-mono text-xs text-fog">
					Belum tersedia
				</p>
				<h1 className="text-3xl font-semibold tracking-tight text-snow sm:text-4xl">
					Rancang antarmuka dari prompt atau website live
				</h1>
				<p className="mt-3 text-sm leading-6 text-fog">
					VibeDesign belum aktif. Tidak ada scraper maupun studio yang bisa
					dijalankan saat ini, jadi halaman ini tidak menampilkan form, preview,
					atau proses apa pun yang belum benar-benar jalan.
				</p>
			</header>

			<section className="flex flex-col gap-4">
				<h2 className="font-mono text-xs uppercase tracking-widest text-fog">
					Yang direncanakan untuk fase berikutnya
				</h2>
				{PLANNED.map((item) => {
					const Icon = item.icon;
					return (
						<article
							key={item.title}
							className="flex flex-col gap-3 rounded-xl border border-graphite bg-charcoal p-7 sm:flex-row sm:gap-5"
						>
							<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-graphite bg-obsidian text-fog">
								<Icon size={20} aria-hidden />
							</span>
							<div>
								<div className="flex flex-wrap items-center gap-2">
									<h3 className="text-lg font-semibold text-mist">
										{item.title}
									</h3>
									<span className="rounded-md border border-graphite bg-onyx px-2 py-0.5 font-mono text-[11px] text-fog">
										Direncanakan
									</span>
								</div>
								<p className="mt-1 text-sm leading-6 text-fog">
									{item.description}
								</p>
							</div>
						</article>
					);
				})}
			</section>

			<section className="flex flex-col gap-3 rounded-xl border border-graphite bg-charcoal p-7">
				<h2 className="font-mono text-xs uppercase tracking-widest text-fog">
					Yang bisa kamu pakai sekarang
				</h2>
				<Link
					to="/plan"
					className="group flex items-center justify-between gap-4 rounded-lg border border-graphite bg-obsidian p-4 transition-colors hover:border-steel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					<span>
						<span className="block text-base font-semibold text-snow">
							VibePlan
						</span>
						<span className="mt-1 block text-sm text-fog">
							Susun PRD 8 seksi, acceptance criteria, dan task dari ide produk
							hari ini.
						</span>
					</span>
					<ArrowRight
						size={18}
						aria-hidden
						className="shrink-0 text-snow transition-transform group-hover:translate-x-1"
					/>
				</Link>
			</section>
		</main>
	);
}
