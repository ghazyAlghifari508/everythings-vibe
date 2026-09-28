import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface BantuanFaq {
	readonly id: string;
	readonly question: string;
	readonly answer: string;
}

const FAQS: readonly BantuanFaq[] = [
	{
		id: "greenfield-vs-codebase",
		question: "Apa perbedaan VibePlan Greenfield dan Codebase Existing?",
		answer:
			"Greenfield memulai dari ide mentah: kamu menulis prompt, menjawab pertanyaan klarifikasi, lalu menerima PRD 8 seksi. Codebase Existing menghubungkan repository lokal lewat CLI sync, sehingga pertanyaan klarifikasi dan PRD disusun dari konteks kode yang sudah ada, bukan dari nol.",
	},
	{
		id: "vibedesign-scrap",
		question: "Bagaimana cara kerja VibeDesign Scrap?",
		answer:
			"Masukkan URL website live, server mengambil HTML dan mem-proxy asetnya agar preview tidak terblokir, lalu menghasilkan 2 file langsung: index.html dan design.md. Keduanya bisa diunduh sebagai bundle ZIP dari halaman detail scrape.",
	},
	{
		id: "prompt-ui-studio",
		question: "Apa itu Prompt UI Studio di VibeDesign?",
		answer:
			"Prompt UI Studio mengubah deskripsi teks menjadi halaman HTML interaktif lengkap dengan Tailwind. Hasilnya dirender di sandboxed iframe canvas responsif dengan pilihan lebar Desktop, Tablet, dan Mobile, plus tab toggle Preview dan Code untuk inspeksi dan salin kode.",
	},
	{
		id: "cli-connect",
		question: "Bagaimana cara menghubungkan repository lokal lewat CLI?",
		answer:
			"Jalankan vibeeverything login di terminal untuk autentikasi, lalu vibeeverything codebase sync dari root repository. CLI mengirim snapshot repository yang difilter ke server, dan analisis sinkronisasi berjalan otomatis hingga statusnya selesai.",
	},
	{
		id: "credits-topup",
		question: "Bagaimana perhitungan kredit dan top-up?",
		answer:
			"Satu kredit dipakai untuk satu generate PRD, Acceptance Criteria, atau Task; revisi dokumen tetap gratis. Paket free mendapat 2 kredit, pro 30 kredit, dan hengker 105 kredit. Top-up menambah saldo berjalan tanpa memperpanjang masa aktif, dan sisa kredit hangus di akhir periode.",
	},
	{
		id: "bug-report",
		question: "Bagaimana cara mengirim laporan bug atau meminta fitur baru?",
		answer:
			"Buka halaman Feedback & Bug Report dari hub ini atau lewat Settings, lalu kirim laporan dengan login. Semua laporan masuk ke satu antrean yang ditinjau tim admin, dan akun admin bisa meninjaunya di halaman Triase Admin.",
	},
];

export function FaqAccordion() {
	const [openId, setOpenId] = useState<string | null>(FAQS[0]?.id ?? null);

	return (
		<div className="flex flex-col gap-2">
			{FAQS.map((faq) => {
				const isOpen = openId === faq.id;
				return (
					<div
						key={faq.id}
						className={cn(
							"rounded-xl border bg-charcoal transition-colors",
							isOpen ? "border-steel" : "border-graphite",
						)}
					>
						<button
							type="button"
							aria-expanded={isOpen}
							onClick={() => setOpenId(isOpen ? null : faq.id)}
							className="flex w-full items-center justify-between gap-4 p-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
						>
							<span className="text-sm font-semibold text-snow">
								{faq.question}
							</span>
							<ChevronDown
								size={18}
								aria-hidden
								className={cn(
									"shrink-0 text-fog transition-transform",
									isOpen && "rotate-180",
								)}
							/>
						</button>
						{isOpen && (
							<p className="px-5 pb-5 text-sm leading-6 text-fog">
								{faq.answer}
							</p>
						)}
					</div>
				);
			})}
		</div>
	);
}
