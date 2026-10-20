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
		subtitle: "Status penyimpanan dokumen dan kelanjutan sesi",
		content:
			"Ya, semua tahapan project mulai dari PRD, kriteria penerimaan, hingga task tersimpan otomatis ke akun Anda. Anda bisa melanjutkan atau membuka kembali project kapan saja melalui halaman Riwayat atau Dashboard.",
		icon: "document",
	},
	{
		id: "interrupted-generation",
		title: "Apa yang terjadi jika halaman tertutup saat AI sedang generate?",
		subtitle: "Penanganan sesi saat koneksi atau browser terputus",
		content:
			"Proses generate yang terputus otomatis dibatalkan dan kuota credit Anda tidak akan terpotong. Project tetap tersimpan di tahap terakhir, dan Anda bisa menekan tombol generate ulang saat membuka kembali halaman tersebut.",
		icon: "workflow",
	},
	{
		id: "prd-revision",
		title: "Bisakah hasil PRD dari AI direvisi jika belum sesuai?",
		subtitle: "Perbaikan seksi spesifik tanpa mulai dari awal",
		content:
			"Bisa. Anda dapat meminta revisi bagian tertentu melalui chat panel tanpa harus mengulang proses dari awal. Setiap revisi PRD tidak memotong credit dan langsung memperbarui versi dokumen Anda.",
		icon: "spark",
	},
	{
		id: "failed-generation-credit",
		title: "Apakah credit tetap terpotong jika generate gagal?",
		subtitle: "Jaminan kuota saat sistem atau koneksi error",
		content:
			"Tidak. Credit hanya dipotong secara permanen jika dokumen atau task berhasil dibuat dan tersimpan. Jika sistem mengalami kendala atau waktu tunggu habis, reservasi credit akan dilepas kembali ke saldo Anda.",
		icon: "credit",
	},
	{
		id: "credit-expiry",
		title: "Apakah credit yang belum terpakai akan hangus?",
		subtitle: "Masa aktif kuota untuk paket Free dan Berlangganan",
		content:
			"Pada paket langganan Pro dan Hengker, credit berlaku selama periode aktif 30 hari. Pada paket Free, kuota 2 credit diperbarui setiap siklus 30 hari dan tidak diakumulasikan ke periode berikutnya.",
		icon: "credit",
	},
	{
		id: "manage-subscription",
		title: "Bagaimana cara membatalkan langganan?",
		subtitle: "Penghentian paket berbayar dari menu Pengaturan",
		content:
			"Buka Pengaturan lalu pilih Billing, kemudian klik Batalkan Langganan. Paket Anda akan tetap aktif sampai akhir periode tagihan berjalan tanpa ada tagihan otomatis berikutnya.",
		icon: "credit",
	},
	{
		id: "repository-security",
		title: "Apakah kode repositori saya aman saat menggunakan CLI?",
		subtitle: "Penyaringan file lokal dan isolasi data privat",
		content:
			"Aman. CLI VibeEverything otomatis mengecualikan file sensitif seperti .env, sertifikat, kunci rahasia, dan folder build sebelum snapshot diunggah. Kode dan dokumen yang dihasilkan hanya dapat diakses oleh akun Anda sendiri.",
		icon: "terminal",
	},
	{
		id: "project-deletion",
		title: "Bisakah saya menghapus project dan seluruh datanya?",
		subtitle: "Pembersihan dokumen dan riwayat dari sistem",
		content:
			"Bisa. Anda dapat menghapus project melalui menu opsi di halaman project atau Riwayat. Seluruh percakapan, versi PRD, kriteria penerimaan, dan daftar task akan langsung dibersihkan dari akun Anda.",
		icon: "document",
	},
];
