import type { HelpArticle } from "../types/help-article";

export const STUDIO_ARTICLES: readonly HelpArticle[] = [
	{
		id: "desain-pertama",
		categoryId: "studio",
		title: "Membuat desain pertama",
		description: "Dari instruksi singkat menjadi prototipe yang bisa dilihat.",
		keywords: [
			"studio",
			"desain",
			"prompt",
			"prototipe",
			"html",
			"tailwind",
			"generate desain",
			"ui",
		],
		sections: [
			{
				heading: "Langkahnya",
				steps: [
					"Buka Studio lalu tulis deskripsi halaman atau komponen yang ingin kamu buat.",
					"Pilih preset gaya, atau lampirkan panduan desain dari hasil VibeScrape bila kamu punya.",
					"Periksa estimasi yang muncul, lalu jalankan generate.",
					"Buka frame yang dihasilkan untuk melihat hasilnya di kanvas.",
				],
				link: { label: "Buka Studio", to: "/design" },
			},
			{
				heading: "Supaya hasilnya sesuai",
				paragraphs: [
					"Jelaskan hierarki konten, elemen utama, dan interaksi yang kamu butuhkan. Instruksi yang spesifik biasanya menghasilkan frame yang lebih mudah dipakai.",
				],
			},
		],
		relatedIds: ["tambah-frame", "revisi-desain", "empat-mode-scrape"],
	},
	{
		id: "tambah-frame",
		categoryId: "studio",
		title: "Menambah frame",
		description: "Buat layar tambahan di dalam proyek desain yang sama.",
		keywords: [
			"tambah frame",
			"frame",
			"halaman baru",
			"screen",
			"tambah halaman",
			"studio",
		],
		sections: [
			{
				heading: "Cara menambahnya",
				steps: [
					"Buka proyek desain yang sudah ada.",
					"Tulis instruksi untuk layar atau bagian baru pada kolom yang tersedia.",
					"Jalankan generate, lalu tunggu frame baru muncul di kanvas.",
					"Pilih frame tersebut untuk memeriksa hasilnya.",
				],
			},
			{
				heading: "Hasil yang tersimpan",
				paragraphs: [
					"Frame baru menjadi bagian dari proyek yang sama. Kamu bisa memilih beberapa frame sekaligus saat hendak mengekspor hasilnya.",
				],
			},
		],
		relatedIds: ["desain-pertama", "revisi-desain", "preview-dan-export"],
	},
	{
		id: "revisi-desain",
		categoryId: "studio",
		title: "Revisi desain dengan AI",
		description: "Perbaiki frame yang sudah ada tanpa mengulang dari awal.",
		keywords: [
			"revisi desain",
			"revisi",
			"edit desain",
			"ubah desain",
			"perbaiki desain",
			"ai revise",
		],
		sections: [
			{
				heading: "Langkahnya",
				steps: [
					"Pilih frame yang ingin kamu ubah.",
					"Tulis perubahan yang diinginkan pada kolom instruksi.",
					"Jalankan revisi lalu bandingkan hasilnya dengan frame sebelumnya.",
				],
			},
			{
				heading: "Biaya revisi dan pekerjaan manual",
				paragraphs: [
					"Tarif kredit untuk operasi AI Studio belum diaktifkan, jadi revisi AI belum memotong kredit. Mengganti nama, menduplikat, atau menghapus proyek dan frame yang kamu lakukan sendiri juga tidak memotong kredit.",
				],
				note: "Belum tersedia editor kode manual di Studio. Perubahan isi desain dilakukan lewat instruksi.",
			},
		],
		relatedIds: ["desain-pertama", "preview-dan-export"],
	},
	{
		id: "preview-dan-export",
		categoryId: "studio",
		title: "Memeriksa dan mengekspor hasil desain",
		description: "Lihat frame di kanvas lalu unduh berkasnya.",
		keywords: [
			"preview",
			"export",
			"download",
			"zip",
			"unduh",
			"simpan desain",
			"kode html",
		],
		sections: [
			{
				heading: "Memeriksa hasil",
				paragraphs: [
					"Setiap frame bisa dibuka di kanvas. Periksa susunan elemen, teks, dan perilaku yang kamu minta sebelum mengekspor.",
				],
			},
			{
				heading: "Mengunduh hasil",
				steps: [
					"Pastikan frame yang ingin kamu simpan sudah selesai.",
					"Buka menu export pada proyek desain.",
					"Pilih unduh ZIP. Berkas frame akan dikumpulkan dalam satu arsip.",
				],
				link: { label: "Buka Studio", to: "/design" },
			},
			{
				heading: "Biaya",
				paragraphs: [
					"Melihat frame dan mengunduh hasil tidak memotong kredit. Kredit baru dipakai untuk aksi generate ketika tarifnya aktif.",
				],
			},
		],
		relatedIds: ["revisi-desain", "tambah-frame"],
	},
] as const;
