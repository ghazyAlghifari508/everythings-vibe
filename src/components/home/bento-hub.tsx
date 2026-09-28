import { Link } from "@tanstack/react-router";
import {
	ArrowRight,
	CircleQuestionMark,
	LayoutGrid,
	Pencil,
	Sparkles,
	type LucideIcon,
} from "lucide-react";

type HubDestination = "/plan" | "/design" | "/templates" | "/bantuan";

interface HubCard {
	readonly to: HubDestination;
	readonly title: string;
	readonly icon: LucideIcon;
	readonly description: React.ReactNode;
	readonly tags: readonly string[];
}

const CARDS: readonly HubCard[] = [
	{
		to: "/plan",
		title: "VibePlan",
		icon: Pencil,
		description:
			"Ubah ide produk jadi PRD 8-seksi lengkap, Acceptance Criteria (AC), dan breakdown task Kanban terstruktur secara otomatis.",
		tags: ["Projek Baru", "Codebase Existing"],
	},
	{
		to: "/design",
		title: "VibeDesign",
		icon: Sparkles,
		description: (
			<>
				Rancang UI interaktif langsung lewat prompt teks, atau ekstrak website
				live langsung menjadi 2 file:{" "}
				<code className="font-mono text-mist">design.md</code> &amp;{" "}
				<code className="font-mono text-mist">index.html</code>.
			</>
		),
		tags: ["Scrap HTML & design.md", "Prompt UI Studio"],
	},
	{
		to: "/templates",
		title: "VibeTemplate",
		icon: LayoutGrid,
		description:
			"Koleksi kerangka kerja teruji: preset spesifikasi planning, kit desain antarmuka, dan boilerplate proyek lengkap (Rumah Sakit, SaaS, E-Commerce).",
		tags: ["Template Planning", "Template Design", "Boilerplate Projek"],
	},
	{
		to: "/bantuan",
		title: "VibeBantuan",
		icon: CircleQuestionMark,
		description:
			"Pusat bantuan pengguna, pelaporan bug kendala teknis, dan feedback langsung ke antarmuka admin menggunakan formulir bawaan VibeEverything.",
		tags: ["Feedback & Bug Report", "Triage Admin"],
	},
];

export function BentoHub() {
	return (
		<div className="mx-auto flex w-full max-w-6xl flex-col px-4 sm:px-6">
			<div className="mx-auto mb-10 max-w-2xl text-center sm:mb-12">
				<span className="mb-4 inline-flex items-center gap-2 rounded-full border border-graphite bg-charcoal px-3 py-1 font-mono text-xs text-fog">
					<span aria-hidden className="h-1.5 w-1.5 rounded-full bg-indigo" />
					VibeEverything Developer Console
				</span>
				<h1 className="text-4xl font-bold tracking-tight text-snow sm:text-5xl lg:text-6xl">
					Mau ngapain hari ini?
				</h1>
				<p className="mt-3 text-sm leading-6 text-fog md:text-base">
					Pilih workspace untuk mulai menyusun requirements produk, merancang
					antarmuka UI, memilih template proyek, atau meminta bantuan teknis.
				</p>
			</div>

			<div className="grid grid-cols-1 gap-5 pb-16 md:grid-cols-2 md:pb-20">
				{CARDS.map((card) => (
					<HubCardLink key={card.to} card={card} />
				))}
			</div>
		</div>
	);
}

function HubCardLink({ card }: { card: HubCard }) {
	const Icon = card.icon;
	return (
		<Link
			to={card.to}
			className="group flex flex-col rounded-xl border border-graphite bg-charcoal p-7 transition-colors hover:border-steel hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
		>
			<div className="mb-4 flex items-start justify-between gap-4">
				<span className="flex h-10 w-10 items-center justify-center rounded-lg border border-graphite bg-obsidian text-snow transition-colors group-hover:border-steel">
					<Icon size={20} aria-hidden />
				</span>
				<span className="flex items-center gap-1 font-mono text-xs text-fog transition-colors group-hover:text-snow">
					Buka {card.to}
					<ArrowRight size={14} aria-hidden />
				</span>
			</div>

			<h2 className="text-xl font-semibold text-snow">{card.title}</h2>
			<p className="mt-2 text-sm leading-6 text-fog">{card.description}</p>

			<div className="mt-6 flex flex-wrap gap-2 border-t border-graphite pt-4">
				{card.tags.map((tag) => (
					<span
						key={tag}
						className="rounded-md border border-graphite bg-onyx px-2.5 py-1 font-mono text-[11px] text-fog"
					>
						{tag}
					</span>
				))}
			</div>
		</Link>
	);
}
