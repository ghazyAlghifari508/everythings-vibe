import type { StudioDesignMode } from "@/features/studio/types/studio-prompts";

/**
 * Next-screen lexicon. A concept only becomes a suggestion when the project's
 * own text (the PRD, an earlier screen request, an existing screen name, or its
 * own domain words) names it, so unrelated projects never share a list.
 */

export interface StudioScreenConcept {
	/** Screen name; the prompt carries it and the composer intent reads it back. */
	name: string;
	/** Action label for the row; `Buat halaman <name>` when omitted. */
	title?: string;
	/**
	 * Other names that mean this same screen. Without them a canvas holding
	 * "Checkout" would still be offered "Pembayaran".
	 */
	aliases?: readonly string[];
	/** One short line: what the user gets from this screen. */
	description: string;
	/** What the screen must contain; becomes the prompt body. */
	focus: string;
}

export interface StudioScreenRecipe extends StudioScreenConcept {
	/** Omitted recipes apply to both platforms. */
	platforms?: readonly StudioDesignMode[];
	triggers: RegExp;
}

const PROFIL: StudioScreenConcept = {
	name: "Profil",
	title: "Buat halaman profil",
	aliases: ["profile", "akun", "profil pengguna"],
	description: "Identitas pengguna, ringkasan aktivitas, dan aksi keluar.",
	focus:
		"Tampilkan identitas pengguna, ringkasan aktivitas terakhir, serta aksi mengubah data dan keluar.",
};

const PENGATURAN: StudioScreenConcept = {
	name: "Pengaturan",
	title: "Buat halaman pengaturan",
	aliases: ["setting", "preferensi", "pengaturan aplikasi"],
	description: "Preferensi aplikasi dalam grup yang jelas.",
	focus:
		"Tampilkan preferensi aplikasi dalam grup yang jelas dengan kontrol simpan dan umpan balik.",
};

const NOTIFIKASI: StudioScreenConcept = {
	name: "Notifikasi",
	title: "Buat halaman notifikasi",
	aliases: ["notification", "pemberitahuan", "notifikasi pesan"],
	description: "Daftar pemberitahuan dengan status baca.",
	focus:
		"Tampilkan daftar pemberitahuan dengan status baca, waktu, dan state kosong.",
};

const AKTIVITAS: StudioScreenConcept = {
	name: "Aktivitas",
	title: "Buat halaman aktivitas",
	aliases: ["activity", "audit log", "log aktivitas"],
	description: "Jejak perubahan terbaru beserta pelakunya.",
	focus:
		"Tampilkan jejak aktivitas terbaru dengan waktu, pelaku, dan detail perubahan.",
};

/**
 * Capability lexicon ordered by how early a screen usually matters in a
 * product flow. Within the PRD/request rank the first matches take the slots.
 */
export const SCREEN_RECIPES: readonly StudioScreenRecipe[] = [
	{
		name: "Catat Transaksi",
		title: "Catat transaksi harian",
		aliases: ["input transaksi", "tambah transaksi", "transaksi baru"],
		triggers: /\b(transaksi|pemasukan|pengeluaran|pencatatan)\b/i,
		description: "Nominal, kategori, dan daftar transaksi terbaru.",
		focus:
			"Sediakan formulir pencatatan dengan nominal, tanggal, kategori, sumber dana, catatan, dan daftar transaksi terbaru.",
	},
	{
		name: "Anggaran",
		title: "Susun anggaran bulanan",
		aliases: ["budget", "anggaran bulanan", "batas pengeluaran"],
		triggers: /\b(anggaran|budget|batas pengeluaran)\b/i,
		description: "Batas per kategori dan progres pemakaian.",
		focus:
			"Tampilkan daftar kategori anggaran dengan batas, realisasi, progres pemakaian, serta aksi mengubah batas.",
	},
	{
		name: "Laporan",
		title: "Buat laporan berkala",
		aliases: ["report", "analitik", "analytics", "laporan keuangan"],
		triggers: /\b(laporan|report|analitik|analytics)\b/i,
		description: "Angka utama, tren, dan rincian per kategori.",
		focus:
			"Tampilkan ringkasan periode, angka utama, grafik tren, rincian per kategori, dan aksi ekspor.",
	},
	{
		name: "Katalog",
		title: "Susun katalog item",
		aliases: ["catalog", "menu", "daftar produk", "produk"],
		triggers: /\b(katalog|catalog|menu|produk)\b/i,
		description: "Daftar item dengan harga, kategori, dan pencarian.",
		focus:
			"Tampilkan daftar item dengan gambar, harga, kategori, pencarian, serta aksi membuka detail.",
	},
	{
		name: "Keranjang",
		title: "Buat keranjang belanja",
		aliases: ["cart", "belanja", "daftar belanja"],
		triggers: /\b(keranjang|cart|belanja)\b/i,
		description: "Item terpilih, pengatur jumlah, dan subtotal.",
		focus:
			"Tampilkan item terpilih dengan pengatur jumlah, subtotal, dan state kosong.",
	},
	{
		name: "Pembayaran",
		title: "Rancang halaman pembayaran",
		aliases: ["checkout", "bayar", "pembayaran pesanan"],
		triggers: /\b(checkout|pembayaran|payment|bayar)\b/i,
		description: "Ringkasan pesanan, metode bayar, dan status proses.",
		focus:
			"Tampilkan ringkasan pesanan, pilihan metode pembayaran, validasi input, dan status proses.",
	},
	{
		name: "Pesanan",
		title: "Lacak status pesanan",
		aliases: ["order", "pesanan saya", "riwayat pesanan", "pelacakan pesanan"],
		triggers: /\b(pesanan|order|pengiriman|pelacakan|tracking)\b/i,
		description: "Status, riwayat perubahan, dan estimasi.",
		focus:
			"Tampilkan status pesanan, riwayat perubahan status, estimasi, dan aksi tindak lanjut.",
	},
	{
		name: "Stok",
		title: "Kelola stok barang",
		aliases: ["inventori", "inventory", "persediaan", "stok barang"],
		triggers: /\b(stok|inventori|inventory|persediaan)\b/i,
		description: "Level minimum dan peringatan menipis.",
		focus:
			"Tampilkan tabel stok per item, level minimum, peringatan menipis, dan aksi penyesuaian.",
	},
	{
		name: "Pelanggan",
		title: "Buat halaman pelanggan",
		aliases: ["customer", "klien", "member", "pelanggan setia"],
		triggers: /\b(pelanggan|customer|klien|member)\b/i,
		description: "Daftar pelanggan dengan status dan nilai transaksi.",
		focus:
			"Tampilkan daftar pelanggan dengan pencarian, status, nilai transaksi, dan aksi membuka detail.",
	},
	{
		name: "Jadwal",
		title: "Atur jadwal dan slot",
		aliases: ["kalender", "calendar", "booking", "reservasi"],
		triggers: /\b(jadwal|kalender|calendar|booking|reservasi)\b/i,
		description: "Slot tersedia dan pemilihan waktu.",
		focus:
			"Tampilkan kalender dengan slot tersedia, detail jadwal, dan aksi memilih waktu.",
	},
	{ ...PROFIL, triggers: /\b(profil|profile|akun|account)\b/i },
	{
		...PENGATURAN,
		triggers: /\b(pengaturan|setting|preferensi|preference)\b/i,
	},
	{
		...NOTIFIKASI,
		platforms: ["mobile"],
		triggers: /\b(notifikasi|notification|pemberitahuan)\b/i,
	},
	{
		...AKTIVITAS,
		platforms: ["web"],
		triggers: /\b(aktivitas|activity|audit log)\b/i,
	},
	{
		name: "Masuk",
		title: "Buat halaman masuk",
		aliases: ["login", "sign in", "signin", "halaman masuk"],
		triggers: /\b(masuk|login|daftar akun|register|sign in|sign up)\b/i,
		description: "Formulir masuk, validasi, dan lupa kata sandi.",
		focus:
			"Tampilkan formulir masuk dengan validasi, lupa kata sandi, dan pilihan metode autentikasi.",
	},
];

export interface StudioDomainRecipe {
	/** Domain name used in the suggestion reason. */
	label: string;
	/** Project text that marks this product domain. */
	detect: RegExp;
	/** Screens this domain usually needs next. */
	screens: readonly StudioScreenConcept[];
}

/**
 * Product domains read from the project's own words (PRD, title, blueprint
 * identity, existing screen names). These screens describe the workflow that
 * follows the screens already on the canvas, which is what a generic page name
 * cannot express.
 */
export const DOMAIN_RECIPES: readonly StudioDomainRecipe[] = [
	{
		label: "travel",
		detect:
			/\b(wisata|travel|perjalanan|liburan|destinasi|tiket|hotel|penerbangan|tour|kunjungan)\b/i,
		screens: [
			{
				name: "Riwayat Perjalanan",
				title: "Buat halaman riwayat perjalanan",
				aliases: ["perjalanan saya", "riwayat pesanan"],
				description: "Pesanan, pembayaran, dan e-tiket.",
				focus:
					"Tampilkan daftar pesanan sebelumnya dan perjalanan mendatang, ringkasan paket, tanggal keberangkatan, status pembayaran, serta akses detail pesanan dan e-tiket.",
			},
			{
				name: "Wishlist Paket Wisata",
				title: "Rancang wishlist paket wisata",
				aliases: ["wishlist", "favorit", "saved trips", "paket favorit"],
				description: "Simpan favorit dan bandingkan destinasi.",
				focus:
					"Tampilkan paket yang disimpan dengan foto, harga, durasi, serta aksi membandingkan dan menghapus dari daftar.",
			},
			{
				name: "Profil Traveler",
				title: "Tambahkan profil traveler",
				aliases: ["profil", "profil pengguna", "akun"],
				description: "Identitas, kontak, dan data penumpang.",
				focus:
					"Tampilkan identitas traveler, kontak, dokumen perjalanan, serta aksi mengubah profil dan mengelola data penumpang.",
			},
		],
	},
	{
		label: "keuangan",
		detect:
			/\b(keuangan|dompet|finansial|tabungan|investasi|anggaran|budget|pengeluaran|pemasukan|saldo)\b/i,
		screens: [
			{
				name: "Kategori Transaksi",
				title: "Atur kategori transaksi",
				aliases: ["kategori", "transaksi kategori"],
				description: "Grup pemasukan dan pengeluaran beserta ikonnya.",
				focus:
					"Tampilkan daftar kategori pemasukan dan pengeluaran dengan ikon, warna, serta aksi menambah dan mengubah kategori.",
			},
			{
				name: "Anggaran Bulanan",
				title: "Susun anggaran bulanan",
				aliases: ["anggaran", "budget", "batas pengeluaran"],
				description: "Batas per kategori dan progres pemakaian.",
				focus:
					"Tampilkan anggaran tiap kategori dengan batas, realisasi, progres pemakaian, dan aksi mengubah batas.",
			},
			{
				name: "Laporan Keuangan",
				title: "Buat laporan keuangan",
				aliases: ["laporan", "report", "analitik"],
				description: "Tren saldo, rincian per kategori, dan ekspor.",
				focus:
					"Tampilkan ringkasan periode, tren saldo, rincian per kategori, dan aksi mengekspor laporan.",
			},
			{
				name: "Tujuan Tabungan",
				title: "Tetapkan tujuan tabungan",
				aliases: ["target tabungan", "goal", "goals", "tabungan"],
				description: "Target dana, tenggat, dan progres sisihan.",
				focus:
					"Tampilkan daftar tujuan tabungan dengan target dana, tenggat, progres terkumpul, serta aksi menambah sisihan.",
			},
		],
	},
];

export const PLATFORM_FALLBACK: Record<
	StudioDesignMode,
	readonly StudioScreenConcept[]
> = {
	mobile: [PROFIL, PENGATURAN, NOTIFIKASI],
	web: [PROFIL, PENGATURAN, AKTIVITAS],
};

export const GENERIC_FOCUS =
	"Tampilkan konten utama layar ini lengkap dengan data, state kosong, dan aksi utamanya.";

export const NAV_DESTINATION_DESCRIPTION =
	"Destinasi navigasi yang belum punya halaman.";
