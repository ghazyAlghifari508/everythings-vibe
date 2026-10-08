import type { ScrapeMode, ScrapeStatus } from "@/db/schema";

const DESIGN_QUEUED_HINTS = [
	"Menyiapkan proses scrape...",
	"Menunggu proses dimulai...",
];

const DESIGN_CAPTURING_HINTS = [
	"Membuka website di browser...",
	"Menjalankan JavaScript halaman...",
	"Menunggu tampilan dan asset selesai dimuat...",
	"Memuat konten lazy-load yang tersedia...",
	"Menyiapkan hasil render untuk dianalisis...",
];

const DESIGN_EXTRACTING_HINTS = [
	"Membaca warna dan surface...",
	"Membaca typography dan font...",
	"Mengenali spacing dan bentuk...",
	"Membaca pola komponen dan layout...",
	"Menyiapkan token visual hasil ekstraksi...",
];

const DESIGN_GENERATING_HINTS = [
	"Menyusun struktur DESIGN.md...",
	"Menulis token dan panduan visual...",
	"Menyusun spesifikasi komponen...",
	"Menulis Do dan Don't...",
	"Memeriksa kelengkapan design system...",
];

const DESIGN_SAVING_HINTS = [
	"Menyimpan DESIGN.md...",
	"Menyiapkan hasil untuk ditampilkan...",
];

const HTML_QUEUED_HINTS = [
	"Menyiapkan proses scrape...",
	"Menunggu proses dimulai...",
];

const HTML_CAPTURING_HINTS = [
	"Membuka website di browser...",
	"Menjalankan JavaScript halaman...",
	"Menunggu resource selesai dimuat...",
	"Memuat konten lazy-load yang tersedia...",
	"Menangkap DOM hasil render...",
];

const HTML_EXTRACTING_HINTS = [
	"Menyiapkan HTML hasil render...",
	"Menulis ulang resource untuk preview...",
	"Menyiapkan asset halaman...",
	"Menyiapkan preview desktop...",
];

const HTML_SAVING_HINTS = [
	"Menyimpan index.html...",
	"Menyiapkan hasil preview...",
];

const DESIGN_HINTS: Record<string, readonly string[]> = {
	queued: DESIGN_QUEUED_HINTS,
	capturing: DESIGN_CAPTURING_HINTS,
	extracting: DESIGN_EXTRACTING_HINTS,
	generating: DESIGN_GENERATING_HINTS,
	saving: DESIGN_SAVING_HINTS,
};

const HTML_HINTS: Record<string, readonly string[]> = {
	queued: HTML_QUEUED_HINTS,
	capturing: HTML_CAPTURING_HINTS,
	extracting: HTML_EXTRACTING_HINTS,
	generating: HTML_EXTRACTING_HINTS,
	saving: HTML_SAVING_HINTS,
};

export function scrapeActivityHints(
	mode: ScrapeMode,
	status: ScrapeStatus | string,
): string[] {
	const table = mode === "html" ? HTML_HINTS : DESIGN_HINTS;
	return [...(table[status] ?? [])];
}
