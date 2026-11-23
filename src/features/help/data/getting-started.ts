import type { HelpArticle } from "../types/help-article";

export const GETTING_STARTED_ARTICLES: readonly HelpArticle[] = [
	{
		id: "mengenal-evvibe",
		categoryId: "mulai",
		title: "Mengenal everythings-vibe",
		description:
			"Pahami apa yang bisa kamu buat dan workspace mana yang perlu dipilih.",
		keywords: [
			"evvibe",
			"everythings vibe",
			"apa itu evvibe",
			"pengenalan",
			"workspace",
			"pilih workspace",
			"fitur",
			"ikhtisar",
		],
		sections: [
			{
				heading: "Apa yang bisa kamu lakukan",
				paragraphs: [
					"everythings-vibe membantu kamu mengubah ide menjadi rencana produk, prototipe antarmuka, dan contoh prompt. Setiap hasil tersimpan di akun kamu sehingga bisa dibuka lagi nanti.",
				],
			},
			{
				heading: "Pilih workspace yang tepat",
				bullets: [
					"VibePlan untuk menyusun rencana produk dari ide baru atau dari repository yang sudah ada.",
					"VibeDesign Studio untuk membuat prototipe antarmuka dari instruksi singkat.",
					"VibeScrape untuk mengambil struktur dan panduan desain dari website publik.",
					"VibeTemplate untuk memulai dari blueprint yang sudah disiapkan.",
				],
				link: { label: "Lihat katalog template", to: "/templates" },
			},
			{
				heading: "Satu saldo untuk beberapa produk",
				paragraphs: [
					"Kredit yang kamu miliki dipakai bersama oleh VibePlan, Studio, dan Scrape saat tarifnya aktif. Sampai tarif diaktifkan, operasi Studio dan Scrape belum memotong kredit.",
				],
				note: "Revisi dokumen rencana lewat chat tidak memotong kredit.",
			},
		],
		relatedIds: ["proyek-pertama", "kredit-untuk-pemula", "paket-dan-kredit"],
	},
	{
		id: "proyek-pertama",
		categoryId: "mulai",
		title: "Membuat proyek pertama",
		description: "Dari ide singkat sampai dokumen rencana pertama kamu.",
		keywords: [
			"proyek pertama",
			"mulai",
			"buat proyek",
			"ide baru",
			"memulai",
			"new project",
			"langkah pertama",
		],
		sections: [
			{
				heading: "Langkahnya",
				steps: [
					"Buka VibePlan lalu pilih untuk membuat proyek baru.",
					"Jelaskan aplikasi atau fitur yang ingin kamu bangun dengan satu atau dua kalimat.",
					"Jawab pertanyaan klarifikasi supaya AI memahami pengguna dan batasan teknisnya.",
					"Periksa pohon fitur, lalu lanjutkan ke dokumen rencana.",
				],
				link: { label: "Buka VibePlan", to: "/plan/new" },
			},
			{
				heading: "Lanjut kapan saja",
				paragraphs: [
					"Proyek tersimpan otomatis. Kamu bisa keluar dan melanjutkan lewat Riwayat tanpa mengulang dari awal.",
				],
				note: "Pembuatan dokumen rencana memakai kredit. Revisi lewat chat setelahnya tidak memotong kredit.",
			},
		],
		relatedIds: ["mode-greenfield", "kredit-untuk-pemula", "prd-dan-revisi"],
	},
	{
		id: "kredit-untuk-pemula",
		categoryId: "mulai",
		title: "Memahami penggunaan kredit",
		description: "Kenali alokasi, estimasi, dan aksi yang tidak berbayar.",
		keywords: [
			"kredit",
			"saldo",
			"alokasi",
			"gratis",
			"trial",
			"kredit habis",
			"biaya",
			"pemula",
		],
		sections: [
			{
				heading: "Aturan dasarnya",
				bullets: [
					"Satu kredit dipakai untuk satu aksi generate baru.",
					"Estimasi dan batas maksimal ditampilkan sebelum aksi dijalankan.",
					"Akun Free mendapat 2 kredit setiap 30 hari.",
					"Akun Free juga mendapat satu trial Studio dan satu trial Scrape yang tidak diperbarui tiap bulan.",
				],
				link: { label: "Lihat rincian paket", to: "/pricing" },
			},
			{
				heading: "Aksi yang tidak memotong kredit",
				paragraphs: [
					"Melihat hasil, revisi manual, revisi dokumen rencana lewat chat, dan memakai VibeTemplate tidak memotong kredit.",
				],
			},
		],
		relatedIds: ["cara-kerja-kredit", "paket-dan-kredit"],
	},
] as const;
