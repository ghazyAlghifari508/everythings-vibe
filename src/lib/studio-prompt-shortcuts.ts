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

Layar yang direncanakan (4 halaman, saling terhubung):
1. Beranda eksplorasi: hero promo, kategori (Espresso, Manual Brew, Non-Kopi), kartu produk dengan foto, harga Rupiah realistis (Rp18.000-Rp45.000), rating, dan badge best-seller.
2. Detail produk + kustomisasi: ukuran cup (Regular/Large), pilihan susu (Fresh Milk, Oat, Almond, Soy), level gula (0/30/50/70/100%), extra shot, topping, suhu (panas/dingin), catatan, dan jumlah.
3. Keranjang + checkout: daftar item dengan kustomisasi ringkas, pilihan ambil di toko atau antar, pilih gerai, metode bayar (QRIS, e-wallet, tunai), dan ringkasan harga.
4. Lacak pesanan: status progres (Diterima, Diseduh, Siap, Selesai), estimasi waktu, kode pengambilan, dan tombol pesan lagi.

Fitur utama: pencarian dan filter menu, program loyalitas poin, riwayat pesanan, dan notifikasi status.
Contoh data: 12 menu (Kopi Susu Gula Aren Rp22.000, V60 Aceh Gayo Rp32.000, Spanish Latte Rp28.000), 3 gerai Jakarta Selatan, stok dan label habis untuk 1 item.
Kondisi UI: state kosong keranjang, loading saat checkout, error pembayaran dengan tombol coba lagi, dan skeleton saat menu dimuat.
Audiens: pelanggan urban 18-35 tahun yang memesan dari ponsel satu tangan; tombol utama mudah dijangkau ibu jari, teks harga selalu tabular dan jelas.`,
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

Layar yang direncanakan (4 halaman, saling terhubung):
1. Ringkasan: saldo bulan berjalan, total pemasukan vs pengeluaran, grafik arus kas 6 bulan, dan 5 transaksi terakhir dengan kategori berikon.
2. Anggaran: daftar kategori (Makan, Transport, Belanja, Tagihan, Hiburan, Tabungan) dengan progres bar anggaran vs realisasi, peringatan saat 80% terpakai, dan tombol sesuaikan anggaran.
3. Tambah transaksi: tipe Pemasukan/Pengeluaran/Transfer, nominal dengan format Rupiah otomatis, tanggal, kategori, dompet (Tunai, Bank, E-wallet), catatan, dan foto struk opsional.
4. Laporan: filter rentang tanggal, ringkasan per kategori dengan persentase, transaksi terbesar, tren harian, dan tombol ekspor ringkasan.

Fitur utama: pencarian transaksi, pengingat tagihan rutin, target menabung dengan progres, dan mode privasi yang menyembunyikan nominal.
Contoh data: gaji Rp8.500.000, pengeluaran kopi Rp22.000 x 12, langganan streaming Rp65.000, kos Rp1.800.000, target dana darurat Rp5.000.000 (68%).
Kondisi UI: state kosong saat belum ada transaksi dengan CTA jelas, validasi nominal nol atau negatif, error sinkronisasi dengan tombol muat ulang, dan konfirmasi hapus transaksi.
Audiens: karyawan muda yang mencatat pengeluaran harian; alur tambah transaksi harus selesai dalam 3 langkah dan bisa dipakai satu tangan.`,
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

Layar yang direncanakan (3 halaman, saling terhubung):
1. Ikhtisar: kartu metrik MRR Rp412 jt (+8,2%), pelanggan aktif 1.284 (+96), churn 2,1% (-0,4 poin), NPS 54; grafik tren MRR 12 bulan; donat komposisi paket (Starter/Growth/Scale); dan daftar aktivitas penting (upgrade, gagal bayar, refund).
2. Pelanggan: tabel dengan pencarian nama/email, filter paket dan status (Aktif, Trial, Menunggak, Churn), kolom MRR, tanggal gabung, dan kesehatan akun; klik baris membuka panel detail berisi riwayat pembayaran dan catatan.
3. Laporan: filter periode (7/30/90 hari, kustom), perbandingan periode, grafik cohort retensi sederhana, 5 pelanggan teratas dan terbawah, serta tombol unduh ringkasan.

Fitur utama: filter periode global yang memengaruhi semua kartu, pencarian tabel dengan highlight, pagination, dan ekspor CSV per tabel.
Contoh data: 24 baris pelanggan Indonesia (PT Maju Jaya Rp4,2 jt/bulan, Kopi Nusantara Rp850 rb/bulan, status trial 6 akun), 3 invoice gagal bayar dengan tombol kirim pengingat.
Kondisi UI: skeleton saat metrik dimuat, state kosong hasil filter dengan tombol reset, error API dengan tombol coba lagi, dan tooltip penjelas di setiap metrik.
Audiens: founder dan tim operasional non-teknis; angka memakai format Rupiah ringkas (jt/M), istilah Inggris diberi label Indonesia, dan tidak ada jargon SQL.`,
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

Layar yang direncanakan (5 halaman, saling terhubung):
1. Pencarian: kolom destinasi dengan saran (Bali, Yogyakarta, Labuan Bajo, Bandung, Lombok), tanggal berangkat-pulang, jumlah wisatawan, dan kategori (Pantai, Budaya, Alam, Kuliner).
2. Hasil + filter: kartu paket dengan foto, durasi (3H2M), harga mulai Rp1,2 jt/orang, rating dan jumlah ulasan; filter harga, durasi, rating minimal 4.5, dan urutan (termurah, populer, rating).
3. Detail paket: galeri foto, itinerary harian ringkas, termasuk/tidak termasuk, pilihan tanggal keberangkatan, jumlah peserta, ulasan terbaru, dan tombol pesan.
4. Checkout: data pemesan dan peserta, pilihan pembayaran (transfer bank, kartu, QRIS, cicilan 3x), rincian harga (paket + asuransi + pajak), dan syarat pembatalan.
5. E-tiket + pesanan saya: kode booking JLH-8X42K1, QR check-in, jadwal keberangkatan, kontak tour leader, tombol unduh tiket, dan status pembayaran lunas.

Fitur utama: wishlist paket, riwayat pencarian, filter tersimpan, dan pengingat pelunasan H-7.
Contoh data: paket "Bali Escape 4H3M" Rp3,9 jt, "Open Trip Bromo Midnight" Rp450 rb, 2 promo (potongan Rp200 rb min. Rp2 jt, cicilan 0%), 38 ulasan dengan rata-rata 4.8.
Kondisi UI: state kosong wishlist, loading hasil pencarian dengan skeleton kartu, error tanggal tidak valid, kursi habis dengan tombol pilih tanggal lain, dan countdown batas waktu pembayaran 30 menit.
Audiens: traveler 20-35 tahun yang membandingkan banyak opsi; perbandingan harga selalu per orang termasuk pajak agar tidak ada biaya kejutan.`,
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

Layar yang direncanakan (3 halaman, saling terhubung):
1. Beranda: hero dengan nama, peran, lokasi (Jakarta, UTC+7, siap remote), CTA unduh CV dan lihat proyek; ringkasan keahlian (React, TypeScript, TanStack, Go) dengan level pengalaman; metrik karier (6 tahun, 24 proyek rilis, 11 klien); dan testimoni singkat 2 mantan kolega.
2. Proyek: galeri 6 studi kasus dengan cover, peran, stack, dan hasil terukur (misal "checkout 34% lebih cepat", "LCP 1,8 detik"); filter berdasarkan stack dan tipe (SaaS, E-commerce, Dashboard); setiap kartu membuka detail berisi masalah, pendekatan, tangkapan layar bagian penting, dan pelajaran.
3. Tentang + kontak: cerita karier ringkas, pengalaman kerja timeline, layanan yang ditawarkan (freelance, konsultasi performa, code review), formulir kontak (nama, email, budget, kebutuhan) dengan validasi, dan tautan GitHub/LinkedIn/email.

Fitur utama: filter proyek tanpa reload, mode terang/gelap, navigasi keyboard penuh, dan CV PDF yang selalu versi terbaru.
Contoh data: proyek "Dashboard Logistik KirimCepat" (React + Go, 40 ribu pengguna), "Toko Kopi Langganan" (checkout 1 langkah), testimoni dari CTO dan product manager dengan nama dan perusahaan asli yang bisa diverifikasi.
Kondisi UI: state kosong filter dengan tombol reset, error kirim formulir dengan pesan spesifik per field, sukses kirim dengan estimasi respons 2 hari kerja, dan fallback saat gambar gagal dimuat.
Audiens: hiring manager dan klien yang menilai dalam 30 detik pertama; hero langsung menjawab stack, pengalaman, dan bukti hasil tanpa scroll panjang.`,
	},
];
