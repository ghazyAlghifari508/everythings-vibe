import type { HelpArticle } from "../types/help-article";

export const BILLING_ARTICLES: readonly HelpArticle[] = [
	{
		id: "paket-dan-kredit",
		categoryId: "billing",
		title: "Paket dan alokasi kredit",
		description: "Free, Pro, Hengker, dan saldo yang dipakai bersama.",
		keywords: [
			"paket",
			"pricing",
			"harga",
			"free",
			"pro",
			"hengker",
			"kredit",
			"alokasi",
			"30 hari",
			"reset",
			"trial",
		],
		sections: [
			{
				heading: "Isi paket",
				bullets: [
					"Free: Rp0 dengan 2 kredit per 30 hari, VibePlan dasar, dan VibeTemplate.",
					"Pro: Rp49.000 dengan 30 kredit per 30 hari dan akses penuh ke VibePlan, Studio, Scrape, serta VibeTemplate.",
					"Hengker: Rp149.000 dengan 105 kredit per 30 hari dan antrean prioritas.",
				],
				link: { label: "Lihat halaman harga", to: "/pricing" },
			},
			{
				heading: "Satu saldo untuk beberapa produk",
				paragraphs: [
					"Saldo yang sama dipakai VibePlan, Studio, dan Scrape saat tarifnya aktif. Alokasi direset setiap 30 hari dan sisa kredit tidak dibawa ke periode berikutnya.",
				],
			},
			{
				heading: "Trial untuk akun Free",
				paragraphs: [
					"Setiap akun Free mendapat satu trial Studio yang menghasilkan satu frame dan satu trial Scrape untuk satu proses dengan maksimal tiga halaman serta dua tampilan DESIGN.md. Trial tidak diperbarui tiap bulan, tetapi hasil yang sudah dibuat tetap bisa diakses.",
				],
				note: "Tarif kredit Studio dan Scrape belum diaktifkan, jadi belum ada potongan kredit untuk kedua produk itu.",
			},
		],
		relatedIds: [
			"cara-kerja-kredit",
			"top-up-dan-pembayaran",
			"kredit-untuk-pemula",
		],
	},
	{
		id: "cara-kerja-kredit",
		categoryId: "billing",
		title: "Cara kerja pemotongan kredit",
		description: "Estimasi, reservasi, biaya akhir, dan kegagalan operasi.",
		keywords: [
			"kredit habis",
			"saldo habis",
			"reservasi",
			"quote",
			"estimasi",
			"biaya",
			"gagal",
			"partial",
			"revisi gratis",
			"insufficient",
		],
		sections: [
			{
				heading: "Satu aksi generate, satu kredit",
				paragraphs: [
					"Pembuatan awal dokumen rencana, kriteria penerimaan, dan tugas memotong kredit. Besarnya mengikuti kompleksitas. Estimasi dan batas maksimal ditampilkan sebelum aksi dijalankan.",
				],
			},
			{
				heading: "Reservasi bukan biaya akhir",
				paragraphs: [
					"Selama aksi berjalan, kredit yang dibutuhkan ditandai sebagai reservasi. Jika aksi selesai, reservasi menjadi biaya akhir. Jika gagal atau dibatalkan, reservasi dilepas kembali ke saldo kamu.",
				],
				link: { label: "Lihat Pengaturan billing", to: "/settings/billing" },
			},
			{
				heading: "Jika saldo tidak cukup",
				paragraphs: [
					"Aksi tidak dijalankan ketika saldo tidak mencukupi. Kamu bisa memeriksa sisa saldo di Pengaturan billing, lalu menambah kredit bila akun kamu memenuhi syarat.",
				],
			},
			{
				heading: "Hasil sebagian",
				paragraphs: [
					"Pada aksi yang terdiri dari beberapa unit, biaya dihitung dari unit yang selesai dan tidak melewati batas maksimal yang disetujui saat estimasi.",
				],
				note: "Melihat hasil, revisi manual, revisi dokumen rencana lewat chat, dan VibeTemplate tidak memotong kredit.",
			},
		],
		relatedIds: ["paket-dan-kredit", "top-up-dan-pembayaran", "prd-dan-revisi"],
	},
	{
		id: "top-up-dan-pembayaran",
		categoryId: "billing",
		title: "Top up dan riwayat pembayaran",
		description: "Tambah kredit pada periode berjalan dan cek transaksinya.",
		keywords: [
			"top up",
			"topup",
			"bayar",
			"pembayaran",
			"midtrans",
			"riwayat",
			"tagihan",
			"kuota",
			"hangus",
		],
		sections: [
			{
				heading: "Syarat top up",
				paragraphs: [
					"Top up tersedia untuk paket berbayar yang masih aktif. Jumlah kredit top up dalam satu periode dibatasi sampai alokasi paket dikurangi top up yang sudah berhasil dalam periode itu.",
				],
			},
			{
				heading: "Masa berlaku",
				paragraphs: [
					"Top up masuk ke saldo periode berjalan. Top up tidak memperpanjang masa aktif dan ikut hangus bersama alokasi ketika periode berakhir.",
				],
			},
			{
				heading: "Riwayat",
				paragraphs: [
					"Di Pengaturan billing kamu bisa melihat alokasi, kredit terpakai, kredit yang sedang direservasi, dan riwayat pembayaran.",
				],
				link: { label: "Buka Pengaturan billing", to: "/settings/billing" },
			},
		],
		relatedIds: ["paket-dan-kredit", "cara-kerja-kredit"],
	},
] as const;
