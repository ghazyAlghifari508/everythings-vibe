import {
	Compass01Icon,
	CreditCardIcon,
	FileCodeIcon,
	Layers01Icon,
	PaintBoardIcon,
	PenLineIcon,
	TerminalIcon,
} from "@hugeicons/core-free-icons";
import type { HelpCategory, HelpCategoryId } from "../types/help-article";

export const HELP_CATEGORIES: readonly HelpCategory[] = [
	{
		id: "mulai",
		label: "Mulai menggunakan EVVIBE",
		description: "Kenalan, proyek pertama, dan kredit.",
		intro:
			"Pahami apa yang bisa kamu buat, pilih workspace yang sesuai, dan mulai dari alokasi kredit yang kamu miliki.",
		icon: Compass01Icon,
	},
	{
		id: "vibeplan",
		label: "VibePlan",
		description: "Panduan planning.",
		intro:
			"Ubah ide atau repository menjadi dokumen rencana, kriteria penerimaan, dan tugas yang siap dikerjakan.",
		icon: PenLineIcon,
	},
	{
		id: "studio",
		label: "VibeDesign Studio",
		description: "Membuat desain.",
		intro:
			"Buat prototipe antarmuka dari instruksi, tambahkan frame, lalu periksa hasilnya di kanvas.",
		icon: PaintBoardIcon,
	},
	{
		id: "scrape",
		label: "VibeScrape",
		description: "Ekstraksi website.",
		intro:
			"Ambil struktur halaman, panduan desain, markup HTML, atau gambar dari website publik.",
		icon: FileCodeIcon,
	},
	{
		id: "template",
		label: "VibeTemplate",
		description: "Menggunakan template.",
		intro:
			"Mulai dari blueprint yang sudah disiapkan tanpa harus menulis instruksi dari kosong.",
		icon: Layers01Icon,
	},
	{
		id: "cli",
		label: "CLI & AI Agent",
		description: "Hubungkan repository.",
		intro:
			"Pasang CLI, sinkronisasi repository, kelola kunci akses, dan serahkan pekerjaan ke agent.",
		icon: TerminalIcon,
	},
	{
		id: "billing",
		label: "Billing & Kredit",
		description: "Paket dan kredit.",
		intro:
			"Pahami paket, alokasi kredit, pemotongan, top up, dan riwayat pembayaran.",
		icon: CreditCardIcon,
	},
] as const;

export const HELP_CATEGORY_IDS: readonly HelpCategoryId[] = HELP_CATEGORIES.map(
	(category) => category.id,
);
