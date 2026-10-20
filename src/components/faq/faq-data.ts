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
		id: "product-output",
		title: "Apa yang bisa dibuat dengan VibeEverything?",
		subtitle: "Ubah ide produk menjadi dokumen kerja",
		content:
			"VibeEverything membantu menyusun PRD, acceptance criteria, task tree, dan Kanban dari satu ide produk. Hasilnya bisa kamu baca, revisi, dan lanjutkan sebagai dasar kerja tim.",
		icon: "spark",
	},
	{
		id: "greenfield-vs-codebase",
		title: "Apa perbedaan VibePlan Greenfield dan Codebase Existing?",
		subtitle: "Mulai dari ide mentah vs sinkronisasi repositori lokal",
		content:
			"Greenfield memulai dari ide mentah: kamu menulis prompt, menjawab pertanyaan klarifikasi, lalu menerima PRD 8 seksi. Codebase Existing menghubungkan repository lokal lewat CLI sync, sehingga pertanyaan klarifikasi dan PRD disusun dari konteks kode yang sudah ada, bukan dari nol.",
		icon: "workflow",
	},
	{
		id: "vibescrape-vs-studio",
		title: "Apa perbedaan VibeScrape dan VibeDesign Studio?",
		subtitle: "Ekstraksi website publik vs prototyping antarmuka",
		content:
			"VibeScrape adalah workspace mandiri di /scrape untuk mengekstrak HTML, token desain, dan aset gambar dari website publik. Riwayat hasilnya ada di /scrape/history. VibeDesign Studio di /design digunakan untuk membuat dan merevisi antarmuka dari prompt, dan dapat memakai hasil VibeScrape sebagai referensi desain.",
		icon: "spark",
	},
	{
		id: "cli-connect",
		title: "Bagaimana cara menghubungkan repository lokal lewat CLI?",
		subtitle: "Autentikasi dan sinkronisasi snapshot repositori",
		content:
			"Jalankan vibeeverything login di terminal untuk autentikasi, lalu vibeeverything codebase sync dari root repository. CLI mengirim snapshot repository yang difilter ke server, dan analisis sinkronisasi berjalan otomatis hingga statusnya selesai.",
		icon: "terminal",
	},
	{
		id: "guided-flow",
		title: "Bagaimana alur kerja VibeEverything?",
		subtitle: "Jawab pertanyaan yang menentukan arah produk",
		content:
			"Mulai dari ide produk, jawab pertanyaan klarifikasi, lalu VibeEverything menyusun PRD dengan delapan bagian. Setelah itu kamu bisa melanjutkan ke acceptance criteria, task tree, dan Kanban.",
		icon: "workflow",
	},
	{
		id: "prd-revision",
		title: "Apakah PRD bisa direvisi?",
		subtitle: "Perbaiki bagian tertentu tanpa menulis ulang semuanya",
		content:
			"Bisa. Kamu dapat meminta revisi pada PRD melalui chat. Revisi hanya memperbarui bagian yang diminta dan tidak memakai credit tambahan.",
		icon: "document",
	},
	{
		id: "task-kanban",
		title: "Apa hubungan PRD, Task, dan Kanban?",
		subtitle: "Dari keputusan produk sampai pekerjaan yang bisa dilacak",
		content:
			"PRD menjelaskan produk, acceptance criteria merinci kondisi penerimaan, dan task tree memecah pekerjaan. Task tersebut kemudian dapat dilacak melalui board Kanban.",
		icon: "board",
	},
	{
		id: "credits",
		title: "Kapan credit digunakan?",
		subtitle: "Satu credit untuk satu proses generate",
		content:
			"Satu credit digunakan untuk satu generate PRD, acceptance criteria, atau task. Revisi dokumen tetap gratis dan tidak mengurangi credit. Paket Free mendapat 2 credit, Pro 30 credit, dan Hengker 105 credit.",
		icon: "credit",
	},
	{
		id: "feedback",
		title: "Bagaimana cara memberi masukan?",
		subtitle: "Laporkan bug atau usulkan fitur dari Settings",
		content:
			"Buka Settings lalu pilih Feedback. Kamu bisa mengirim laporan bug atau usulan fitur dari halaman tersebut.",
		icon: "feedback",
	},
];
