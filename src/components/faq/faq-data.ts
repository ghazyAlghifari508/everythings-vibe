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
			"Ya. Setiap tahapan yang selesai di-generate (PRD, kriteria penerimaan, dan daftar task) otomatis tersimpan ke akun Anda. Anda bisa keluar kapan saja dan melanjutkan project melalui Dashboard atau menu Riwayat.",
	},
	{
		id: "interrupted-generation",
		title: "Apa yang terjadi jika koneksi terputus saat AI sedang generate?",
		content:
			"Credit yang digunakan berada dalam status reservasi sementara. Jika server berhasil menyelesaikan dokumen sebelum koneksi terputus, hasilnya tetap tersimpan. Jika proses gagal atau waktu tunggu habis, reservasi akan dilepas kembali ke saldo Anda dan project tetap berada di tahap terakhir agar bisa di-generate ulang.",
	},
	{
		id: "prd-revision",
		title: "Apakah revisi PRD melalui chat memotong credit?",
		content:
			"Tidak. Revisi seksi PRD melalui chat panel sepenuhnya gratis dan membuat versi dokumen baru. Credit hanya dipotong saat pertama kali membuat PRD baru atau menjalankan generate untuk tahap berikutnya seperti kriteria penerimaan dan task.",
	},
	{
		id: "credit-expiry-and-topup",
		title:
			"Apakah credit memiliki masa aktif, dan bagaimana cara kerja top-up?",
		content:
			"Credit paket langganan berlaku selama siklus 30 hari berjalan dan hangus jika tidak diperpanjang. Paket Free mendapat alokasi 2 credit setiap 30 hari tanpa akumulasi sisa bulan sebelumnya. Paket top-up menambahkan credit ke saldo periode aktif saat ini, tetapi tidak memperpanjang masa aktif langganan.",
	},
	{
		id: "cancel-subscription",
		title: "Apa yang terjadi jika saya membatalkan langganan berbayar?",
		content:
			"Pembatalan melalui menu Pengaturan > Billing langsung berlaku seketika. Akun Anda kembali ke paket Free dan sisa credit langganan berbayar akan hangus. Semua dokumen dan riwayat project yang sudah dibuat tetap tersimpan di akun Anda.",
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
