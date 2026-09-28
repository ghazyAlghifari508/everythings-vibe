import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, FolderGit2, Plus } from "lucide-react";
import { HubBreadcrumb } from "@/components/home/hub-breadcrumb";

export const Route = createFileRoute("/plan/")({
	head: () => ({
		meta: [
			{ title: "VibePlan | VibeEverything" },
			{
				name: "description",
				content:
					"Rencanakan produk baru dari nol atau lanjutkan dari repository yang sudah ada.",
			},
		],
	}),
	component: PlanOptionsPage,
});

const OPTIONS = [
	{
		to: "/plan/new",
		icon: Plus,
		label: "Opsi 1",
		title: "Projek Baru (Greenfield)",
		description:
			"Mulai dari ide mentah. Ketik instruksi produk Anda di halaman chat input, ikuti sesi tanya jawab terstruktur, lalu biarkan AI men-generate PRD 8-seksi lengkap.",
		footer: "Membuka halaman chat input",
	},
	{
		to: "/codebases",
		icon: FolderGit2,
		label: "Opsi 2",
		title: "Codebase Existing",
		description:
			"Sudah punya repositori? Hubungkan folder proyek lokal untuk mendapatkan prompt CLI, lalu susun fitur baru di atas kode yang sudah ada.",
		footer: "Membuka halaman koneksi codebase",
	},
] as const;

function PlanOptionsPage() {
	return (
		<main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
			<HubBreadcrumb current="VibePlan" />

			<header className="mx-auto max-w-xl text-center">
				<h1 className="text-3xl font-semibold tracking-tight text-snow sm:text-4xl">
					Pilih Metode Perencanaan
				</h1>
				<p className="mt-3 text-sm leading-6 text-fog">
					Apakah Anda ingin merancang produk baru dari awal atau menyambungkan
					proyek yang sudah ada?
				</p>
			</header>

			<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
				{OPTIONS.map((option) => {
					const Icon = option.icon;
					return (
						<Link
							key={option.to}
							to={option.to}
							className="group flex flex-col justify-between rounded-xl border border-graphite bg-charcoal p-8 transition-colors hover:border-steel hover:bg-obsidian focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
						>
							<div>
								<span className="mb-6 flex h-12 w-12 items-center justify-center rounded-lg border border-graphite bg-obsidian text-snow">
									<Icon size={24} aria-hidden />
								</span>
								<p className="mb-2 font-mono text-xs uppercase tracking-widest text-fog">
									{option.label}
								</p>
								<h2 className="text-2xl font-semibold text-snow">
									{option.title}
								</h2>
								<p className="mt-3 text-sm leading-6 text-fog">
									{option.description}
								</p>
							</div>
							<div className="mt-6 flex items-center justify-between gap-3 border-t border-graphite pt-6 text-xs">
								<span className="font-mono text-fog">{option.footer}</span>
								<span className="flex items-center gap-1 font-mono text-snow">
									Lanjut
									<ArrowRight
										size={14}
										aria-hidden
										className="transition-transform group-hover:translate-x-1"
									/>
								</span>
							</div>
						</Link>
					);
				})}
			</div>
		</main>
	);
}
