import type { HelpArticle } from "../types/help-article";

export const SCRAPE_ARTICLES: readonly HelpArticle[] = [
	{
		id: "empat-mode-scrape",
		categoryId: "scrape",
		title: "Empat mode VibeScrape",
		description: "Pilih antara crawl, panduan desain, HTML, atau gambar.",
		keywords: [
			"scrape",
			"scraping",
			"crawl",
			"design.md",
			"html",
			"gambar",
			"images",
			"ekstraksi website",
		],
		sections: [
			{
				heading: "Pilih sesuai kebutuhan",
				bullets: [
					"Crawl Website mengambil struktur halaman beserta aset yang berhasil diunduh.",
					"Generate DESIGN.md merangkum warna, tipografi, dan token desain menjadi panduan yang bisa dipakai di Studio.",
					"Scrape HTML mengambil markup halaman yang sudah dibersihkan.",
					"Scrape Images mengumpulkan kandidat gambar dari halaman yang diproses.",
				],
				link: { label: "Buka VibeScrape", to: "/scrape" },
			},
			{
				heading: "Memulai",
				steps: [
					"Buka VibeScrape dan pilih mode yang kamu butuhkan.",
					"Tempel alamat website publik yang ingin dijadikan acuan.",
					"Periksa pengaturan lanjutan bila perlu, lalu jalankan proses.",
					"Buka hasilnya dari riwayat saat proses selesai.",
				],
			},
		],
		relatedIds: ["batasan-dan-hasil-scrape", "desain-pertama"],
	},
	{
		id: "batasan-dan-hasil-scrape",
		categoryId: "scrape",
		title: "Hasil dan batasan VibeScrape",
		description:
			"Apa yang tersimpan, batas proses, dan penyebab hasil tidak lengkap.",
		keywords: [
			"batasan scrape",
			"limit",
			"halaman",
			"gagal scrape",
			"cloudflare",
			"login",
			"hasil",
			"riwayat",
			"design.md",
		],
		sections: [
			{
				heading: "Yang tersimpan",
				paragraphs: [
					"Hasil proses tersimpan di riwayat scrape. Kamu bisa membuka kembali halaman, markup, panduan desain, atau gambar yang berhasil diambil.",
				],
				link: { label: "Buka Riwayat scrape", to: "/scrape/history" },
			},
			{
				heading: "Batas yang berlaku",
				bullets: [
					"Satu proses dapat menelusuri hingga 50 halaman dengan kedalaman 5.",
					"Panduan desain mendukung hingga 4 tampilan.",
					"Mode gambar memeriksa hingga 200 kandidat gambar.",
					"Hanya dua proses yang dapat berjalan bersamaan.",
				],
			},
			{
				heading: "Ketika hasil tidak lengkap",
				paragraphs: [
					"Alamat lokal dan IP privat diblokir demi keamanan. Halaman yang mewajibkan login, memakai proteksi bot, atau menolak crawler mungkin tidak bisa diambil lengkap. Jika sebagian aset gagal diunduh, halaman dan token desain yang berhasil tetap disimpan.",
				],
				note: "Trial Scrape untuk akun Free mencakup satu proses dengan maksimal tiga halaman dan dua tampilan DESIGN.md.",
			},
		],
		relatedIds: ["empat-mode-scrape", "paket-dan-kredit"],
	},
] as const;
