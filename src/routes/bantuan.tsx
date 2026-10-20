import {
	ArrowRight01Icon,
	CreditCardIcon,
	InformationCircleIcon,
	MessageSquareIcon,
} from "@hugeicons/core-free-icons";
import { createFileRoute, Link } from "@tanstack/react-router";
import { WorkflowGuides } from "@/components/bantuan/workflow-guides";
import { HubBreadcrumb } from "@/components/home/hub-breadcrumb";
import { Icon } from "@/components/ui/icon";

export const Route = createFileRoute("/bantuan")({
	head: () => ({
		meta: [
			{ title: "Bantuan | VibeEverything" },
			{
				name: "description",
				content:
					"Pusat bantuan VibeEverything: panduan alur kerja modul, bantuan teknis, serta kanal feedback.",
			},
		],
	}),
	component: BantuanPage,
});

const SUPPORT_LINKS = [
	{
		to: "/settings/feedback",
		title: "Laporkan Masalah atau Kirim Masukan",
		description:
			"Kirim laporan bug, kendala teknis, atau saran pengembangan fitur.",
		icon: MessageSquareIcon,
	},
	{
		to: "/settings/billing",
		title: "Tagihan & Pembayaran",
		description:
			"Kelola status paket langganan aktif, saldo kredit, dan riwayat pembayaran.",
		icon: CreditCardIcon,
	},
	{
		to: "/faq",
		title: "Pertanyaan Umum (FAQ)",
		description:
			"Jawaban seputar konsep modul, masa aktif kredit, dan aturan platform di halaman mandiri.",
		icon: InformationCircleIcon,
	},
] as const;

export function BantuanPage() {
	return (
		<main className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-4 py-10 sm:px-6 sm:py-14">
			<HubBreadcrumb current="Bantuan" />

			<header>
				<h1 className="text-3xl font-semibold tracking-tight text-snow sm:text-4xl">
					Pusat Bantuan
				</h1>
				<p className="mt-3 max-w-2xl text-sm leading-6 text-fog">
					Panduan penggunaan modul dan bantuan saat Anda mengalami kendala
					teknis.
				</p>
			</header>

			<section
				aria-labelledby="panduan-heading"
				className="flex flex-col gap-4"
			>
				<h2
					id="panduan-heading"
					className="font-mono text-xs uppercase tracking-widest text-fog"
				>
					Panduan Penggunaan
				</h2>
				<WorkflowGuides />
			</section>

			<section
				aria-labelledby="dukungan-heading"
				className="flex flex-col gap-4"
			>
				<h2
					id="dukungan-heading"
					className="font-mono text-xs uppercase tracking-widest text-fog"
				>
					Dukungan & Bantuan
				</h2>

				<div className="overflow-hidden rounded-xl border border-graphite bg-charcoal divide-y divide-graphite/60">
					{SUPPORT_LINKS.map((item) => (
						<Link
							key={item.to}
							to={item.to}
							className="group flex items-center justify-between gap-4 p-4.5 sm:p-5 transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
						>
							<div className="flex items-center gap-3.5">
								<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-graphite bg-obsidian text-fog">
									<Icon icon={item.icon} size={18} aria-hidden />
								</span>
								<div>
									<span className="block text-sm font-semibold text-snow transition-colors group-hover:text-mist">
										{item.title}
									</span>
									<span className="mt-0.5 block text-xs leading-5 text-fog">
										{item.description}
									</span>
								</div>
							</div>
							<Icon
								icon={ArrowRight01Icon}
								size={16}
								aria-hidden
								className="shrink-0 text-fog transition-transform group-hover:translate-x-1 group-hover:text-snow"
							/>
						</Link>
					))}
				</div>
			</section>
		</main>
	);
}
