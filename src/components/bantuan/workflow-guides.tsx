import {
	FileCodeIcon,
	PaintBoardIcon,
	PenLineIcon,
	TerminalIcon,
} from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";

interface WorkflowGuide {
	readonly id: string;
	readonly title: string;
	readonly description: string;
	readonly steps: readonly string[];
}

const GUIDES: readonly WorkflowGuide[] = [
	{
		id: "vibeplan",
		title: "Alur Kerja VibePlan",
		description:
			"Dari prompt ide mentah menjadi dokumen kerja yang siap dieksekusi tim.",
		steps: [
			"Tulis prompt ide produk di /plan/new",
			"Jawab pertanyaan klarifikasi di sesi Ask",
			"Terima PRD profesional 8 seksi",
			"Generate Acceptance Criteria, lalu Task dan Kanban Board",
		],
	},
	{
		id: "vibedesign",
		title: "Alur Kerja VibeDesign",
		description:
			"Ubah prompt teks menjadi antarmuka HTML/Tailwind interaktif di canvas responsif.",
		steps: [
			"Buka studio antarmuka di /design",
			"Tulis deskripsi antarmuka atau gunakan referensi desain",
			"Inspeksi hasil di preview Desktop, Tablet, dan Mobile",
			"Beralih antara tab Preview dan Code untuk salin markup",
		],
	},
	{
		id: "vibescrape",
		title: "Alur Kerja VibeScrape",
		description:
			"Ekstrak website live menjadi fondasi desain yang bisa dipakai ulang.",
		steps: [
			"Buka workspace mandiri /scrape dan masukkan URL website publik",
			"Pilih mode ekstraksi: desain, HTML, crawl, atau gambar",
			"Periksa hasil ekstraksi dan unduh artefak yang tersedia",
			"Temukan kembali hasil di /scrape/history",
		],
	},
	{
		id: "cli",
		title: "Alur Kerja VibeEverything CLI",
		description:
			"Hubungkan repository lokal agar perencanaan membaca konteks kode nyata.",
		steps: [
			"Jalankan vibeeverything login di terminal",
			"Jalankan vibeeverything codebase sync dari root repository",
			"Analisis sinkronisasi berjalan otomatis di server",
		],
	},
];

const GUIDE_ICONS = [
	PenLineIcon,
	PaintBoardIcon,
	FileCodeIcon,
	TerminalIcon,
] as const;

export function WorkflowGuides() {
	return (
		<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			{GUIDES.map((guide, index) => {
				const glyph = GUIDE_ICONS[index] ?? PenLineIcon;
				return (
					<article
						key={guide.id}
						className="flex flex-col gap-4 rounded-xl border border-graphite bg-charcoal p-6"
					>
						<span className="flex h-10 w-10 items-center justify-center rounded-lg border border-graphite bg-obsidian text-fog">
							<Icon icon={glyph} size={20} aria-hidden />
						</span>
						<div>
							<h3 className="text-base font-semibold text-snow">
								{guide.title}
							</h3>
							<p className="mt-1 text-sm leading-6 text-fog">
								{guide.description}
							</p>
						</div>
						<ol className="flex flex-col gap-2 border-t border-graphite/60 pt-4">
							{guide.steps.map((step, stepIndex) => (
								<li
									key={step}
									className="flex items-start gap-2.5 text-sm leading-6 text-fog"
								>
									<span
										aria-hidden
										className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-graphite bg-obsidian font-mono text-[10px] text-mist"
									>
										{stepIndex + 1}
									</span>
									<span>{step}</span>
								</li>
							))}
						</ol>
					</article>
				);
			})}
		</div>
	);
}
