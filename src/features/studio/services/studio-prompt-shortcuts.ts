import { z } from "zod";
import {
	STUDIO_MAX_PAGE_COUNT,
	STUDIO_MIN_PAGE_COUNT,
} from "./studio-generation-options";

// A shortcut populates the composer with a full editable brief. It never
// submits on its own and never overrides an explicitly selected skill or
// design reference.
export const studioPromptShortcutSchema = z.object({
	id: z.string().min(1).max(100),
	title: z.string().min(1).max(120),
	category: z.string().min(1).max(80),
	designMode: z.enum(["web", "mobile"]),
	initialPageCount: z
		.number()
		.int()
		.min(STUDIO_MIN_PAGE_COUNT)
		.max(STUDIO_MAX_PAGE_COUNT),
	preview: z.string().min(1).max(280),
	prompt: z.string().min(200).max(6000),
});

export type StudioPromptShortcut = z.infer<typeof studioPromptShortcutSchema>;

export const STUDIO_PROMPT_SHORTCUTS: readonly StudioPromptShortcut[] = [
	{
		id: "coffee-ordering",
		title: "Kopi Specialty Ordering",
		category: "Food & Beverage",
		designMode: "mobile",
		initialPageCount: 4,
		preview:
			"Aplikasi pesan kopi specialty: eksplorasi menu, kustomisasi minuman, keranjang, dan lacak pesanan.",
		prompt: `Aplikasi mobile ordering untuk kedai kopi specialty "Ruang Seduh".

Alur dan area utama:
- Beranda eksplorasi: hero promo, kategori minuman (Espresso, Manual Brew, Non-Kopi), kartu produk dengan foto, harga Rupiah realistis (Rp18.000-Rp45.000), rating, dan badge best-seller.
- Detail produk & kustomisasi: pilihan ukuran cup (Regular/Large), jenis susu (Fresh Milk, Oat, Almond, Soy), level gula (0/30/50/70/100%), extra shot, topping, suhu (panas/dingin), catatan barista, dan pemilihan jumlah.
- Keranjang & checkout: daftar item pesanan dengan rincian kustomisasi, opsi ambil di gerai atau pengantaran, pemilihan lokasi gerai, metode pembayaran (QRIS, e-wallet, tunai), dan rincian ringkasan harga.
- Pelacakan pesanan: status progres pemrosesan (Diterima, Diseduh, Siap Diambil, Selesai), estimasi waktu penyiapan, kode pengambilan pesanan, dan aksi pesan ulang.

Fitur utama: pencarian dan filter menu, program loyalitas poin pelanggan, riwayat pesanan, dan notifikasi status.
Contoh data: 12 menu kopi dan non-kopi (Kopi Susu Gula Aren Rp22.000, V60 Aceh Gayo Rp32.000, Spanish Latte Rp28.000), 3 gerai di Jakarta Selatan, serta stok dan label habis untuk 1 item.
Kondisi UI: state kosong keranjang belanja dengan ajakan pesan, indikator loading saat memproses checkout, pesan error pembayaran dengan aksi coba lagi, dan skeleton saat daftar menu dimuat.
Audiens: pelanggan urban usia 18-35 tahun yang memesan dari ponsel satu tangan; navigasi dan tombol utama mudah dijangkau ibu jari, serta teks harga selalu tabular dan mudah terbaca.`,
	},
	{
		id: "finance-tracker",
		title: "Personal Finance Tracker",
		category: "Keuangan",
		designMode: "mobile",
		initialPageCount: 4,
		preview:
			"Pencatat keuangan pribadi: ringkasan arus kas, anggaran kategori, tambah transaksi, dan laporan.",
		prompt: `Aplikasi mobile pencatat keuangan pribadi "CatatDompet" untuk pengguna Indonesia.

Alur dan area utama:
- Ringkasan keuangan: saldo berjalan bulan ini, perbandingan total pemasukan vs pengeluaran, grafik tren arus kas 6 bulan terakhir, dan daftar transaksi terbaru dengan ikon kategori.
- Pengelolaan anggaran: daftar kategori pengeluaran (Makan, Transportasi, Belanja, Tagihan, Hiburan, Tabungan) dengan indikator progres anggaran vs realisasi, notifikasi peringatan saat pemakaian mencapai 80%, dan penyesuaian batas anggaran.
- Pencatatan transaksi: pilihan tipe Pemasukan/Pengeluaran/Transfer, input nominal dengan format Rupiah otomatis, tanggal transaksi, kategori, dompet sumber dana (Tunai, Rekening Bank, E-wallet), catatan, serta opsi unggah foto struk.
- Laporan & analitik: filter rentang tanggal, ringkasan pengeluaran per kategori dengan persentase, daftar transaksi terbesar, grafik tren harian, dan aksi unduh ringkasan transaksi.

Fitur utama: pencarian transaksi, pengingat tagihan rutin, target menabung dengan indikator progres, dan mode privasi untuk menyembunyikan nominal saldo.
Contoh data: gaji bulanan Rp8.500.000, pengeluaran kopi Rp22.000 x 12, langganan streaming Rp65.000, sewa tempat tinggal Rp1.800.000, dan target dana darurat Rp5.000.000 (tercapai 68%).
Kondisi UI: state kosong saat belum ada catatan transaksi dengan panduan memulai, validasi input nominal nol atau negatif, pesan error sinkronisasi dengan tombol muat ulang, dan dialog konfirmasi sebelum menghapus transaksi.
Audiens: karyawan muda yang mencatat pengeluaran harian; alur pencatatan transaksi harus selesai dalam 3 langkah singkat dan nyaman dioperasikan dengan satu tangan.`,
	},
	{
		id: "saas-analytics",
		title: "SaaS Analytics Dashboard",
		category: "Dashboard",
		designMode: "web",
		initialPageCount: 3,
		preview:
			"Dashboard analitik SaaS: metrik MRR/churn, grafik tren, tabel pelanggan, dan filter periode.",
		prompt: `Dashboard analitik web untuk produk SaaS "Metriq" yang dipakai tim growth dan finance.

Alur dan area utama:
- Ikhtisar performa: kartu metrik ringkasan MRR Rp412 jt (+8,2%), pelanggan aktif 1.284 (+96), churn rate 2,1% (-0,4 poin), NPS 54; grafik tren pendapatan bulanan 12 bulan terakhir; diagram komposisi paket langganan (Starter/Growth/Scale); dan log aktivitas penting (upgrade paket, pembayaran gagal, refund).
- Direktori pelanggan: tabel data dengan pencarian nama atau email, filter berdasarkan paket dan status akun (Aktif, Trial, Menunggak, Churn), kolom nilai MRR, tanggal bergabung, serta indikator kesehatan akun; interaksi baris menampilkan panel riwayat pembayaran dan catatan tim.
- Laporan analitik: filter periode waktu (7/30/90 hari, kustom), analisis perbandingan periode, grafik kohort retensi pengguna, daftar pelanggan dengan kontribusi nilai tertinggi dan terendah, serta aksi ekspor data ringkasan.

Fitur utama: filter rentang tanggal global yang memengaruhi seluruh metrik, pencarian tabel interaktif dengan penyorotan teks, pagination, dan ekspor data CSV.
Contoh data: 24 baris data pelanggan Indonesia (PT Maju Jaya Rp4,2 jt/bulan, Kopi Nusantara Rp850 rb/bulan, status trial 6 akun), serta 3 invoice pembayaran tertunda dengan aksi kirim pengingat.
Kondisi UI: skeleton saat data metrik sedang dimuat, state kosong hasil pencarian filter dengan tombol reset filter, pesan error koneksi data dengan tombol coba lagi, dan tooltip penjelasan konteks pada setiap kartu metrik.
Audiens: founder dan tim operasional bisnis non-teknis; format angka memakai notasi Rupiah ringkas (jt/M), label berbahasa Indonesia yang jelas, dan bebas dari jargon teknis database.`,
	},
	{
		id: "travel-booking",
		title: "Travel Booking Experience",
		category: "Travel",
		designMode: "mobile",
		initialPageCount: 5,
		preview:
			"Pemesanan travel: cari destinasi, hasil + filter, detail paket, checkout, dan e-tiket.",
		prompt: `Aplikasi mobile pemesanan travel "Jelajahin" untuk liburan domestik Indonesia.

Alur dan area utama:
- Pencarian destinasi: formulir pencarian dengan rekomendasi populer (Bali, Yogyakarta, Labuan Bajo, Bandung, Lombok), pemilih tanggal keberangkatan dan kepulangan, jumlah wisatawan, serta kategori perjalanan (Pantai, Budaya, Alam, Wisata Kuliner).
- Eksplorasi paket perjalanan: kartu paket dengan galeri visual, durasi trip (misal 3H2M), harga mulai dari Rp1,2 jt per orang, rating dan jumlah ulasan; dilengkapi filter rentang harga, durasi, rating minimal 4.5, dan opsi pengurutan (harga terendah, popularitas, rating).
- Rincian paket: detail itinerary harian yang terstruktur, daftar fasilitas termasuk dan tidak termasuk, pemilihan jadwal keberangkatan, ketersediaan kuota peserta, ulasan wisatawan terverifikasi, dan tombol pemesanan.
- Alur pemesanan: pengisian data pemesan dan daftar peserta, opsi metode pembayaran (transfer bank, kartu kredit/debit, QRIS, cicilan), rincian kalkulasi harga (paket wisata, asuransi perjalanan, pajak), serta ketentuan pembatalan.
- Konfirmasi tiket & pesanan: tampilan kode reservasi (misal JLH-8X42K1), kode QR check-in, detail jadwal keberangkatan, kontak pemandu tur, aksi unduh e-tiket digital, dan status pembayaran lunas.

Fitur utama: daftar simpanan paket impian (wishlist), riwayat pencarian rute, filter pencarian tersimpan, dan notifikasi pengingat batas pelunasan jadwal perjalanan.
Contoh data: paket wisata "Bali Escape 4H3M" Rp3,9 jt, "Open Trip Bromo Midnight" Rp450 rb, 2 promo aktif (diskon Rp200 rb min. transaksi Rp2 jt, fasilitas cicilan 0%), dan 38 ulasan terverifikasi dengan rata-rata rating 4.8.
Kondisi UI: state kosong wishlist dengan rekomendasi destinasi, indikator pemuatan hasil pencarian dengan skeleton kartu, validasi tanggal perjalanan yang tidak valid, state kuota habis dengan alternatif tanggal lain, dan countdown hitung mundur batas pembayaran 30 menit.
Audiens: wisatawan usia 20-35 tahun yang aktif membandingkan pilihan perjalanan; transparansi rincian harga per orang termasuk pajak sejak awal tanpa biaya tersembunyi.`,
	},
	{
		id: "dev-portfolio",
		title: "Developer Portfolio",
		category: "Personal Brand",
		designMode: "web",
		initialPageCount: 3,
		preview:
			"Portofolio developer: hero + keahlian, galeri proyek studi kasus, dan kontak.",
		prompt: `Website portofolio personal untuk software engineer "Nadia Prameswari" yang mencari peran frontend senior remote.

Alur dan area utama:
- Beranda utama: hero section dengan nama pengembang, spesialisasi peran, domisili kerja (Jakarta, UTC+7, terbuka untuk posisi remote), tombol unduh CV dan navigasi ke daftar proyek; ringkasan keahlian teknis (React, TypeScript, TanStack, Go) dengan indikator tingkat pengalaman; sorotan metrik karier (6 tahun pengalaman, 24 proyek selesai, 11 klien); dan kutipan testimoni singkat dari rekan kerja.
- Galeri proyek & studi kasus: etalase 6 studi kasus unggulan dengan gambar sampul, peran kontribusi, tech stack, dan hasil metrik terukur (seperti "checkout 34% lebih cepat", "LCP 1,8 detik"); filter berdasarkan teknologi dan jenis aplikasi (SaaS, E-commerce, Dashboard); setiap kartu membuka rincian tantangan, solusi arsitektur, cuplikan antarmuka, dan pembelajaran teknis.
- Profil diri & formulir kontak: narasi perjalanan karier ringkas, lini masa pengalaman profesional, ragam layanan konsultasi (kontrak freelance, optimasi performa web, audit kode), formulir pesan (nama, email, estimasi budget, kebutuhan kolaborasi) dengan validasi input, serta tautan profil GitHub, LinkedIn, dan kontak email langsung.

Fitur utama: filter proyek instan tanpa reload halaman, mode tampilan terang dan gelap, navigasi keyboard penuh yang aksesibel, dan akses berkas resume versi terkini.
Contoh data: studi kasus "Dashboard Logistik KirimCepat" (React + Go, 40 ribu pengguna aktif), "Toko Kopi Langganan" (alur checkout 1 langkah), serta testimoni profesional dari CTO dan Lead Product Manager lengkap dengan identitas valid.
Kondisi UI: state kosong filter proyek dengan tombol atur ulang, penanganan validasi kesalahan input formulir dengan pesan spesifik per kolom, notifikasi sukses kirim dengan perkiraan waktu tanggapan 2 hari kerja, dan fallback visual apabila gambar sampul belum termuat.
Audiens: engineering manager, recruiter teknis, dan calon klien yang mengevaluasi kompetensi dalam 30 detik pertama; bagian hero langsung menyampaikan spesialisasi, pengalaman, dan bukti hasil nyata tanpa memerlukan scroll panjang.`,
	},
];
