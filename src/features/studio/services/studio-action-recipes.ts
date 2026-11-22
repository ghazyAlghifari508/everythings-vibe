import type {
	StudioDomainRecipe,
	StudioScreenConcept,
} from "./studio-screen-recipes";
import type { StudioActionKind } from "./studio-suggestion-types";

/**
 * Contextual actions are grounded in words the project already uses and in a
 * frame that actually exists. An action never promises a prototype runtime:
 * until that runtime exists it asks the generator for a concrete visual state.
 */
export interface StudioActionRecipe {
	id: string;
	detect: RegExp;
	kind: StudioActionKind;
	/** Matches the name of the screen that owns this state or validation. */
	target: RegExp;
	/** Sentence-length card copy. */
	title: string;
	description: string;
	/** Complete instruction body, inserted into the full prompt. */
	focus: string;
}

const TRAVEL = /\b(wisata|paket|tiket|trip|destinasi|itinerary|perjalanan)\b/i;
const PAYOUT = /\b(pencairan|payout|royalti|penerbit)\b/i;
const PORTFOLIO = /\b(portofolio|portfolio|desainer|studi kasus)\b/i;
const FINANCE = /\b(anggaran|budget|pengeluaran|dompet)\b/i;
const COMMERCE = /\b(keranjang|belanja|katalog)\b/i;

export const ACTION_RECIPES: readonly StudioActionRecipe[] = [
	{
		id: "travel-quota-state",
		detect: TRAVEL,
		kind: "add_state",
		target: /detail paket|detail perjalanan/i,
		title: "Simulasikan paket wisata yang kehabisan kuota",
		description: "Jadwal penuh dengan alternatif tanggal.",
		focus:
			"Tampilkan state kuota habis pada nomor jadwal penuh: nonaktifkan pemesanan, jelaskan sisa kuota, dan tampilkan alternatif jadwal yang masih tersedia. Sertakan state kosong bila semua jadwal penuh.",
	},
	{
		id: "travel-return-date-validation",
		detect: TRAVEL,
		kind: "add_validation",
		target: /checkout|pemesanan|pembayaran/i,
		title: "Uji validasi tanggal pulang sebelum tanggal berangkat",
		description: "Kesalahan yang menandai field tanggal.",
		focus:
			"Sertakan validasi saat tanggal pulang lebih awal dari tanggal berangkat: sorot field tanggal yang bermasalah, tampilkan pesan yang menjelaskan aturan, dan sarankan rentang tanggal yang valid.",
	},
	{
		id: "travel-history-refinement",
		detect: TRAVEL,
		kind: "refine_domain",
		target: /riwayat perjalanan|riwayat pemesanan/i,
		title: "Perjelas status pesanan pada riwayat perjalanan",
		description: "Status, e-tiket, dan tindak lanjut yang mudah dipindai.",
		focus:
			"Perbaiki riwayat dengan status pesanan yang menonjol, label pembayaran, akses e-tiket, serta pengelompokan perjalanan mendatang dan yang sudah selesai.",
	},
	{
		id: "payout-refusal-state",
		detect: PAYOUT,
		kind: "add_state",
		target: /pengajuan pencairan|pencairan/i,
		title: "Rancang modal penolakan pencairan dengan alasan wajib",
		description: "Alasan wajib dan jalur perbaikan pengajuan.",
		focus:
			"Tampilkan state penolakan pencairan dalam modal berisi alasan wajib, ringkasan pengajuan, dan aksi memperbaiki data. Pertahankan konteks halaman pengajuan.",
	},
	{
		id: "payout-upload-validation",
		detect: PAYOUT,
		kind: "add_validation",
		target: /unggah bukti transfer|bukti transfer/i,
		title: "Tolak bukti transfer yang diunggah melebihi 5 MB",
		description: "Batas ukuran dan pesan yang dapat ditindaklanjuti.",
		focus:
			"Sertakan validasi unggahan lebih dari 5 MB: hentikan unggahan, sebutkan ukuran file yang diterima, dan berikan aksi memilih file lain tanpa mengubah alur pencairan.",
	},
	{
		id: "portfolio-home-showcase",
		detect: PORTFOLIO,
		kind: "improve_screen",
		target: /beranda|home/i,
		title: "Perbesar visual proyek pada tampilan beranda",
		description: "Showcase dengan gambar dominan dan hasil proyek.",
		focus:
			"Perbaiki beranda dengan showcase proyek yang visualnya lebih dominan, keterangan hasil yang konkret, dan jalur yang jelas menuju studi kasus.",
	},
	{
		id: "budget-overflow-state",
		detect: FINANCE,
		kind: "add_state",
		target: /anggaran/i,
		title: "Tampilkan peringatan saat anggaran kategori terlampaui",
		description: "Ambang batas dan progres pemakaian yang terbaca.",
		focus:
			"Tampilkan state ketika pemakaian melewati batas kategori: sorot total yang over budget, tunjukkan progres, dan arahkan ke rincian transaksi kategori tersebut.",
	},
	{
		id: "cart-to-summary-flow",
		detect: COMMERCE,
		kind: "complete_flow",
		target: /keranjang/i,
		title: "Sambungkan keranjang ke ringkasan pesanan",
		description: "Ringkasan item sebelum pembayaran.",
		focus:
			"Rancang state visual ringkasan pesanan setelah keranjang diisi: daftar item, jumlah, subtotal, ongkos kirim, dan jalur lanjut ke pembayaran. Fokus pada tampilan state yang bisa dirender.",
	},
];

/** A payout workspace needs pages as well as states; reuse the screen lexicon. */
export const EXTRA_DOMAIN_RECIPES: readonly StudioDomainRecipe[] = [
	{
		label: "penerbitan",
		detect: PAYOUT,
		screens: [
			{
				name: "Riwayat Pencairan",
				title: "Tampilkan riwayat pencairan selesai",
				label: "Riwayat Pencairan",
				aliases: ["riwayat payout", "pencairan selesai"],
				description: "Daftar pencairan selesai beserta dokumen bukti.",
				focus:
					"Tampilkan riwayat pencairan yang sudah selesai dengan tanggal, nominal, status, metode pembayaran, dan aksi membuka dokumen bukti.",
			},
			{
				name: "Detail Pencairan",
				title: "Rincian pencairan dan bukti transfer",
				label: "Detail Pencairan",
				aliases: ["detail payout"],
				description: "Rincian nominal, potongan, dan bukti transfer.",
				focus:
					"Tampilkan rincian pencairan: nominal kotor, potongan, nominal diterima, tanggal, status, serta pratinjau dan unduhan bukti transfer.",
			},
		] satisfies readonly StudioScreenConcept[],
	},
];

/**
 * Domain-specific detail wins over the generic "Buat halaman <nama>" copy.
 * Everything else gets a sentence assembled from its own role, never a bare noun.
 */
const SCREEN_CARD_COPY: Record<string, string> = {
	"riwayat perjalanan": "Rancang riwayat perjalanan dengan filter status",
	"wishlist paket wisata": "Bandingkan paket wisata yang tersimpan",
	"studi kasus proyek":
		"Rancang detail studi kasus yang menonjolkan hasil proyek",
	"form kontak": "Tambahkan formulir kontak untuk peluang kerja remote",
	"riwayat pencairan":
		"Tampilkan riwayat pencairan selesai beserta dokumen bukti",
	"detail pencairan": "Rincian pencairan beserta bukti transfer",
	"catat transaksi": "Catat transaksi harian dengan kategori yang jelas",
	"anggaran bulanan": "Susun anggaran bulanan dengan batas per kategori",
	"laporan keuangan": "Tinjau laporan keuangan dengan ringkasan per periode",
	"kategori transaksi": "Atur kategori transaksi dengan ikon yang konsisten",
	keranjang: "Periksa keranjang sebelum melanjutkan pemesanan",
	pembayaran: "Selesaikan pembayaran dengan ringkasan yang jelas",
	katalog: "Susun katalog produk dengan filter yang mudah dipindai",
	"riwayat pesanan": "Lihat riwayat pesanan dengan status yang jelas",
	profil: "Lengkapi profil dengan identitas dan ringkasan aktivitas",
	pengaturan: "Atur preferensi aplikasi dalam grup yang jelas",
	notifikasi: "Periksa notifikasi dengan status baca dan waktu",
	aktivitas: "Tinjau aktivitas terbaru dengan pelaku dan detailnya",
};

export function cardCopyFor(
	name: string,
	title: string,
	description: string,
): string {
	const key = name.toLowerCase().replace(/\s+/g, " ").trim();
	const specific = SCREEN_CARD_COPY[key];
	if (specific) return specific;
	const detail = description
		.replace(/\s+/g, " ")
		.trim()
		.replace(/[.!?]+$/, "");
	const action = title
		.replace(/^Buat halaman\s+/i, "Rancang ")
		.replace(/[.!?]+$/, "")
		.trim();
	if (!detail) return `${action} untuk melengkapi alur project.`;
	return `${action} dengan ${detail.charAt(0).toLowerCase()}${detail.slice(1)}.`;
}
