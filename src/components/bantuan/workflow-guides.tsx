import { FileCode2, PenLine, TerminalSquare } from "lucide-react";

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
		id: "vibedesign-scrap",
		title: "Alur Kerja VibeDesign Scrap",
		description:
			"Ekstrak website live menjadi fondasi desain yang bisa dipakai ulang.",
		steps: [
			"Masukkan URL website live di /design/scrap",
			"Server mengambil HTML dan mem-proxy aset lewat /api/scrape/asset",
			"Terima 2 file langsung: index.html dan design.md",
			"Unduh bundle ZIP berisi keduanya",
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

const GUIDE_ICONS = [PenLine, FileCode2, TerminalSquare] as const;

export function WorkflowGuides() {
	return (
		<div className="grid gap-4 md:grid-cols-3">
			{GUIDES.map((guide, index) => {
				const Icon = GUIDE_ICONS[index] ?? PenLine;
				return (
					<article
						key={guide.id}
						className="flex flex-col gap-4 rounded-xl border border-graphite bg-charcoal p-6"
					>
						<span className="flex h-10 w-10 items-center justify-center rounded-lg border border-graphite bg-obsidian text-fog">
							<Icon size={20} aria-hidden />
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
