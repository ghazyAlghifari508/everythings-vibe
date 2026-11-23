export interface FaqItem {
	id: string;
	title: string;
	content: string;
}

export const FAQ_ITEMS: FaqItem[] = [
	{
		id: "project-persistence",
		title: "Apakah project yang saya buat tersimpan otomatis?",
		content:
			"Ya. Setiap tahapan yang selesai di-generate tersimpan ke akun kamu. Kamu bisa keluar kapan saja dan melanjutkan melalui Dashboard atau menu Riwayat.",
	},
	{
		id: "interrupted-generation",
		title: "Apa yang terjadi jika koneksi terputus saat AI sedang generate?",
		content:
			"Saat operasi berjalan, kredit yang dibutuhkan ditandai sebagai reservasi, bukan pemotongan final. Jika pekerjaan selesai, hasil tersimpan dan reservasi menjadi biaya akhir. Jika gagal, reservasi dilepas kembali ke saldo. Kamu bisa melihat statusnya di Pengaturan > Billing pada Riwayat Penggunaan Kredit.",
	},
	{
		id: "prd-revision",
		title: "Apakah revisi PRD melalui chat memotong kredit?",
		content:
			"Tidak. Revisi PRD melalui chat memakai patch seksi dan tidak memotong kredit. Aturan ini khusus VibePlan. Revisi AI di Studio mengikuti pekerjaan yang dijalankan dan saat ini belum memotong kredit karena tarifnya belum aktif.",
	},
	{
		id: "credit-expiry-and-topup",
		title:
			"Apakah kredit memiliki masa aktif, dan bagaimana cara kerja top up?",
		content:
			"Satu akun memakai satu saldo kredit untuk VibePlan, Studio, dan Scrape saat tarifnya aktif. Alokasi paket direset setiap 30 hari dan sisa tidak dibawa ke periode berikutnya. Top up masuk ke saldo periode berjalan, tidak memperpanjang masa aktif, dan hangus bersama alokasi di akhir periode.",
	},
	{
		id: "product-trials",
		title: "Bagaimana trial Studio dan Scrape bekerja untuk akun Free?",
		content:
			"Setiap akun Free mendapat satu trial Studio dan satu trial Scrape tanpa pembayaran. Trial Studio menghasilkan satu frame. Trial Scrape mencakup satu job dengan maksimal tiga halaman dan dua tampilan DESIGN.md. Trial tidak diperbarui tiap bulan, tetapi hasil yang sudah dibuat tetap bisa diakses. Akun Pro dan Hengker memakai akses penuh tanpa trial terpisah.",
	},
	{
		id: "free-actions",
		title: "Aksi apa yang tidak memotong kredit?",
		content:
			"Melihat hasil, revisi manual, revisi PRD via chat, dan VibeTemplate tidak memotong kredit. Biaya kredit hanya muncul untuk operasi yang memang memakai kredit, dengan estimasi yang ditampilkan sebelum dijalankan.",
	},
	{
		id: "credit-usage-history",
		title: "Di mana saya melihat pemakaian kredit?",
		content:
			"Buka Pengaturan > Billing. Meter menunjukkan alokasi, kredit terpakai, dan kredit yang sedang direservasi. Riwayat Penggunaan Kredit merangkum semua fitur dan aktivitas, termasuk estimasi, reservasi, biaya akhir, dan statusnya.",
	},
	{
		id: "cancel-subscription",
		title: "Apa yang terjadi jika saya membatalkan langganan berbayar?",
		content:
			"Pembatalan melalui menu Pengaturan > Billing langsung berlaku. Akun kamu kembali ke paket Free dengan alokasi 2 kredit per 30 hari dan sisa kredit langganan berbayar hangus. Semua dokumen dan riwayat project tetap tersimpan.",
	},
	{
		id: "repository-security",
		title: "File apa saja yang otomatis dikecualikan saat sync repository?",
		content:
			"CLI secara lokal menyaring dan memblokir upload untuk file env (.env*), kunci privat dan sertifikat (.pem, .key), dump database (.sql, .db), serta folder dependensi dan build (node_modules, dist, .git). Anda dapat menambahkan aturan pengecualian tambahan melalui file .everythingsvibeignore di root repository.",
	},
	{
		id: "resync-repository",
		title:
			"Jika saya melakukan sync ulang pada repository yang sama, apakah data lama hilang?",
		content:
			"Tidak. Setiap kali Anda menjalankan sync ulang, sistem membuat snapshot dan analisis arsitektur baru untuk repository tersebut. Project, PRD, dan task yang sudah pernah Anda buat sebelumnya tidak akan tertimpa atau terhapus.",
	},
	{
		id: "scrape-limitations",
		title: "Mengapa ada website yang gagal diproses oleh VibeScrape?",
		content:
			"VibeScrape memblokir URL lokal atau IP privat (SSRF protection) untuk keamanan sistem. Website yang mewajibkan login, proteksi bot seperti Cloudflare CAPTCHA, atau memblokir crawler headless tidak dapat diambil secara lengkap. Jika sebagian aset gagal diunduh, sistem tetap menyimpan halaman dan token desain yang berhasil diekstrak.",
	},
	{
		id: "project-deletion",
		title: "Apa yang terjadi saat saya menghapus project?",
		content:
			"Seluruh dokumen produk seperti percakapan, versi PRD, kriteria penerimaan, dan task langsung dihapus secara permanen dari ruang kerja Anda. Catatan transaksi credit tetap disimpan untuk audit keuangan, dan riwayat sync repository Anda tetap utuh.",
	},
];
