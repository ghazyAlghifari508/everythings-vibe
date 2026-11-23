import type { HelpArticle } from "../types/help-article";

export const TEMPLATE_AND_CLI_ARTICLES: readonly HelpArticle[] = [
	{
		id: "memakai-template",
		categoryId: "template",
		title: "Memakai VibeTemplate",
		description: "Temukan blueprint, salin prompt, dan pakai sebagai titik awal.",
		keywords: [
			"template",
			"blueprint",
			"prompt",
			"katalog",
			"gratis",
			"vibe template",
		],
		sections: [
			{
				heading: "Menemukan template",
				steps: [
					"Buka katalog VibeTemplate.",
					"Pilih kategori Planning, Design, atau Boilerplate, atau cari dengan kata kunci.",
					"Baca ringkasan template untuk melihat kebutuhannya.",
					"Salin prompt atau gunakan template untuk membuka workspace yang sesuai.",
				],
				link: { label: "Buka katalog template", to: "/templates" },
			},
			{
				heading: "Biaya",
				paragraphs: [
					"VibeTemplate bisa dipakai tanpa memotong kredit. Template hanya menjadi titik awal, hasil akhir tetap bergantung pada instruksi yang kamu berikan.",
				],
			},
		],
		relatedIds: ["proyek-pertama", "desain-pertama"],
	},
	{
		id: "pasang-cli",
		categoryId: "cli",
		title: "Memasang everythings-vibe CLI",
		description: "Cara resmi memasang CLI dan perintah yang bisa dipakai.",
		keywords: [
			"cli",
			"install",
			"pasang",
			"npm",
			"command",
			"perintah",
			"package",
			"everythings-vibe cli",
		],
		sections: [
			{
				heading: "Cara memasang",
				paragraphs: [
					"Paket resminya bernama @ghazynabiel/everythings-vibe. Pasang dengan perintah berikut di terminal.",
				],
				steps: ["npm install -g @ghazynabiel/everythings-vibe"],
				note: "Cek keberhasilan pemasangan dengan everythings-vibe --version.",
			},
			{
				heading: "Nama perintah yang tersedia",
				bullets: [
					"everythings-vibe adalah nama utama.",
					"vibe, vibeeverything, dan prdfy adalah alias bawahnya.",
					"Perintah yang sering dipakai antara lain codebase sync, login, project get, prd, ac, task, kanban, export rules, dan export plan.",
				],
			},
		],
		relatedIds: ["sync-repository", "api-key-dan-keamanan"],
	},
	{
		id: "sync-repository",
		categoryId: "cli",
		title: "Sinkronisasi repository",
		description:
			"Kirim snapshot kode ke workspace lewat CLI dan serahkan ke agent.",
		keywords: [
			"sinkronisasi repository",
			"sync",
			"repo",
			"git",
			"agent",
			"handoff",
			"sync token",
			"token",
			"api key",
		],
		sections: [
			{
				heading: "Langkah sinkronisasi",
				steps: [
					"Buat proyek berbasis repository yang sudah ada di workspace.",
					"Salin perintah sinkronisasi yang muncul, termasuk token sekali pakai untuk percobaan ini.",
					"Jalankan perintah di direktori repository kamu.",
					"Tunggu snapshot dan analisis selesai, lalu lanjutkan ke perencanaan.",
				],
				note: "Bentuk perintahnya: everythings-vibe codebase sync --project-id <id> --sync-token <token>.",
			},
			{
				heading: "Token sinkronisasi dan API key",
				paragraphs: [
					"Token sinkronisasi dibuat untuk satu percobaan dan tidak disimpan oleh CLI. Simpan nilai itu lewat variabel lingkungan EVERYTHINGS_VIBE_SYNC_TOKEN bila kamu tidak ingin membagikannya di riwayat terminal.",
					"API key dipakai untuk perintah project dan task setelah kamu menjalankan everythings-vibe login --api-key <kunci>. Keduanya berbeda dan tidak saling menggantikan.",
				],
				link: { label: "Kelola API key", to: "/settings/api-keys" },
			},
			{
				heading: "Keamanan file",
				paragraphs: [
					"CLI menyaring file rahasia seperti .env dan kunci privat, serta folder seperti node_modules, dist, dan .git sebelum mengunggah snapshot. Tambahkan aturan lain di file .everythingsvibeignore pada root repository bila diperlukan.",
				],
			},
			{
				heading: "Kendala yang sering muncul",
				bullets: [
					"CLI terlalu lama. Perbarui paket lalu ulangi perintah.",
					"Perintah dijalankan di subfolder. CLI mencari root repository melalui penanda .git, tetapi kamu juga bisa menentukan --root.",
					"Token kedaluwarsa. Minta token baru dari workspace lalu ulangi sinkronisasi.",
				],
			},
		],
		relatedIds: ["pasang-cli", "mode-codebase", "api-key-dan-keamanan"],
	},
	{
		id: "api-key-dan-keamanan",
		categoryId: "cli",
		title: "API key dan keamanan akses",
		description: "Buat, pakai, dan cabut kredensial dengan aman.",
		keywords: [
			"api key",
			"kunci api",
			"credential",
			"kredensial",
			"revoke",
			"cabut",
			"keamanan",
			"automatic",
			"otomatis",
		],
		sections: [
			{
				heading: "Membuat kunci",
				paragraphs: [
					"Buat API key dari Pengaturan, lalu pilih API Keys. Nilai kunci hanya ditampilkan sekali saat dibuat, jadi salin segera dan simpan di tempat yang aman.",
				],
				link: { label: "Buka Pengaturan API key", to: "/settings/api-keys" },
			},
			{
				heading: "Kunci otomatis",
				paragraphs: [
					"Untuk beberapa alur, aplikasi dapat membuat kunci otomatis agar proses berjalan tanpa langkah tambahan. Kunci itu tetap muncul dalam daftar yang sama dan bisa kamu cabut.",
				],
			},
			{
				heading: "Mencabut akses",
				paragraphs: [
					"Cabut kunci yang tidak dipakai atau yang kamu curigai bocor. Setelah dicabut, kunci itu tidak bisa dipakai untuk mengakses akun kamu.",
				],
				note: "Jangan menempelkan API key atau token sinkronisasi ke dalam prompt, kode, atau dokumen yang dibagikan.",
			},
		],
		relatedIds: ["sync-repository", "pasang-cli"],
	},
] as const;
