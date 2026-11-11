import type { StudioDesignMode } from "@/features/studio/types/studio-prompts";

/**
 * Next-screen lexicon. A concept only becomes a suggestion when the project's
 * own text (the PRD, an earlier screen request, an existing screen name, or its
 * own domain words) names it, so unrelated projects never share a list.
 *
 * `label` is the bubble text: a short, domain-specific action phrase
 * ("Bagi Biaya Trip"), never a bare page noun. `focus` is the body the prompt
 * carries, so it has to name the content, states and actions the screen needs.
 */

export interface StudioScreenConcept {
	/** Screen name; the prompt carries it and the composer intent reads it back. */
	name: string;
	/** Action label for the row; `Buat halaman <name>` when omitted. */
	title?: string;
	/** Short label displayed on compact bubbles/pills, e.g. "Kelola Stok", "Beranda". */
	label?: string;
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
	label: "Atur Profil",
	aliases: ["profile", "akun", "profil pengguna"],
	description: "Identitas pengguna, ringkasan aktivitas, dan aksi keluar.",
	focus:
		"Tampilkan identitas pengguna, ringkasan aktivitas terakhir, serta aksi mengubah data dan keluar.",
};

const PENGATURAN: StudioScreenConcept = {
	name: "Pengaturan",
	title: "Buat halaman pengaturan",
	label: "Atur Preferensi",
	aliases: ["setting", "preferensi", "pengaturan aplikasi"],
	description: "Preferensi aplikasi dalam grup yang jelas.",
	focus:
		"Tampilkan preferensi aplikasi dalam grup yang jelas dengan kontrol simpan dan umpan balik.",
};

const NOTIFIKASI: StudioScreenConcept = {
	name: "Notifikasi",
	title: "Buat halaman notifikasi",
	label: "Cek Notifikasi",
	aliases: ["notification", "pemberitahuan", "notifikasi pesan"],
	description: "Daftar pemberitahuan dengan status baca.",
	focus:
		"Tampilkan daftar pemberitahuan dengan status baca, waktu, dan state kosong.",
};

const AKTIVITAS: StudioScreenConcept = {
	name: "Aktivitas",
	title: "Buat halaman aktivitas",
	label: "Tinjau Aktivitas",
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
		label: "Catat Transaksi",
		aliases: ["input transaksi", "tambah transaksi", "transaksi baru"],
		triggers: /\b(transaksi|pemasukan|pengeluaran|pencatatan)\b/i,
		description: "Nominal, kategori, dan daftar transaksi terbaru.",
		focus:
			"Sediakan formulir pencatatan dengan nominal, tanggal, kategori, sumber dana, catatan, dan daftar transaksi terbaru lengkap dengan state kosong serta aksi mengubah atau menghapus catatan.",
	},
	{
		name: "Anggaran",
		title: "Susun anggaran bulanan",
		label: "Susun Anggaran",
		aliases: ["budget", "anggaran bulanan", "batas pengeluaran"],
		triggers: /\b(anggaran|budget|batas pengeluaran)\b/i,
		description: "Batas per kategori dan progres pemakaian.",
		focus:
			"Tampilkan daftar kategori anggaran dengan batas, realisasi, progres pemakaian, sisa anggaran, serta aksi mengubah batas dan peringatan saat pemakaian hampir penuh.",
	},
	{
		name: "Laporan",
		title: "Buat laporan berkala",
		label: "Tinjau Laporan",
		aliases: ["report", "analitik", "analytics", "laporan keuangan"],
		triggers: /\b(laporan|report|analitik|analytics)\b/i,
		description: "Angka utama, tren, dan rincian per kategori.",
		focus:
			"Tampilkan ringkasan periode, angka utama, grafik tren, rincian per kategori, filter rentang waktu, dan aksi ekspor.",
	},
	{
		name: "Katalog",
		title: "Susun katalog item",
		label: "Susun Katalog",
		aliases: ["catalog", "menu", "daftar produk", "produk"],
		triggers: /\b(katalog|catalog|menu|daftar produk|kategori produk)\b/i,
		description: "Daftar item dengan harga, kategori, dan pencarian.",
		focus:
			"Tampilkan daftar item dengan gambar, harga, kategori, pencarian, filter, serta aksi membuka detail.",
	},
	{
		name: "Keranjang",
		title: "Buat keranjang belanja",
		label: "Periksa Keranjang",
		aliases: ["cart", "belanja", "daftar belanja"],
		triggers: /\b(keranjang|cart|belanja)\b/i,
		description: "Item terpilih, pengatur jumlah, dan subtotal.",
		focus:
			"Tampilkan item terpilih dengan pengatur jumlah, subtotal, ringkasan biaya, dan state kosong yang mengarahkan kembali ke katalog.",
	},
	{
		name: "Pembayaran",
		title: "Rancang halaman pembayaran",
		label: "Selesaikan Pembayaran",
		aliases: ["checkout", "bayar", "pembayaran pesanan"],
		triggers: /\b(checkout|pembayaran|payment|bayar)\b/i,
		description: "Ringkasan pesanan, metode bayar, dan status proses.",
		focus:
			"Tampilkan ringkasan pesanan, pilihan metode pembayaran, validasi input, status proses, dan konfirmasi akhir.",
	},
	{
		name: "Pesanan",
		title: "Lacak status pesanan",
		label: "Lacak Pesanan",
		aliases: ["order", "pesanan saya", "riwayat pesanan", "pelacakan pesanan"],
		triggers: /\b(pesanan|order|pengiriman|pelacakan|tracking)\b/i,
		description: "Status, riwayat perubahan, dan estimasi.",
		focus:
			"Tampilkan status pesanan, riwayat perubahan status, estimasi, detail pengiriman, dan aksi tindak lanjut.",
	},
	{
		name: "Stok",
		title: "Kelola stok barang",
		label: "Kelola Stok",
		aliases: ["inventori", "inventory", "persediaan", "stok barang"],
		triggers: /\b(stok|inventori|inventory|persediaan)\b/i,
		description: "Level minimum dan peringatan menipis.",
		focus:
			"Tampilkan tabel stok per item, level minimum, peringatan menipis, dan aksi penyesuaian.",
	},
	{
		name: "Pelanggan",
		title: "Buat halaman pelanggan",
		label: "Kelola Pelanggan",
		aliases: ["customer", "klien", "member", "pelanggan setia"],
		triggers: /\b(pelanggan|customer|klien|member)\b/i,
		description: "Daftar pelanggan dengan status dan nilai transaksi.",
		focus:
			"Tampilkan daftar pelanggan dengan pencarian, status, nilai transaksi, dan aksi membuka detail.",
	},
	{
		name: "Jadwal",
		title: "Atur jadwal dan slot",
		label: "Atur Jadwal",
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
		label: "Masuk & Daftar",
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
 * identity, audience, screen names). These screens describe the workflow that
 * follows the screens already on the canvas, which is what a generic page name
 * cannot express. Order matters: the first matching domain takes the slots.
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
				label: "Riwayat Perjalanan",
				aliases: ["perjalanan saya"],
				description: "Pesanan, pembayaran, dan e-tiket.",
				focus:
					"Tampilkan daftar pesanan sebelumnya dan perjalanan mendatang, ringkasan paket, tanggal keberangkatan, status pembayaran, serta akses detail pesanan dan e-tiket.",
			},
			{
				name: "Wishlist Paket Wisata",
				title: "Rancang wishlist paket wisata",
				label: "Simpan Favorit",
				aliases: ["wishlist", "favorit", "saved trips", "paket favorit"],
				description: "Simpan favorit dan bandingkan destinasi.",
				focus:
					"Tampilkan paket yang disimpan dengan foto, harga, durasi, serta aksi membandingkan dan menghapus dari daftar.",
			},
			{
				name: "Profil Traveler",
				title: "Tambahkan profil traveler",
				label: "Atur Profil Traveler",
				aliases: ["profil", "profil pengguna", "akun"],
				description: "Identitas, kontak, dan data penumpang.",
				focus:
					"Tampilkan identitas traveler, kontak, dokumen perjalanan, serta aksi mengubah profil dan mengelola data penumpang.",
			},
			{
				name: "Jelajahi Destinasi",
				title: "Buka jelajah destinasi",
				label: "Jelajahi Destinasi",
				aliases: ["eksplor destinasi", "daftar destinasi", "explore"],
				description: "Destinasi per wilayah dengan rekomendasi.",
				focus:
					"Tampilkan destinasi populer per wilayah dengan kartu bergambar, rentang harga, rating, filter kategori, dan aksi menyimpan ke rencana perjalanan.",
			},
			{
				name: "Temukan Festival",
				title: "Temukan festival dan acara",
				label: "Temukan Festival",
				aliases: ["event wisata", "acara lokal", "festival"],
				description: "Acara lokal beserta tanggal dan lokasinya.",
				focus:
					"Tampilkan festival dan acara lokal dengan tanggal, lokasi, harga tiket, serta aksi menambahkan acara ke rencana perjalanan.",
			},
			{
				name: "Bagi Biaya Trip",
				title: "Bagi biaya perjalanan",
				label: "Bagi Biaya Trip",
				aliases: ["split bill", "patungan", "pembagian biaya"],
				description: "Pengeluaran trip dan status pelunasan anggota.",
				focus:
					"Tampilkan pembagian biaya perjalanan untuk anggota grup: daftar pengeluaran, siapa yang membayar, peserta yang berbagi biaya, total per anggota, ringkasan siapa melunasi siapa, dan status pelunasan.",
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
				label: "Atur Kategori",
				aliases: ["kategori", "transaksi kategori"],
				description: "Grup pemasukan dan pengeluaran beserta ikonnya.",
				focus:
					"Tampilkan daftar kategori pemasukan dan pengeluaran dengan ikon, warna, serta aksi menambah dan mengubah kategori.",
			},
			{
				name: "Anggaran Bulanan",
				title: "Susun anggaran bulanan",
				label: "Susun Anggaran",
				aliases: ["anggaran", "budget", "batas pengeluaran"],
				description: "Batas per kategori dan progres pemakaian.",
				focus:
					"Tampilkan anggaran tiap kategori dengan batas, realisasi, progres pemakaian, dan aksi mengubah batas.",
			},
			{
				name: "Laporan Keuangan",
				title: "Buat laporan keuangan",
				label: "Baca Laporan",
				aliases: ["laporan", "report", "analitik"],
				description: "Tren saldo, rincian per kategori, dan ekspor.",
				focus:
					"Tampilkan ringkasan periode, tren saldo, rincian per kategori, dan aksi mengekspor laporan.",
			},
			{
				name: "Tujuan Tabungan",
				title: "Tetapkan tujuan tabungan",
				label: "Tetapkan Tujuan",
				aliases: ["target tabungan", "goal", "goals", "tabungan"],
				description: "Target dana, tenggat, dan progres sisihan.",
				focus:
					"Tampilkan daftar tujuan tabungan dengan target dana, tenggat, progres terkumpul, serta aksi menambah sisihan.",
			},
		],
	},
	{
		label: "kuliner",
		detect:
			/\b(kopi|kafe|cafe|kedai|restoran|kuliner|warung|menu makanan|resep|sajian|roastery)\b/i,
		screens: [
			{
				name: "Riwayat Pesanan",
				title: "Buka riwayat pesanan",
				label: "Riwayat Pesanan",
				aliases: ["pesanan saya", "order", "riwayat order"],
				description: "Pesanan sebelumnya dan aksi pesan ulang.",
				focus:
					"Tampilkan riwayat pesanan dengan waktu, item, jumlah, total, status pesanan, serta aksi memesan ulang pesanan yang sama.",
			},
			{
				name: "Favorit Kopi",
				title: "Simpan favorit kopi",
				label: "Favorit Kopi",
				aliases: ["favorit", "wishlist", "saved", "kopi favorit"],
				description: "Menu favorit, catatan rasa, dan pesan cepat.",
				focus:
					"Tampilkan menu kopi yang disimpan dengan catatan rasa atau level gula, harga, serta aksi menambahkan langsung ke keranjang.",
			},
			{
				name: "Detail Promo",
				title: "Kelola detail promo",
				label: "Detail Promo",
				aliases: ["promo", "voucher", "kupon", "diskon"],
				description: "Voucher aktif, syarat, dan masa berlaku.",
				focus:
					"Tampilkan daftar promo dengan syarat pemakaian, nilai potongan, masa berlaku, dan aksi memakai voucher pada pesanan.",
			},
		],
	},
	{
		label: "portofolio",
		detect:
			/\b(portofolio|portfolio|freelance|agensi|showcase|karya|proyek desain|studi kasus)\b/i,
		screens: [
			{
				name: "Studi Kasus Proyek",
				title: "Tulis studi kasus proyek",
				label: "Studi Kasus Proyek",
				aliases: ["case study", "studi kasus", "detail proyek", "proyek"],
				description: "Masalah, proses, dan hasil setiap proyek.",
				focus:
					"Tampilkan halaman studi kasus satu proyek: konteks dan masalah, proses yang dijalankan, peran yang diambil, hasil dengan angka, serta galeri visual.",
			},
			{
				name: "Pengalaman Kerja",
				title: "Susun pengalaman kerja",
				label: "Pengalaman Kerja",
				aliases: ["experience", "pengalaman", "riwayat kerja", "cv"],
				description: "Peran, perusahaan, dan pencapaian tiap periode.",
				focus:
					"Tampilkan riwayat pengalaman kerja berurutan waktu dengan peran, perusahaan, periode, dan pencapaian utama, dalam tata letak yang mudah dipindai.",
			},
			{
				name: "Form Kontak",
				title: "Buat formulir kontak",
				label: "Form Kontak",
				aliases: ["kontak", "hubungi saya", "contact", "kirim pesan"],
				description: "Formulir kirim pesan dengan validasi.",
				focus:
					"Tampilkan formulir kontak dengan nama, email, kebutuhan proyek, validasi input, status pengiriman, dan konfirmasi berhasil.",
			},
		],
	},
	{
		label: "kesehatan",
		detect:
			/\b(klinik|dokter|pasien|apotek|kesehatan|rumah sakit|poli|resep obat|rekam medis)\b/i,
		screens: [
			{
				name: "Jadwal Praktik",
				title: "Lihat jadwal praktik",
				label: "Jadwal Praktik",
				aliases: ["jadwal dokter", "praktik", "slot dokter"],
				description: "Jadwal dokter dan pemilihan jam kunjungan.",
				focus:
					"Tampilkan jadwal praktik per dokter dan poli dengan tanggal, jam tersedia, sisa slot, dan aksi memilih jadwal kunjungan.",
			},
			{
				name: "Riwayat Pemeriksaan",
				title: "Buka riwayat pemeriksaan",
				label: "Riwayat Periksa",
				aliases: ["riwayat medis", "rekam medis", "pemeriksaan"],
				description: "Kunjungan sebelumnya, diagnosis, dan catatan.",
				focus:
					"Tampilkan riwayat kunjungan dengan tanggal, dokter, diagnosis, catatan tindak lanjut, dan aksi membuka detail.",
			},
			{
				name: "Hasil Lab",
				title: "Lihat hasil laboratorium",
				label: "Hasil Lab",
				aliases: ["laboratorium", "hasil tes", "lab"],
				description: "Nilai hasil lab dengan rentang normal.",
				focus:
					"Tampilkan hasil laboratorium dengan nilai, rentang normal, penanda nilai di luar rentang, tanggal pemeriksaan, dan aksi mengunduh dokumen.",
			},
		],
	},
	{
		label: "edukasi",
		detect:
			/\b(kursus|belajar|pembelajaran|sekolah|kampus|kelas|siswa|mahasiswa|materi|ujian|edukasi)\b/i,
		screens: [
			{
				name: "Materi Belajar",
				title: "Susun materi belajar",
				label: "Materi Belajar",
				aliases: ["materi", "modul", "pelajaran"],
				description: "Modul per topik dengan status penyelesaian.",
				focus:
					"Tampilkan daftar modul dan materi per topik dengan durasi, status penyelesaian, serta aksi melanjutkan materi terakhir.",
			},
			{
				name: "Progres Belajar",
				title: "Tampilkan progres belajar",
				label: "Progres Belajar",
				aliases: ["kemajuan", "progress", "nilai"],
				description: "Penyelesaian, nilai, dan target berikutnya.",
				focus:
					"Tampilkan progres belajar dengan persentase penyelesaian, nilai per materi, riwayat aktivitas, dan target belajar berikutnya.",
			},
			{
				name: "Sertifikat Kelas",
				title: "Terbitkan sertifikat kelas",
				label: "Sertifikat Kelas",
				aliases: ["sertifikat", "certificate", "kelulusan"],
				description: "Sertifikat selesai kelas dan unduhannya.",
				focus:
					"Tampilkan daftar sertifikat kelas yang selesai dengan nama kelas, tanggal kelulusan, nomor sertifikat, dan aksi mengunduh atau membagikan.",
			},
		],
	},
];

/**
 * The screen a screen usually leads into. A canvas holding "Katalog" needs a way
 * to reach the cart, and "Jelajahi Destinasi" needs a place to save what was
 * found; no page name alone expresses that gap. Successors resolve through
 * `conceptForName`, so they inherit the lexicon's label, description and focus.
 */
export const FLOW_SUCCESSORS: Record<string, readonly string[]> = {
	katalog: ["Keranjang", "Pembayaran"],
	keranjang: ["Pembayaran", "Pesanan"],
	pembayaran: ["Pesanan"],
	pesanan: ["Pelanggan"],
	"catat transaksi": ["Anggaran", "Laporan"],
	anggaran: ["Laporan"],
	"kategori transaksi": ["Tujuan Tabungan"],
	"jelajahi destinasi": ["Wishlist Paket Wisata", "Bagi Biaya Trip"],
	"detail paket": ["Pembayaran", "Riwayat Perjalanan"],
	"detail promo": ["Keranjang"],
	"riwayat pesanan": ["Favorit Kopi"],
	"studi kasus proyek": ["Form Kontak"],
	"jadwal praktik": ["Riwayat Pemeriksaan"],
	"materi belajar": ["Progres Belajar", "Sertifikat Kelas"],
};

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
