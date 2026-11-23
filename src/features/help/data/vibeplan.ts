import type { HelpArticle } from "../types/help-article";

export const VIBEPLAN_ARTICLES: readonly HelpArticle[] = [
	{
		id: "mode-greenfield",
		categoryId: "vibeplan",
		title: "Rencanakan dari ide baru",
		description:
			"Alur dari klarifikasi sampai papan kerja untuk proyek greenfield.",
		keywords: [
			"greenfield",
			"ide baru",
			"klarifikasi",
			"pohon fitur",
			"ask",
			"fitur",
			"rencana",
			"generate prd",
		],
		sections: [
			{
				heading: "Alur yang dijalankan",
				steps: [
					"Buat proyek baru dan jelaskan aplikasi yang ingin kamu bangun.",
					"Jawab dua sesi klarifikasi, yaitu gambaran produk dan pilihan teknis.",
					"Periksa pohon fitur yang berisi fase, fitur, dan subfitur.",
					"Generate dokumen Product Requirement Document (PRD), lalu lanjutkan ke kriteria penerimaan dan tugas.",
					"Pindahkan tugas ke papan Kanban saat siap dikerjakan.",
				],
				link: { label: "Mulai proyek baru", to: "/plan/new" },
			},
			{
				heading: "Kapan kredit dipakai",
				paragraphs: [
					"Pembuatan dokumen rencana, kriteria penerimaan, dan tugas memotong kredit. Besarnya mengikuti kompleksitas dan ditampilkan sebagai estimasi sebelum aksi dijalankan.",
				],
				note: "Revisi dokumen rencana lewat chat tidak memotong kredit dan tidak dibatasi jumlahnya.",
			},
		],
		relatedIds: ["prd-dan-revisi", "ac-task-kanban", "mode-codebase"],
	},
	{
		id: "mode-codebase",
		categoryId: "vibeplan",
		title: "Rencanakan dari repository yang sudah ada",
		description:
			"Hubungkan kode existing supaya rencana mengikuti struktur aslinya.",
		keywords: [
			"codebase",
			"repository",
			"repo",
			"existing codebase",
			"sinkronisasi",
			"analisis kode",
			"project existing",
		],
		sections: [
			{
				heading: "Langkahnya",
				steps: [
					"Buka mode Existing Codebase lalu daftarkan repository kamu.",
					"Salin perintah sinkronisasi yang muncul, lalu jalankan dari terminal di direktori proyek.",
					"Tunggu analisis arsitektur selesai.",
					"Buat proyek baru yang terhubung dengan repository tersebut.",
				],
				link: { label: "Kelola repository", to: "/codebases" },
			},
			{
				heading: "Apa yang tidak berubah",
				paragraphs: [
					"Sinkronisasi ulang membuat snapshot dan analisis baru. Proyek, dokumen rencana, dan tugas yang sudah kamu buat tidak tertimpa.",
				],
			},
		],
		relatedIds: ["sync-repository", "mode-greenfield", "pasang-cli"],
	},
	{
		id: "prd-dan-revisi",
		categoryId: "vibeplan",
		title: "Membuat dan merevisi PRD",
		description:
			"Hasilkan dokumen rencana lalu perbaiki bagian tertentu lewat chat.",
		keywords: [
			"prd",
			"generate prd",
			"product requirement document",
			"revisi prd",
			"patch seksi",
			"chat",
			"dokumen rencana",
			"versi",
		],
		sections: [
			{
				heading: "Membuat dokumen",
				paragraphs: [
					"Pada tahap PRD, AI menyusun delapan bagian dokumen berdasarkan jawaban klarifikasi dan pohon fitur. Pembuatan awal memotong kredit sesuai estimasi yang ditampilkan.",
				],
			},
			{
				heading: "Merevisi tanpa biaya",
				paragraphs: [
					"Tulis permintaan perubahan di panel chat. Sistem memperbarui bagian yang kamu sebutkan dan menyimpan hasilnya sebagai versi baru. Revisi lewat chat tidak memotong kredit, berapa pun jumlahnya.",
				],
				note: "Sebut nama bagian yang ingin diubah agar perubahan mudah ditemukan.",
			},
			{
				heading: "Riwayat versi",
				paragraphs: [
					"Setiap revisi tersimpan sebagai versi baru. Kamu bisa membuka versi sebelumnya dari daftar versi pada dokumen.",
				],
				link: { label: "Buka Riwayat", to: "/history" },
			},
		],
		relatedIds: ["ac-task-kanban", "mode-greenfield", "cara-kerja-kredit"],
	},
	{
		id: "ac-task-kanban",
		categoryId: "vibeplan",
		title: "Kriteria penerimaan, tugas, dan Kanban",
		description:
			"Ubah rencana menjadi kriteria yang bisa diuji dan tugas yang bisa dijalankan.",
		keywords: [
			"ac",
			"acceptance criteria",
			"kriteria penerimaan",
			"task",
			"tugas",
			"kanban",
			"papan kerja",
			"given when then",
		],
		sections: [
			{
				heading: "Dari dokumen ke tugas",
				steps: [
					"Generate acceptance criteria, yaitu kriteria penerimaan berupa kondisi yang bisa diuji.",
					"Periksa kriteria yang meliputi skenario utama, batas, dan pengecualian.",
					"Generate tugas dari kriteria tersebut.",
					"Pindahkan tugas ke papan Kanban untuk melacak statusnya.",
				],
			},
			{
				heading: "Biaya dan status",
				paragraphs: [
					"Pembuatan kriteria penerimaan dan tugas memotong kredit dengan estimasi yang ditampilkan lebih dulu. Mengubah status tugas di papan kerja tidak memotong kredit.",
				],
			},
		],
		relatedIds: ["prd-dan-revisi", "mode-greenfield"],
	},
] as const;
