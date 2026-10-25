import {
	ArrowRight01Icon,
	FileCodeIcon,
	InformationCircleIcon,
	PaintBoardIcon,
	PenLineIcon,
	TerminalIcon,
} from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export interface GuideStep {
	readonly action: string;
	readonly detail: string;
}

export interface WorkflowGuide {
	readonly id: string;
	readonly title: string;
	readonly summary: string;
	readonly targetUrl?: string;
	readonly targetLabel?: string;
	readonly steps: readonly GuideStep[];
	readonly note?: string;
}

export const GUIDES: readonly WorkflowGuide[] = [
	{
		id: "vibeplan",
		title: "Alur Kerja VibePlan",
		summary:
			"Menyusun ide produk menjadi PRD 8 seksi, kriteria penerimaan (AC), dan papan tugas Kanban.",
		targetUrl: "/plan/new",
		targetLabel: "Mulai di /plan/new",
		steps: [
			{
				action: "Inisiasi ide produk",
				detail:
					"Buka /plan/new dan tulis deskripsi ringkas ide produk atau fitur yang ingin dibangun.",
			},
			{
				action: "Klarifikasi terpandu",
				detail:
					"Jawab pertanyaan klarifikasi pada sesi Ask untuk menegaskan target pengguna dan batasan teknis.",
			},
			{
				action: "Streaming & revisi PRD",
				detail:
					"Review dokumen PRD 8 seksi yang dihasilkan. Gunakan chat panel untuk revisi bagian spesifik tanpa biaya kredit.",
			},
			{
				action: "Turunkan ke AC & Kanban",
				detail:
					"Generate Acceptance Criteria terstruktur lalu pecah spesifikasi menjadi task board Kanban interaktif.",
			},
		],
		note: "Tip: Jika kredit generate habis, revisi PRD yang ada tetap gratis dan tidak terbatas.",
	},
	{
		id: "vibedesign",
		title: "Alur Kerja VibeDesign",
		summary:
			"Membuat prototipe antarmuka HTML dan Tailwind interaktif dengan preview multi-viewport.",
		targetUrl: "/design",
		targetLabel: "Buka Studio di /design",
		steps: [
			{
				action: "Buka antarmuka studio",
				detail:
					"Akses /design dan tulis instruksi komponen, halaman, atau layout yang diinginkan.",
			},
			{
				action: "Pilih skill & referensi",
				detail:
					"Gunakan panduan styling bawaan atau tautkan token desain dari VibeScrape untuk konsistensi visual.",
			},
			{
				action: "Inspeksi kanvas multi-screen",
				detail:
					"Uji responsivitas antarmuka secara instan pada frame Desktop, Tablet, dan Mobile.",
			},
			{
				action: "Salin kode siap pakai",
				detail:
					"Beralih ke tab Code untuk menyalin markup Tailwind CSS langsung ke proyek frontend Anda.",
			},
		],
		note: "Tip: Sebutkan hierarki elemen utama dan kebutuhan interaksi dasar pada prompt untuk hasil yang lebih terstruktur.",
	},
	{
		id: "vibescrape",
		title: "Alur Kerja VibeScrape",
		summary:
			"Ekstraksi struktur UI, palet warna, tipografi, dan aset dari website publik menjadi panduan desain.",
		targetUrl: "/scrape",
		targetLabel: "Buka Scraper di /scrape",
		steps: [
			{
				action: "Input URL target",
				detail:
					"Buka /scrape dan tempel URL website publik yang ingin Anda jadikan acuan desain antarmuka.",
			},
			{
				action: "Tentukan mode ekstraksi",
				detail:
					"Pilih target yang diinginkan: token desain (DESIGN.md), markup HTML bersih, atau aset gambar.",
			},
			{
				action: "Ekstraksi headless otomatis",
				detail:
					"Crawler Playwright Chromium membersihkan skrip pelacak dan menormalisasi token warna ke format standar.",
			},
			{
				action: "Akses artefak & histori",
				detail:
					"Unduh token hasil ekstraksi atau buka kembali riwayat di /scrape/history untuk dipakai di VibeDesign.",
			},
		],
		note: "Batasan: Halaman dengan otentikasi login privat atau proteksi bot ketat mungkin membatasi kelengkapan aset.",
	},
	{
		id: "cli",
		title: "Alur Kerja everythings-vibe CLI",
		summary:
			"Hubungkan repositori lokal agar perencanaan AI memahami basis kode nyata tanpa halusinasi.",
		targetUrl: "/codebases",
		targetLabel: "Kelola di /codebases",
		steps: [
			{
				action: "Autentikasi terminal",
				detail:
					"Jalankan npx @ghazynabiel/everythings-vibe login di terminal untuk menghubungkan sesi akun Anda.",
			},
			{
				action: "Sinkronisasi repositori",
				detail:
					"Masuk ke direktori root proyek lokal Anda dan jalankan everythings-vibe codebase sync.",
			},
			{
				action: "Analisis arsitektur",
				detail:
					"CLI menyaring file rahasia, lalu server memetakan dependensi, struktur folder, dan konvensi kode.",
			},
			{
				action: "Rencanakan fitur kontekstual",
				detail:
					"Buat project baru di web dengan mode Existing Codebase yang otomatis selaras dengan arsitektur riil.",
			},
		],
		note: "Keamanan: File kredensial (.env) dan folder build (node_modules, dist) otomatis dikecualikan sebelum upload.",
	},
] as const;

const GUIDE_ICONS = {
	vibeplan: PenLineIcon,
	vibedesign: PaintBoardIcon,
	vibescrape: FileCodeIcon,
	cli: TerminalIcon,
} as const;

export function WorkflowGuides() {
	const [selectedId, setSelectedId] = useState<string>("vibeplan");
	const selectedGuide = GUIDES.find((g) => g.id === selectedId) ?? GUIDES[0];
	const selectedGlyph =
		GUIDE_ICONS[selectedGuide.id as keyof typeof GUIDE_ICONS] ?? PenLineIcon;

	return (
		<div className="flex flex-col gap-6">
			{/* Maximum 2 guide columns on desktop for balanced measure and zero text cramping */}
			<div className="grid gap-4 sm:grid-cols-2">
				{GUIDES.map((guide) => {
					const isSelected = guide.id === selectedId;
					const glyph =
						GUIDE_ICONS[guide.id as keyof typeof GUIDE_ICONS] ?? PenLineIcon;

					return (
						<article
							key={guide.id}
							className={cn(
								"group flex flex-col justify-between rounded-xl border p-5 transition-all text-left",
								isSelected
									? "border-mist/80 bg-white/[0.06] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
									: "border-graphite bg-charcoal hover:border-steel hover:bg-white/5",
							)}
						>
							<div>
								<div className="flex items-center justify-between gap-3">
									<span className="flex h-9 w-9 items-center justify-center rounded-lg border border-graphite bg-obsidian text-fog">
										<Icon icon={glyph} size={18} aria-hidden />
									</span>
									{isSelected && (
										<span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-snow">
											Aktif
										</span>
									)}
								</div>

								<h3 className="mt-3.5 text-base font-semibold text-snow">
									{guide.title}
								</h3>
								<p className="mt-1 text-sm leading-6 text-fog">
									{guide.summary}
								</p>
							</div>

							<button
								type="button"
								onClick={() => setSelectedId(guide.id)}
								aria-expanded={isSelected}
								aria-controls="selected-guide-panel"
								className={cn(
									"mt-4 flex w-full items-center justify-between border-t border-graphite/50 pt-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo rounded-sm cursor-pointer",
									isSelected ? "text-snow" : "text-fog group-hover:text-snow",
								)}
							>
								<span>
									{isSelected ? "Sedang ditampilkan" : "Lihat panduan"}
								</span>
								<Icon
									icon={ArrowRight01Icon}
									size={14}
									aria-hidden
									className={cn(
										"transition-transform",
										isSelected ? "rotate-90" : "group-hover:translate-x-0.5",
									)}
								/>
							</button>
						</article>
					);
				})}
			</div>

			{/* Selected guide details reader panel */}
			<section
				id="selected-guide-panel"
				aria-labelledby="selected-guide-title"
				className="rounded-xl border border-graphite bg-charcoal p-6 sm:p-7 transition-all"
			>
				<div className="flex flex-wrap items-center justify-between gap-3 border-b border-graphite/60 pb-4">
					<div className="flex items-center gap-3">
						<span className="flex h-8 w-8 items-center justify-center rounded-lg border border-graphite bg-obsidian text-fog">
							<Icon icon={selectedGlyph} size={16} aria-hidden />
						</span>
						<div>
							<h3
								id="selected-guide-title"
								className="text-base font-semibold text-snow"
							>
								Panduan Langkah: {selectedGuide.title}
							</h3>
						</div>
					</div>

					{selectedGuide.targetUrl && (
						<Link
							to={selectedGuide.targetUrl}
							className="inline-flex items-center gap-1.5 text-xs font-medium text-snow underline underline-offset-4 transition-colors hover:text-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
						>
							<span>{selectedGuide.targetLabel}</span>
							<Icon icon={ArrowRight01Icon} size={14} aria-hidden />
						</Link>
					)}
				</div>

				<ol className="mt-5 space-y-3.5">
					{selectedGuide.steps.map((step, idx) => (
						<li key={step.action} className="flex items-start gap-3">
							<span
								aria-hidden
								className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-graphite bg-obsidian font-mono text-[11px] font-medium text-snow"
							>
								{idx + 1}
							</span>
							<p className="text-sm leading-6 text-fog">
								<strong className="font-semibold text-snow">
									{step.action}:{" "}
								</strong>
								{step.detail}
							</p>
						</li>
					))}
				</ol>

				{selectedGuide.note && (
					<div className="mt-6 flex items-start gap-2.5 rounded-lg border border-graphite/60 bg-obsidian/70 p-3.5 text-xs text-fog">
						<Icon
							icon={InformationCircleIcon}
							size={16}
							className="mt-0.5 shrink-0 text-mist"
							aria-hidden
						/>
						<span className="leading-5">{selectedGuide.note}</span>
					</div>
				)}
			</section>
		</div>
	);
}
