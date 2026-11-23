import {
	ArrowRight01Icon,
	CreditCardIcon,
	InformationCircleIcon,
	MessageSquareIcon,
} from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { PublicPageShell } from "@/components/layout";
import { Icon } from "@/components/ui/icon";
import { PageHeading } from "@/components/ui/page-heading";
import {
	articleHref,
	categoryHref,
	getHelpArticle,
	HELP_CATEGORIES,
} from "../data/articles";
import type { HelpArticle, HelpCategoryId } from "../types/help-article";
import { HelpSearch } from "./help-search";

const STARTER_IDS = [
	"mengenal-evvibe",
	"proyek-pertama",
	"kredit-untuk-pemula",
] as const;

const SUPPORT_LINKS = [
	{
		to: "/settings/feedback",
		title: "Laporkan masalah atau kirim masukan",
		description: "Sampaikan kendala teknis atau saran untuk pengembangan.",
		icon: MessageSquareIcon,
	},
	{
		to: "/faq",
		title: "Pertanyaan yang sering diajukan",
		description:
			"Baca jawaban singkat soal konsep, ketersediaan, dan kebijakan.",
		icon: InformationCircleIcon,
	},
	{
		to: "/settings/billing",
		title: "Tagihan dan pembayaran",
		description: "Lihat paket aktif, sisa kredit, dan riwayat pembayaran.",
		icon: CreditCardIcon,
	},
] as const;

const CATEGORY_IDS: readonly HelpCategoryId[] = [
	"vibeplan",
	"studio",
	"scrape",
	"template",
	"cli",
	"billing",
];

export function HelpHome() {
	const starters: readonly HelpArticle[] = STARTER_IDS.map((id) =>
		getHelpArticle(id),
	).filter((article): article is HelpArticle => article !== null);
	const categories = CATEGORY_IDS.map((id) =>
		HELP_CATEGORIES.find((category) => category.id === id),
	).filter((category) => category !== undefined);

	return (
		<PublicPageShell className="max-w-5xl gap-12">
			<header className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
				<PageHeading variant="display">Apa yang bisa kami bantu?</PageHeading>
				<p className="text-sm leading-6 text-fog sm:text-base">
					Cari langkah untuk menyelesaikan satu tugas, atau pilih topik di bawah
					ini.
				</p>
				<HelpSearch />
			</header>

			<section
				aria-labelledby="mulai-heading"
				className="mx-auto w-full max-w-2xl"
			>
				<h2
					id="mulai-heading"
					className="mb-3 font-inter text-xl font-medium tracking-tight text-snow"
				>
					Mulai menggunakan EVVIBE
				</h2>
				<ul className="divide-y divide-graphite/70 overflow-hidden rounded-xl border border-graphite bg-charcoal/40">
					{starters.map((article) => (
						<li key={article.id}>
							<Link
								to={articleHref(article)}
								className="group flex min-h-11 items-center justify-between gap-3 px-4 py-3 text-sm text-mist transition-colors hover:bg-white/5 hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
							>
								<span>{article.title}</span>
								<Icon
									icon={ArrowRight01Icon}
									size={16}
									aria-hidden
									className="shrink-0 text-fog transition-transform group-hover:translate-x-1 group-hover:text-snow"
								/>
							</Link>
						</li>
					))}
				</ul>
			</section>

			<section
				aria-labelledby="kategori-heading"
				className="flex flex-col gap-4"
			>
				<h2
					id="kategori-heading"
					className="font-inter text-xl font-medium tracking-tight text-snow"
				>
					Jelajahi panduan
				</h2>
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{categories.map((category) => (
						<Link
							key={category.id}
							to={categoryHref(category.id)}
							className="group flex min-h-28 flex-col justify-between gap-3 rounded-xl border border-graphite bg-charcoal/40 p-5 transition-colors hover:border-steel hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
						>
							<span className="flex items-center gap-2.5">
								<Icon
									icon={category.icon}
									size={18}
									aria-hidden
									className="text-fog"
								/>
								<span className="text-sm font-semibold text-snow">
									{category.label}
								</span>
							</span>
							<span className="flex items-center justify-between gap-2">
								<span className="text-xs leading-5 text-fog">
									{category.description}
								</span>
								<Icon
									icon={ArrowRight01Icon}
									size={16}
									aria-hidden
									className="shrink-0 text-fog transition-transform group-hover:translate-x-1 group-hover:text-snow"
								/>
							</span>
						</Link>
					))}
				</div>
			</section>

			<section
				aria-labelledby="dukungan-heading"
				className="flex flex-col gap-4"
			>
				<h2
					id="dukungan-heading"
					className="font-inter text-xl font-medium tracking-tight text-snow"
				>
					Masih mengalami kendala?
				</h2>
				<div className="overflow-hidden rounded-xl border border-graphite bg-charcoal/40">
					{SUPPORT_LINKS.map((item) => (
						<Link
							key={item.to}
							to={item.to}
							className="group flex min-h-11 items-center justify-between gap-4 border-b border-graphite/70 px-4 py-3.5 transition-colors last:border-b-0 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
						>
							<span className="flex items-center gap-3">
								<Icon
									icon={item.icon}
									size={18}
									aria-hidden
									className="shrink-0 text-fog"
								/>
								<span>
									<span className="block text-sm font-medium text-snow">
										{item.title}
									</span>
									<span className="mt-0.5 block text-xs leading-5 text-fog">
										{item.description}
									</span>
								</span>
							</span>
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
		</PublicPageShell>
	);
}
