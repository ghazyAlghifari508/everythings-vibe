import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, LayoutGrid, Library, SquarePen } from "lucide-react";
import { HubBreadcrumb } from "@/components/home/hub-breadcrumb";

export const Route = createFileRoute("/templates")({
	head: () => ({
		meta: [
			{ title: "VibeTemplate | VibeEverything" },
			{
				name: "description",
				content:
					"Katalog template proyek VibeEverything direncanakan untuk fase berikutnya.",
			},
		],
	}),
	component: TemplatesPage,
});

const PLANNED = [
	{
		icon: SquarePen,
		title: "Template Planning",
		description:
			"Preset spesifikasi yang sudah terisi, jadi kamu mulai dari kerangka PRD yang sudah terbukti, bukan dari halaman kosong.",
	},
	{
		icon: LayoutGrid,
		title: "Template Design",
		description:
			"Kit desain antarmuka siap pakai: komponen, tabel data tabular, dan badge status yang konsisten.",
	},
	{
		icon: Library,
		title: "Boilerplate Proyek",
		description:
			"Starter proyek siap jalan untuk domain umum seperti Rumah Sakit, SaaS, dan E-Commerce.",
	},
];

function TemplatesPage() {
	return (
		<main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
			<HubBreadcrumb current="VibeTemplate" />

			<header className="mx-auto max-w-2xl text-center">
				<p className="mb-4 inline-flex items-center gap-2 rounded-full border border-graphite bg-charcoal px-3 py-1 font-mono text-xs text-fog">
					Belum tersedia
				</p>
				<h1 className="text-3xl font-semibold tracking-tight text-snow sm:text-4xl">
					Katalog template proyek
				</h1>
				<p className="mt-3 text-sm leading-6 text-fog">
					Katalog template belum ada di aplikasi ini. Tidak ada kartu template
					yang bisa dibuka, jadi halaman ini tidak menampilkan katalog karangan.
				</p>
			</header>

			<section className="flex flex-col gap-4">
				<h2 className="font-mono text-xs uppercase tracking-widest text-fog">
					Yang direncanakan untuk fase berikutnya
				</h2>
				<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
					{PLANNED.map((item) => {
						const Icon = item.icon;
						return (
							<article
								key={item.title}
								className="flex flex-col gap-3 rounded-xl border border-dashed border-graphite/60 bg-charcoal/40 p-6"
							>
								<span className="flex h-10 w-10 items-center justify-center rounded-lg border border-graphite/60 text-fog">
									<Icon size={20} aria-hidden />
								</span>
								<div>
									<div className="flex flex-wrap items-center gap-2">
										<h3 className="text-base font-semibold text-mist">
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
				</div>
			</section>

			<section className="flex flex-col gap-3 rounded-xl border border-graphite bg-charcoal p-7">
				<h2 className="font-mono text-xs uppercase tracking-widest text-fog">
					Yang bisa kamu pakai sekarang
				</h2>
				<p className="text-sm leading-6 text-fog">
					Galeri prompt siap pakai sudah aktif di halaman projek baru. Pilih
					satu untuk mengisi chat input, lalu ubah sesuai kebutuhanmu.
				</p>
				<Link
					to="/plan/new"
					className="group flex items-center justify-between gap-4 rounded-lg border border-graphite bg-obsidian p-4 transition-colors hover:border-steel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					<span>
						<span className="block text-base font-semibold text-snow">
							Galeri prompt di Projek Baru
						</span>
						<span className="mt-1 block text-sm text-fog">
							Template prompt yang benar-benar tersedia hari ini.
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
