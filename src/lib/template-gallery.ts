// Readonly catalogs: shared definitions must not be mutable at runtime —
// any module could otherwise push/splice entries and corrupt every
// subsequent render in the process. Deep-frozen below.
interface CatalogEntry {
	readonly id: string;
	readonly title: string;
	readonly prompt: string;
}

interface TemplateEntry extends CatalogEntry {
	readonly icon: string;
	readonly platform: "web" | "mobile";
}

function freezeCatalog<T extends CatalogEntry>(entries: T[]): readonly T[] {
	for (const entry of entries) Object.freeze(entry);
	return Object.freeze(entries);
}

export const TEMPLATE_GALLERY: readonly TemplateEntry[] = freezeCatalog([
	{
		id: "saas-analytics",
		title: "SaaS Analytics Dashboard",
		icon: "BarChart",
		platform: "web" as const,
		prompt:
			"Saya ingin membuat SaaS Analytics Dashboard untuk UMKM yang menampilkan penjualan harian, stok, dan prediksi AI. Target user pemilik toko. Butuh role admin dan staff, integrasi Midtrans, dan laporan export PDF. Buatkan PRD lengkap.",
	},
	{
		id: "marketplace",
		title: "Marketplace UMKM",
		icon: "Store",
		platform: "web" as const,
		prompt:
			"Marketplace untuk produk UMKM lokal dengan fitur katalog, keranjang, checkout, chat penjual-pembeli, dan sistem review. Platform web, butuh admin panel dan kurir tracking.",
	},
	{
		id: "habit-mobile",
		title: "Habit Tracker Mobile",
		icon: "Smartphone",
		platform: "mobile" as const,
		prompt:
			"Aplikasi mobile habit tracker dengan streak, reminder notifikasi, statistik mingguan, dan social share. Target Gen Z, butuh onboarding gamified dan premium subscription.",
	},
	{
		id: "edu-lms",
		title: "LMS Edukasi",
		icon: "GraduationCap",
		platform: "web" as const,
		prompt:
			"Platform LMS untuk kursus online dengan video streaming, quiz, sertifikat otomatis, dan forum diskusi. Butuh role mentor dan student, payment gateway, dan progress tracking.",
	},
	{
		id: "crm",
		title: "CRM Penjualan",
		icon: "Users",
		platform: "web" as const,
		prompt:
			"CRM untuk tim sales dengan pipeline kanban, reminder follow-up, integrasi WhatsApp, dan laporan performa. Butuh role admin, sales, manager.",
	},
	{
		id: "pos",
		title: "POS Kasir",
		icon: "Receipt",
		platform: "mobile" as const,
		prompt:
			"Aplikasi POS kasir untuk warung dengan scan barcode, cetak struk Bluetooth, laporan harian, dan manajemen stok. Platform mobile Android, offline-first.",
	},
]);

interface CodebaseFeatureTemplate {
	readonly id: string;
	readonly title: string;
	readonly category: string;
	readonly prompt: string;
}

export const CODEBASE_FEATURE_TEMPLATES: readonly CodebaseFeatureTemplate[] =
	freezeCatalog([
		{
			id: "feature-wishlist",
			title: "Wishlist Produk & Favorit",
			category: "Fitur Pengguna",
			prompt:
				"Tambahkan fitur wishlist produk agar pengguna yang sedang login dapat menyimpan item favorit mereka, melihat daftar wishlist di halaman profil, serta menambah atau menghapus produk langsung dari katalog dengan update state seketika.",
		},
		{
			id: "feature-export-reports",
			title: "Ekspor Transaksi CSV & PDF",
			category: "Laporan & Export",
			prompt:
				"Buatkan fungsionalitas ekspor riwayat transaksi ke format file CSV dan PDF dengan filter rentang tanggal, status pesanan, serta pagination data yang efisien tanpa membebani server.",
		},
		{
			id: "feature-oauth-google",
			title: "Integrasi Google OAuth",
			category: "Autentikasi",
			prompt:
				"Tambahkan opsi autentikasi login dan daftar menggunakan Google OAuth ke sistem akun yang sudah berjalan, dengan sinkronisasi data profil pengguna dan penanganan session cookie yang aman.",
		},
		{
			id: "feature-rbac",
			title: "Role & Permission (RBAC)",
			category: "Hak Akses",
			prompt:
				"Implementasikan sistem Role-Based Access Control (Admin, Manager, Staff) untuk mengontrol izin akses endpoint API, mutasi database, dan pembatasan menu di dashboard internal.",
		},
		{
			id: "feature-webhook-notifications",
			title: "Notifikasi Webhook Otomatis",
			category: "Integrasi",
			prompt:
				"Tambahkan pengiriman notifikasi email dan webhook otomatis saat status pembayaran atau pesanan berubah, dilengkapi dengan retry mechanism jika webhook tujuan gagal merespons.",
		},
		{
			id: "feature-dark-mode",
			title: "Dark Mode & Preferensi Tema",
			category: "Antarmuka UI",
			prompt:
				"Tambahkan dukungan mode gelap dan terang pada antarmuka aplikasi dengan pendeteksian preferensi sistem operasi otomatis serta penyimpanan preferensi tema di level user session.",
		},
	]);
export type TemplateCategory = "planning" | "design" | "boilerplate";

export interface VibeTemplateEntry {
	readonly id: string;
	readonly title: string;
	readonly category: TemplateCategory;
	readonly icon: string;
	readonly platform: "web" | "mobile";
	readonly description: string;
	readonly prompt: string;
	readonly tags: readonly string[];
	readonly recommendedTarget: "/plan/new" | "/design/studio";
	readonly techStack?: readonly string[];
}

export const VIBE_TEMPLATES: readonly VibeTemplateEntry[] = freezeCatalog([
	{
		id: "saas-analytics",
		title: "SaaS Analytics & Billing Dashboard",
		category: "planning",
		icon: "BarChart3",
		platform: "web",
		description:
			"Dashboard analitik subscription SaaS dengan recurring billing, metrik churn, MRR/ARR, dan export laporan CSV/PDF.",
		prompt:
			"Saya ingin membuat SaaS Analytics Dashboard untuk pemilik bisnis digital yang menampilkan pendapatan harian, MRR, ARR, churn rate, dan prediksi pendapatan berbasis AI. Target pengguna adalah founder startup dan finance officer. Sistem membutuhkan role Admin, Finance, dan Viewer, integrasi payment gateway Midtrans dan Stripe untuk subscription recurring bulanan/tahunan, webhook verifikasi pembayaran otomatis, audit log aktivitas transaksi, dan fungsionalitas export laporan ke PDF dan CSV. Buatkan PRD lengkap beserta struktur database dan acceptance criteria.",
		tags: ["SaaS", "Analytics", "Billing", "Midtrans", "Dashboard"],
		recommendedTarget: "/plan/new",
	},
	{
		id: "marketplace-umkm",
		title: "Marketplace Multi-Vendor UMKM",
		category: "planning",
		icon: "Store",
		platform: "web",
		description:
			"Platform marketplace e-commerce multi-penjual dengan manajemen toko, keranjang belanja, escrow payment, dan ongkir otomatis.",
		prompt:
			"Saya ingin membangun platform Marketplace Multi-Vendor untuk produk UMKM lokal Indonesia. Fitur mencakup registrasi penjual (KYC verifikasi KTP/rekening), manajemen katalog produk dengan varian stok/harga, keranjang belanja terpusat, integrasi API RajaOngkir untuk hitung ongkir otomatis JNE/J&T/SiCepat, pembayaran escrow via virtual account dan QRIS Midtrans, sistem chat realtime penjual-pembeli, serta ulasan produk dengan bintang dan foto. Buatkan PRD lengkap dengan user flow pembeli, penjual, dan admin pasar.",
		tags: ["Marketplace", "E-Commerce", "Multi-Vendor", "RajaOngkir", "QRIS"],
		recommendedTarget: "/plan/new",
	},
	{
		id: "habit-tracker-mobile",
		title: "Gamified Habit Tracker Mobile",
		category: "planning",
		icon: "Smartphone",
		platform: "mobile",
		description:
			"Aplikasi mobile pelacak kebiasaan harian dengan sistem streak gamifikasi, push notification, dan widget interaktif.",
		prompt:
			"Saya ingin membuat aplikasi mobile Habit Tracker gamified untuk pengguna produktif dan pelajar. Fitur utama mencakup pembuatan kebiasaan harian/mingguan dengan target frekuensi (angka, durasi timer, atau checklist), sistem reward XP dan streak harian yang tidak boleh putus, pengingat push notification terjadwal, kalender visual heatmap konsistensi, statistik mingguan dengan diagram pencapaian, dan fitur backup cloud sinkronisasi akun Google/Apple. Desain offline-first menggunakan SQLite lokal. Buatkan PRD lengkap beserta alur onboarding dan sistem notifikasi.",
		tags: [
			"Mobile",
			"Gamification",
			"Habit",
			"Offline-First",
			"Push Notification",
		],
		recommendedTarget: "/plan/new",
	},
	{
		id: "lms-online-learning",
		title: "LMS Kursus & Sertifikasi Online",
		category: "planning",
		icon: "GraduationCap",
		platform: "web",
		description:
			"Platform manajemen kursus online dengan kurikulum video bertingkat, quiz interaktif, forum diskusi, dan sertifikat otomatis.",
		prompt:
			"Saya ingin membuat platform Learning Management System (LMS) untuk kursus pemrograman dan desain digital. Fitur mencakup manajemen modul video berseri dengan tracking progres tontonan, kuis pilihan ganda dan tugas coding submission, sistem forum diskusi per materi kursus, penilaian otomatis, dan penerbitan sertifikat digital ber-QR Code verifikasi unik saat kursus tuntas 100%. Sistem membutuhkan role Student, Instruktur, dan Admin Akademik, serta integrasi checkout berbayar satu kali beli (one-time purchase) atau paket langganan bulanan. Buatkan PRD terstruktur.",
		tags: ["LMS", "Education", "Video", "Certificate", "Quiz"],
		recommendedTarget: "/plan/new",
	},
	{
		id: "crm-sales-pipeline",
		title: "CRM Penjualan & Pipeline Kanban",
		category: "planning",
		icon: "Users",
		platform: "web",
		description:
			"Sistem CRM tim sales B2B dengan visualisasi pipeline lead kanban, reminder follow-up, integrasi WhatsApp, dan laporan konversi.",
		prompt:
			"Saya ingin membangun aplikasi CRM Penjualan untuk tim sales B2B enterprise. Fitur utama meliputi visualisasi pipeline prospek berbentuk Kanban Board (Lead Masuk, Dihubungi, Demo Produk, Negosiasi, Closing, Lost), pencatatan riwayat interaksi deal (telepon, email, meeting), reminder otomatis follow-up via WhatsApp Business API dan email, pembagian prospek otomatis antar staf sales (round-robin), kalkulasi nilai proyek dan komisi sales, serta dashboard analitik rasio konversi. Role mencakup Sales Rep, Sales Manager, dan Direktur. Buatkan PRD lengkap.",
		tags: ["CRM", "Sales", "Kanban", "WhatsApp API", "B2B"],
		recommendedTarget: "/plan/new",
	},
	{
		id: "pos-kasir-retail",
		title: "POS Kasir & Manajemen Stok Retail",
		category: "planning",
		icon: "Receipt",
		platform: "mobile",
		description:
			"Aplikasi kasir Point of Sale tablet/mobile dengan scan barcode kamera, cetak struk Bluetooth thermal, dan stok opname.",
		prompt:
			"Saya ingin membuat aplikasi Point of Sale (POS) kasir modern untuk gerai retail dan F&B skala UMKM. Aplikasi berjalan di tablet Android dan iPad secara offline-first. Fitur mencakup input transaksi cepat lewat katalog kategori atau scan barcode kamera/scanner bluetooth, perhitungan diskon promosi dan pajak PPN otomatis, pembayaran multi-metode (Tunai, QRIS, Kartu Debit), cetak struk via printer thermal Bluetooth 58mm/80mm dan kirim nota PDF via WhatsApp, serta rekonsiliasi kas kasir saat buka dan tutup shift. Buatkan PRD dan skema database transaksi.",
		tags: ["POS", "Retail", "Offline-First", "Thermal Printer", "Inventory"],
		recommendedTarget: "/plan/new",
	},
	{
		id: "dark-saas-dashboard-ui",
		title: "Minimalist Dark SaaS Analytics UI",
		category: "design",
		icon: "LayoutDashboard",
		platform: "web",
		description:
			"Antarmuka dashboard analitik gelap dengan grafik interaktif, hairline 1px borders, metrik KPI, dan tabel data mutasi.",
		prompt:
			"Buatkan halaman lengkap Dashboard Web SaaS Analytics bergaya modern dark-mode ultra-clean. Gunakan palet warna latar charcoal gelap (#0f1115), card surface onyx (#16181d), dan hairline border 1px halus (#262a33). Di bagian atas buat header dengan nama aplikasi, search bar global, notifikasi, dan profil user. Di bawahnya buat 4 kartu KPI (Total Revenue, Active Users, Conversion Rate, Churn) dengan persentase tren naik hijau neon. Di bagian tengah sediakan area grafik besar tren pendapatan dan diagram distribusi pengguna. Di bagian bawah tampilkan tabel riwayat transaksi terbaru lengkap dengan badge status (Berhasil, Pending, Gagal) dan tombol aksi. Pastikan menggunakan Tailwind CDN dan icon Lucide.",
		tags: ["Dark Mode", "Analytics", "Dashboard", "KPI Cards", "Tailwind CSS"],
		recommendedTarget: "/design/studio",
	},
	{
		id: "simrs-portal-ui",
		title: "Healthcare & SIMRS Hospital Portal UI",
		category: "design",
		icon: "HeartPulse",
		platform: "web",
		description:
			"Antarmuka sistem informasi rumah sakit dengan status kamar ranap, antrean poliklinik, rekam medis ringkas, dan jadwal dokter.",
		prompt:
			"Rancang antarmuka desktop portal dashboard Sistem Informasi Manajemen Rumah Sakit (SIMRS) yang bersih, ergonomis, dan profesional untuk perawat dan dokter. Bagian atas menampilkan ringkasan operasional: Total Pasien Hari Ini, Ketersediaan Tempat Tidur Rawat Inap (Bed Availability per kelas VIP, I, II, III), Pasien IGD Aktif, dan Dokter Sedang Bertugas. Tampilkan tabel live antrean poliklinik rawat jalan dengan nomor antrean, nama pasien, poli spesialis, nama dokter, dan status (Menunggu, Dipanggil, Sedang Periksa). Sertakan panel samping ringkasan data vital pasien terpilih (tekanan darah, suhu, alergi obat). Gunakan warna aksen biru medis (#0284c7) dan hijau toska (#0d9488) yang menenangkan.",
		tags: ["SIMRS", "Hospital", "Healthcare", "Patient Queue", "Medical UI"],
		recommendedTarget: "/design/studio",
	},
	{
		id: "ecommerce-mobile-ui",
		title: "E-Commerce Mobile App Storefront UI",
		category: "design",
		icon: "ShoppingBag",
		platform: "mobile",
		description:
			"Tampilan antarmuka mobile e-commerce modern dengan banner promosi carousel, grid produk 2 kolom, dan bottom navigation bar.",
		prompt:
			"Buatkan layout antarmuka mobile aplikasi belanja online e-commerce modern di viewport mobile (375px). Di bagian atas buat search bar produk dengan tombol keranjang belanja dan badge jumlah item. Di bawahnya pasang banner promo slider dengan warna gradien menarik dan countdown flash sale. Tampilkan kategori cepat dalam icon bulat (Elektronik, Fashion, Kuliner, Gadget). Di bawahnya buat grid produk 2 kolom yang menampilkan gambar produk, judul produk 2 baris, rating bintang dan jumlah terjual, harga diskon coret, harga akhir tebal, dan tombol tambah ke keranjang instan (+). Di bagian paling bawah buat fixed bottom navigation bar (Home, Kategori, Favorit, Pesanan, Akun).",
		tags: [
			"Mobile UI",
			"E-Commerce",
			"Product Grid",
			"Bottom Nav",
			"Storefront",
		],
		recommendedTarget: "/design/studio",
	},
	{
		id: "fintech-wallet-ui",
		title: "Fintech Digital Wallet & Transfer Flow UI",
		category: "design",
		icon: "CreditCard",
		platform: "mobile",
		description:
			"Tampilan dompet digital modern dengan kartu saldo virtual gradien, menu transfer cepat, dan riwayat mutasi bank.",
		prompt:
			"Rancang antarmuka mobile dompet digital fintech modern premium (375px). Header atas menampilkan sapaan pengguna, avatar foto, dan tombol scan QRIS. Bagian utama adalah kartu saldo virtual bergradien ungu-biru elegan yang menampilkan total saldo rupiah, nomor kartu tersembunyi (**** 4892), dan tombol Top Up, Transfer, Tarik Tunai, serta Minta Uang. Di bawahnya tampilkan deretan icon lingkaran aksi cepat kontak favorit untuk transfer 1-klik. Di bagian bawah sediakan daftar riwayat transaksi terbaru yang dikelompokkan berdasarkan tanggal (Hari Ini, Kemarin), lengkap dengan logo merchant, kategori, dan nominal uang berwarna merah (keluar) atau hijau (masuk).",
		tags: ["Fintech", "Wallet", "Virtual Card", "Transfer Flow", "QRIS"],
		recommendedTarget: "/design/studio",
	},
	{
		id: "ai-coding-canvas-ui",
		title: "AI Coding Assistant & Canvas Split-View UI",
		category: "design",
		icon: "Terminal",
		platform: "web",
		description:
			"Antarmuka split-screen modern ala coding agent: panel chat instruksi di kiri dan live canvas preview browser di kanan.",
		prompt:
			"Rancang antarmuka desktop split-view untuk tool AI Coding Assistant (seperti Cursor / Claude Code web). Sebelah kiri (lebar 420px) adalah panel chat agen AI dengan riwayat balon chat, blok perintah terminal bash dengan tombol salin, status eksekusi task bertingkat (checklist animasi), dan textarea input prompt mengambang di bawah. Sebelah kanan adalah live canvas preview interaktif yang memiliki browser mock bar (tombol back, forward, URL address bar localhost:3000, reload), selector ukuran layar (Desktop, Tablet, Mobile), dan toggle inspeksi kode HTML/CSS. Gunakan tema dark obsidian modern dengan aksen indigo.",
		tags: ["AI Agent", "Coding Canvas", "Split-View", "Terminal UI", "DevTool"],
		recommendedTarget: "/design/studio",
	},
	{
		id: "editorial-landing-ui",
		title: "Editorial Typography Product Landing UI",
		category: "design",
		icon: "Sparkles",
		platform: "web",
		description:
			"Halaman landing page produk premium dengan tipografi editorial berani, grid fitur asimetris, dan testimoni elegan.",
		prompt:
			"Buatkan halaman landing page produk perangkat lunak bernuansa editorial magazine premium. Gunakan tipografi serif yang berani dan kontras tinggi untuk judul hero display, dipadukan dengan sans-serif geometris untuk teks bodi. Bagian hero memiliki headline puitis yang besar, subtitle deskriptif, dan dua tombol CTA (Primary hitam elegan dan Secondary outline hairline). Di bawahnya tampilkan logo klien monokrom bergaya minimalis. Di bagian fitur, gunakan layout bento asimetris dengan kartu bersudut membulat halus, ikon minimalis, dan visual skematis. Di bagian footer sertakan navigasi tautan multi-kolom dan form pendaftaran newsletter sederhana.",
		tags: ["Landing Page", "Editorial", "Typography", "Bento Grid", "Branding"],
		recommendedTarget: "/design/studio",
	},
	{
		id: "simrs-hospital",
		title: "SIMRS Enterprise Hospital System Boilerplate",
		category: "boilerplate",
		icon: "Building2",
		platform: "web",
		description:
			"Sistem Rumah Sakit Enterprise siap jalan: Rawat Inap, Rawat Jalan, Rekam Medis Elektronik (RME), Farmasi, dan Billing.",
		prompt:
			"Buatkan blueprint arsitektur dan PRD lengkap untuk Boilerplate SIMRS (Sistem Informasi Manajemen Rumah Sakit) Enterprise berbasis web modern. Arsitektur menggunakan TanStack Start + Drizzle ORM + PostgreSQL. Sistem memiliki 5 modul inti: 1) Pendaftaran & Admisi Pasien (antrean BPJS & Umum), 2) Rawat Jalan & Poliklinik Spesialis, 3) Rawat Inap (Kapasitas Bed, Perawat, Visit Dokter), 4) Rekam Medis Elektronik (RME standar Kemenkes SatuSehat ICD-10 & ICD-9-CM), dan 5) Farmasi & Kasir Billing Terintegrasi. Skema database relasional harus mencakup tabel pasien, dokter, pendaftaran, resep, transaksi pembayaran, dan audit trail medis. Sertakan struktur role-based access control (Admin, Dokter, Perawat, Apoteker, Kasir).",
		tags: [
			"Boilerplate",
			"SIMRS",
			"Healthcare",
			"TanStack Start",
			"Drizzle ORM",
			"PostgreSQL",
		],
		recommendedTarget: "/plan/new",
		techStack: [
			"TanStack Start",
			"Drizzle ORM",
			"PostgreSQL",
			"Better Auth",
			"Tailwind CSS",
		],
	},
	{
		id: "b2b-saas-starter",
		title: "B2B Multi-Tenant SaaS Starter Boilerplate",
		category: "boilerplate",
		icon: "Layers",
		platform: "web",
		description:
			"Boilerplate SaaS multi-tenant dengan isolasi data organisasi, RBAC peran tim, billing langganan Midtrans, dan audit log.",
		prompt:
			"Rancang blueprint arsitektur teknis dan PRD lengkap untuk B2B Multi-Tenant SaaS Starter Boilerplate. Fondasi aplikasi mencakup: 1) Multi-tenancy berbasis Organization/Workspace dengan subdomain unik dan isolasi tenant (WHERE organization_id = ?), 2) Autentikasi tim berbasis Better Auth dengan role Owner, Admin, Member, dan Guest, 3) Sistem perizinan granular (Role-Based Access Control / RBAC) untuk modul data, 4) Integrasi Billing Midtrans recurring payment dengan webhook verifikasi dan portal invoice, 5) Audit log sistem untuk setiap mutasi data sensitif, dan 6) Dashboard analitik tim. Berikan rincian DDL skema Drizzle ORM, DTO, dan middleware authorization.",
		tags: [
			"Boilerplate",
			"B2B SaaS",
			"Multi-Tenant",
			"RBAC",
			"Better Auth",
			"Billing",
		],
		recommendedTarget: "/plan/new",
		techStack: [
			"TanStack Start",
			"Drizzle ORM",
			"Better Auth",
			"Midtrans",
			"PostgreSQL",
		],
	},
	{
		id: "ecommerce-storefront",
		title: "Full-Stack E-Commerce Storefront Boilerplate",
		category: "boilerplate",
		icon: "ShoppingCart",
		platform: "web",
		description:
			"Boilerplate toko online modern lengkap: etalase katalog, keranjang belanja Zustand, checkout Midtrans/Stripe, dan panel admin pesanan.",
		prompt:
			"Susun blueprint spesifikasi arsitektur teknis dan PRD untuk Full-Stack E-Commerce Storefront Boilerplate. Sistem terdiri dari dua sisi aplikasi: 1) Storefront Pelanggan (katalog produk dengan filtering kategori dan harga, search instan, halaman detail produk dengan varian ukuran/warna, keranjang belanja lokal tersinkronisasi, dan formulir checkout alamat pengiriman dengan kalkulasi kurir ongkir), 2) Panel Admin Manajemen Toko (dashboard metrik penjualan harian, manajemen CRUD produk dan stok opname, serta daftar pesanan masuk dengan status update pembayaran dan resi pengiriman). Integrasikan gateway pembayaran Midtrans Snap & QRIS. Sediakan skema Drizzle ORM dan alur webhook pembayaran idempotent.",
		tags: [
			"Boilerplate",
			"E-Commerce",
			"Storefront",
			"Cart State",
			"Midtrans",
			"Order Management",
		],
		recommendedTarget: "/plan/new",
		techStack: [
			"TanStack Start",
			"Drizzle ORM",
			"Zustand",
			"Midtrans",
			"PostgreSQL",
		],
	},
	{
		id: "ai-agent-workflow",
		title: "AI Agentic Workflow & Canvas Boilerplate",
		category: "boilerplate",
		icon: "Bot",
		platform: "web",
		description:
			"Boilerplate aplikasi agen AI dengan streaming SSE, memory percakapan, pembagian task bertingkat, dan live canvas preview.",
		prompt:
			"Buatkan spesifikasi arsitektur teknis dan PRD untuk Boilerplate Aplikasi Agen AI (AI Agentic Workflow Platform). Aplikasi menyediakan kemampuan eksekusi agen AI interaktif: 1) Chat orchestration menggunakan Vercel AI SDK dengan model fallback (Claude, GPT, Gemini), 2) Streaming respon realtime menggunakan Server-Sent Events (SSE) dengan penanganan token error retry, 3) Manajemen state percakapan dan branching session tersimpan di PostgreSQL, 4) Mesin pembagi task bertingkat (Planner -> Executor -> Reviewer) dengan status visual kanban progress, dan 5) Sandboxed live preview canvas untuk menampilkan artefak dokumen (Markdown, HTML, Diagram Mermaid). Jelaskan skema database, arsitektur event stream, dan penanganan rate-limiting kredit.",
		tags: [
			"Boilerplate",
			"AI Agent",
			"Streaming SSE",
			"Vercel AI SDK",
			"Canvas Sandbox",
		],
		recommendedTarget: "/plan/new",
		techStack: [
			"TanStack Start",
			"Vercel AI SDK",
			"Drizzle ORM",
			"SSE",
			"PostgreSQL",
		],
	},
]);

export function getTemplatesByCategory(
	category: TemplateCategory,
): readonly VibeTemplateEntry[] {
	return VIBE_TEMPLATES.filter((t) => t.category === category);
}

export function searchTemplates(
	query: string,
	category?: TemplateCategory | "all",
): readonly VibeTemplateEntry[] {
	const q = query.trim().toLowerCase();
	return VIBE_TEMPLATES.filter((t) => {
		if (category && category !== "all" && t.category !== category) return false;
		if (!q) return true;
		return (
			t.title.toLowerCase().includes(q) ||
			t.description.toLowerCase().includes(q) ||
			t.prompt.toLowerCase().includes(q) ||
			t.tags.some((tag) => tag.toLowerCase().includes(q)) ||
			(t.techStack?.some((tech) => tech.toLowerCase().includes(q)) ?? false)
		);
	});
}
