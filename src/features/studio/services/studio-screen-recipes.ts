import type { StudioDesignMode } from "@/features/studio/types/studio-prompts";

/**
 * Domain capability lexicon for next-screen suggestions. A recipe only becomes
 * a suggestion when the project text (PRD or an earlier screen request) names
 * it, so unrelated projects never share the same list.
 */

const FOCUS = {
	profile:
		"Tampilkan identitas pengguna, ringkasan aktivitas, serta aksi mengubah data dan keluar.",
	settings:
		"Tampilkan preferensi aplikasi dalam grup yang jelas dengan kontrol simpan dan umpan balik.",
	notifications:
		"Tampilkan daftar pemberitahuan dengan status baca, waktu, dan state kosong.",
	activity:
		"Tampilkan jejak aktivitas terbaru dengan waktu, pelaku, dan detail perubahan.",
} as const;

interface StudioScreenRecipe {
	name: string;
	/** Omitted recipes apply to both platforms. */
	platforms?: readonly StudioDesignMode[];
	triggers: RegExp;
	focus: string;
}

/**
 * Domain capability lexicon, not a fixed carousel: a recipe only becomes a
 * suggestion when the project's own PRD mentions it, so unrelated projects
 * never share the same list.
 */
export const SCREEN_RECIPES: readonly StudioScreenRecipe[] = [
	{
		name: "Catat Transaksi",
		triggers: /\b(transaksi|pemasukan|pengeluaran|pencatatan)\b/i,
		focus:
			"Sediakan formulir pencatatan dengan nominal, tanggal, kategori, sumber dana, catatan, dan daftar transaksi terbaru.",
	},
	{
		name: "Anggaran",
		triggers: /\b(anggaran|budget|batas pengeluaran)\b/i,
		focus:
			"Tampilkan daftar kategori anggaran dengan batas, realisasi, progres pemakaian, serta aksi mengubah batas.",
	},
	{
		name: "Laporan",
		triggers: /\b(laporan|report|analitik|analytics)\b/i,
		focus:
			"Tampilkan ringkasan periode, angka utama, grafik tren, rincian per kategori, dan aksi ekspor.",
	},
	{
		name: "Katalog",
		triggers: /\b(katalog|catalog|menu|produk)\b/i,
		focus:
			"Tampilkan daftar item dengan gambar, harga, kategori, pencarian, serta aksi membuka detail.",
	},
	{
		name: "Keranjang",
		triggers: /\b(keranjang|cart|belanja)\b/i,
		focus:
			"Tampilkan item terpilih dengan pengatur jumlah, subtotal, dan state kosong.",
	},
	{
		name: "Pembayaran",
		triggers: /\b(checkout|pembayaran|payment|bayar)\b/i,
		focus:
			"Tampilkan ringkasan pesanan, pilihan metode pembayaran, validasi input, dan status proses.",
	},
	{
		name: "Pesanan",
		triggers: /\b(pesanan|order|pengiriman|pelacakan|tracking)\b/i,
		focus:
			"Tampilkan status pesanan, riwayat perubahan status, estimasi, dan aksi tindak lanjut.",
	},
	{
		name: "Stok",
		triggers: /\b(stok|inventori|inventory|persediaan)\b/i,
		focus:
			"Tampilkan tabel stok per item, level minimum, peringatan menipis, dan aksi penyesuaian.",
	},
	{
		name: "Pelanggan",
		triggers: /\b(pelanggan|customer|klien|member)\b/i,
		focus:
			"Tampilkan daftar pelanggan dengan pencarian, status, nilai transaksi, dan aksi membuka detail.",
	},
	{
		name: "Jadwal",
		triggers: /\b(jadwal|kalender|calendar|booking|reservasi)\b/i,
		focus:
			"Tampilkan kalender dengan slot tersedia, detail jadwal, dan aksi memilih waktu.",
	},
	{
		name: "Profil",
		triggers: /\b(profil|profile|akun|account)\b/i,
		focus: FOCUS.profile,
	},
	{
		name: "Pengaturan",
		triggers: /\b(pengaturan|setting|preferensi|preference)\b/i,
		focus: FOCUS.settings,
	},
	{
		name: "Notifikasi",
		platforms: ["mobile"],
		triggers: /\b(notifikasi|notification|pemberitahuan)\b/i,
		focus: FOCUS.notifications,
	},
	{
		name: "Aktivitas",
		platforms: ["web"],
		triggers: /\b(aktivitas|activity|audit log)\b/i,
		focus: FOCUS.activity,
	},
	{
		name: "Masuk",
		triggers: /\b(masuk|login|daftar akun|register|sign in|sign up)\b/i,
		focus:
			"Tampilkan formulir masuk dengan validasi, lupa kata sandi, dan pilihan metode autentikasi.",
	},
];

export const PLATFORM_FALLBACK: Record<
	StudioDesignMode,
	readonly { name: string; focus: string }[]
> = {
	mobile: [
		{ name: "Profil", focus: FOCUS.profile },
		{ name: "Pengaturan", focus: FOCUS.settings },
		{ name: "Notifikasi", focus: FOCUS.notifications },
	],
	web: [
		{ name: "Profil", focus: FOCUS.profile },
		{ name: "Pengaturan", focus: FOCUS.settings },
		{ name: "Aktivitas", focus: FOCUS.activity },
	],
};

export const GENERIC_FOCUS =
	"Tampilkan konten utama layar ini lengkap dengan data, state kosong, dan aksi utamanya.";
