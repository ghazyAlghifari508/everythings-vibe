export interface FaqItem {
	id: string;
	title: string;
	subtitle: string;
	content: string;
	icon:
		| "spark"
		| "workflow"
		| "document"
		| "board"
		| "credit"
		| "feedback"
		| "terminal";
}

export const FAQ_ITEMS: FaqItem[] = [
	{
		id: "project-persistence",
		title: "Apakah project yang saya buat tersimpan otomatis?",
		subtitle: "Penyimpanan dokumen dan kelanjutan sesi kerja",
		content:
			"Ya. Setiap tahapan yang selesai di-generate (PRD, kriteria penerimaan, dan daftar task) otomatis tersimpan ke akun Anda. Anda bisa keluar kapan saja dan melanjutkan project melalui Dashboard atau menu Riwayat.",
		icon: "document",
	},
	{
		id: "interrupted-generation",
		title: "Apa yang terjadi jika koneksi terputus saat AI sedang generate?",
		subtitle: "Penanganan status credit dan sesi yang belum selesai",
		content:
			"Credit yang digunakan berada dalam status reservasi sementara. Jika server berhasil menyelesaikan dokumen sebelum koneksi terputus, hasilnya tetap tersimpan. Jika proses gagal atau waktu tunggu habis, reservasi akan dilepas kembali ke saldo Anda dan project tetap berada di tahap terakhir agar bisa di-generate ulang.",
		icon: "workflow",
	},
	{
		id: "prd-revision",
		title: "Apakah revisi PRD melalui chat memotong credit?",
		subtitle: "Ketentuan revisi seksi dan pembuatan dokumen baru",
		content:
			"Tidak. Revisi seksi PRD melalui chat panel sepenuhnya gratis dan membuat versi dokumen baru. Credit hanya dipotong saat pertama kali membuat PRD baru atau menjalankan generate untuk tahap berikutnya seperti kriteria penerimaan dan task.",
		icon: "spark",
	},
	{
		id: "credit-expiry-and-topup",
		title:
			"Apakah credit memiliki masa aktif, dan bagaimana cara kerja top-up?",
		subtitle: "Masa berlaku paket bulanan, kuota Free, dan pembelian top-up",
		content:
			"Credit paket langganan berlaku selama siklus 30 hari berjalan dan hangus jika tidak diperpanjang. Paket Free mendapat alokasi 2 credit setiap 30 hari tanpa akumulasi sisa bulan sebelumnya. Paket top-up menambahkan credit ke saldo periode aktif saat ini, tetapi tidak memperpanjang masa aktif langganan.",
		icon: "credit",
	},
	{
		id: "cancel-subscription",
		title: "Apa yang terjadi jika saya membatalkan langganan berbayar?",
		subtitle: "Dampak pembatalan paket pada akun dan saldo credit",
		content:
			"Pembatalan melalui menu Pengaturan > Billing langsung berlaku seketika. Akun Anda kembali ke paket Free dan sisa credit langganan berbayar akan hangus. Semua dokumen dan riwayat project yang sudah dibuat tetap tersimpan di akun Anda.",
		icon: "credit",
	},
	{
		id: "repository-security",
		title: "File apa saja yang otomatis dikecualikan saat sync repository?",
		subtitle: "Penyaringan lokal file sensitif dan kontrol ignore",
		content:
			"CLI secara lokal menyaring dan memblokir upload untuk file env (.env*), kunci privat dan sertifikat (.pem, .key), dump database (.sql, .db), serta folder dependensi dan build (node_modules, dist, .git). Anda dapat menambahkan aturan pengecualian tambahan melalui file .everythingsvibeignore di root repository.",
		icon: "terminal",
	},
	{
		id: "resync-repository",
		title:
			"Jika saya melakukan sync ulang pada repository yang sama, apakah data lama hilang?",
		subtitle: "Pengaruh sinkronisasi berkala terhadap project yang ada",
		content:
			"Tidak. Setiap kali Anda menjalankan sync ulang, sistem membuat snapshot dan analisis arsitektur baru untuk repository tersebut. Project, PRD, dan task yang sudah pernah Anda buat sebelumnya tidak akan tertimpa atau terhapus.",
		icon: "terminal",
	},
	{
		id: "scrape-limitations",
		title: "Mengapa ada website yang gagal diproses oleh VibeScrape?",
		subtitle: "Batasan keamanan jaringan dan proteksi akses publik",
		content:
			"VibeScrape memblokir URL lokal atau IP privat (SSRF protection) untuk keamanan sistem. Website yang mewajibkan login, proteksi bot seperti Cloudflare CAPTCHA, atau memblokir crawler headless tidak dapat diambil secara lengkap. Jika sebagian aset gagal diunduh, sistem tetap menyimpan halaman dan token desain yang berhasil diekstrak.",
		icon: "workflow",
	},
	{
		id: "project-deletion",
		title: "Apa yang terjadi saat saya menghapus project?",
		subtitle: "Pembersihan dokumen kerja dan retensi catatan sistem",
		content:
			"Seluruh dokumen produk seperti percakapan, versi PRD, kriteria penerimaan, dan task langsung dihapus secara permanen dari ruang kerja Anda. Catatan transaksi credit tetap disimpan untuk audit keuangan, dan riwayat sync repository Anda tetap utuh.",
		icon: "document",
	},
];
