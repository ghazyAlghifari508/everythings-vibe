# Phase 3: VibeTemplate Catalog & VibeBantuan Hub Implementation Plan

> **For agentic workers & OMP:** Steps use checkbox (`- [ ]`) syntax for tracking. Follow tasks linearly from Task 1 to Task 5. Write failing tests first, implement minimal code, verify passing tests, and synchronize the route tree (`pnpm generate-routes`) at every step.

**Goal:** Implement the complete VibeTemplate 3-category prompt directory (`/templates`) and the comprehensive VibeBantuan support hub (`/bantuan`), connecting template action triggers directly into `/plan/new` and `/design/studio` via prefilled URL search parameters.

**Architecture:** TanStack Start full-stack routes with TanStack Router validated search params (`zod`). The template catalog is organized into 3 typed categories (*Planning*, *Design*, *Boilerplate Projects*) with client-side category filtering, real-time keyword search, copy-to-clipboard actions, and deep-linking into VibePlan and VibeDesign Studio. VibeBantuan provides searchable FAQs, interactive workflow guides for all subsystems, and an integrated feedback/bug reporting portal connected to the admin desk.

**Tech Stack:** TanStack Start, TanStack Router, React 19, TypeScript, Tailwind CSS, Lucide React, Zod, Vitest.

**Spec:** [`docs/superpowers/specs/2026-09-28-vibeeverything-architecture-spec.md`](file:///C:/Coding/Web%20Development/Tanstack-start/prdfy/docs/superpowers/specs/2026-09-28-vibeeverything-architecture-spec.md)  
**Visual UI Blueprint:** [`prototype-vibe-hub.html`](file:///C:/Coding/Web%20Development/Tanstack-start/prdfy/prototype-vibe-hub.html)  

---

## Global Engineering Constraints (STRICT ANTI-SLOP RULES)

1. **NO PLACEHOLDER PROMPTS:** Every single template in the catalog must contain a complete, professional, production-grade prompt (minimum 100+ words per prompt) covering user personas, tech architecture, feature breakdown, and business constraints. Writing short 1-line filler prompts is strictly forbidden.
2. **SEARCH PARAMS VALIDATION:** All deep-link URL search parameters (`?prompt=...`, `?category=...`, `?platform=...`) must be validated using Zod schemas via TanStack Router's `validateSearch`.
3. **ZERO TYPE BYPASSES:** No `as any`, `as never`, `@ts-ignore`, or broad unknown casts. All catalog entries and category states must be strictly typed.
4. **ROUTE TREE SYNCHRONIZATION:** Execute `pnpm generate-routes` whenever modifying `src/routes/` so `src/routeTree.gen.ts` remains 100% synchronized.
5. **VISUAL DESIGN FIDELITY:** Spacing, 1px hairline borders (`border-white/10` / `border-graphite`), dark/light theme tokens, badge colors, and hover transitions must match [`prototype-vibe-hub.html`](file:///C:/Coding/Web%20Development/Tanstack-start/prdfy/prototype-vibe-hub.html).

---

### Task 1: Comprehensive 3-Category Template Library (`src/lib/template-gallery.ts`)

**Files:**
- Modify: `src/lib/template-gallery.ts`
- Modify: `src/lib/template-gallery.test.ts`

**Interfaces:**
- Consumes: Immutable catalog definitions.
- Produces: `VIBE_TEMPLATES` array containing typed templates across 3 categories:
  - `planning` (6 templates)
  - `design` (6 templates)
  - `boilerplate` (4 templates)
  with complete prompts, tag arrays, tech stacks, and target route targets.

- [ ] **Step 1: Write comprehensive test for the 3-category catalog structure**

```typescript
// src/lib/template-gallery.test.ts
import { describe, expect, it } from "vitest";
import {
	type TemplateCategory,
	type VibeTemplateEntry,
	VIBE_TEMPLATES,
	getTemplatesByCategory,
	searchTemplates,
} from "./template-gallery";

describe("VIBE_TEMPLATES Catalog", () => {
	it("contains all three required categories with minimum quotas", () => {
		const planning = getTemplatesByCategory("planning");
		const design = getTemplatesByCategory("design");
		const boilerplate = getTemplatesByCategory("boilerplate");

		expect(planning.length).toBeGreaterThanOrEqual(6);
		expect(design.length).toBeGreaterThanOrEqual(6);
		expect(boilerplate.length).toBeGreaterThanOrEqual(4);
	});

	it("ensures every template prompt is comprehensive and detailed (>100 characters)", () => {
		for (const t of VIBE_TEMPLATES) {
			expect(t.prompt.length).toBeGreaterThan(100);
			expect(t.title).toBeTruthy();
			expect(t.description).toBeTruthy();
			expect(t.tags.length).toBeGreaterThanOrEqual(2);
		}
	});

	it("contains specific required domain templates", () => {
		const ids = VIBE_TEMPLATES.map((t) => t.id);
		expect(ids).toContain("simrs-hospital");
		expect(ids).toContain("b2b-saas-starter");
		expect(ids).toContain("ecommerce-storefront");
		expect(ids).toContain("saas-analytics");
	});

	it("searches templates by keyword across title, tags, and description", () => {
		const results = searchTemplates("hospital");
		expect(results.some((r) => r.id === "simrs-hospital")).toBe(true);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/template-gallery.test.ts`
Expected: FAIL (Cannot find exported functions or missing categories)

- [ ] **Step 3: Implement `src/lib/template-gallery.ts`**

Update `src/lib/template-gallery.ts`:
```typescript
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

function freezeCatalog<T>(entries: T[]): readonly T[] {
	for (const entry of entries) Object.freeze(entry);
	return Object.freeze(entries);
}

export const VIBE_TEMPLATES: readonly VibeTemplateEntry[] = freezeCatalog([
	// === 1. PLANNING TEMPLATES ===
	{
		id: "saas-analytics",
		title: "SaaS Analytics & Billing Dashboard",
		category: "planning",
		icon: "BarChart3",
		platform: "web",
		description: "Dashboard analitik subscription SaaS dengan recurring billing, metrik churn, MRR/ARR, dan export laporan CSV/PDF.",
		prompt: "Saya ingin membuat SaaS Analytics Dashboard untuk pemilik bisnis digital yang menampilkan pendapatan harian, MRR, ARR, churn rate, dan prediksi pendapatan berbasis AI. Target pengguna adalah founder startup dan finance officer. Sistem membutuhkan role Admin, Finance, dan Viewer, integrasi payment gateway Midtrans dan Stripe untuk subscription recurring bulanan/tahunan, webhook verifikasi pembayaran otomatis, audit log aktivitas transaksi, dan fungsionalitas export laporan ke PDF dan CSV. Buatkan PRD lengkap beserta struktur database dan acceptance criteria.",
		tags: ["SaaS", "Analytics", "Billing", "Midtrans", "Dashboard"],
		recommendedTarget: "/plan/new",
	},
	{
		id: "marketplace-umkm",
		title: "Marketplace Multi-Vendor UMKM",
		category: "planning",
		icon: "Store",
		platform: "web",
		description: "Platform marketplace e-commerce multi-penjual dengan manajemen toko, keranjang belanja, escrow payment, dan ongkir otomatis.",
		prompt: "Saya ingin membangun platform Marketplace Multi-Vendor untuk produk UMKM lokal Indonesia. Fitur mencakup registrasi penjual (KYC verifikasi KTP/rekening), manajemen katalog produk dengan varian stok/harga, keranjang belanja terpusat, integrasi API RajaOngkir untuk hitung ongkir otomatis JNE/J&T/SiCepat, pembayaran escrow via virtual account dan QRIS Midtrans, sistem chat realtime penjual-pembeli, serta ulasan produk dengan bintang dan foto. Buatkan PRD lengkap dengan user flow pembeli, penjual, dan admin pasar.",
		tags: ["Marketplace", "E-Commerce", "Multi-Vendor", "RajaOngkir", "QRIS"],
		recommendedTarget: "/plan/new",
	},
	{
		id: "habit-tracker-mobile",
		title: "Gamified Habit Tracker Mobile",
		category: "planning",
		icon: "Smartphone",
		platform: "mobile",
		description: "Aplikasi mobile pelacak kebiasaan harian dengan sistem streak gamifikasi, push notification, dan widget interaktif.",
		prompt: "Saya ingin membuat aplikasi mobile Habit Tracker gamified untuk pengguna produktif dan pelajar. Fitur utama mencakup pembuatan kebiasaan harian/mingguan dengan target frekuensi (angka, durasi timer, atau checklist), sistem reward XP dan streak harian yang tidak boleh putus, pengingat push notification terjadwal, kalender visual heatmap konsistensi, statistik mingguan dengan diagram pencapaian, dan fitur backup cloud sinkronisasi akun Google/Apple. Desain offline-first menggunakan SQLite lokal. Buatkan PRD lengkap beserta alur onboarding dan sistem notifikasi.",
		tags: ["Mobile", "Gamification", "Habit", "Offline-First", "Push Notification"],
		recommendedTarget: "/plan/new",
	},
	{
		id: "lms-online-learning",
		title: "LMS Kursus & Sertifikasi Online",
		category: "planning",
		icon: "GraduationCap",
		platform: "web",
		description: "Platform manajemen kursus online dengan kurikulum video bertingkat, quiz interaktif, forum diskusi, dan sertifikat otomatis.",
		prompt: "Saya ingin membuat platform Learning Management System (LMS) untuk kursus pemrograman dan desain digital. Fitur mencakup manajemen modul video berseri dengan tracking progres tontonan, kuis pilihan ganda dan tugas coding submission, sistem forum diskusi per materi kursus, penilaian otomatis, dan penerbitan sertifikat digital ber-QR Code verifikasi unik saat kursus tuntas 100%. Sistem membutuhkan role Student, Instruktur, dan Admin Akademik, serta integrasi checkout berbayar satu kali beli (one-time purchase) atau paket langganan bulanan. Buatkan PRD terstruktur.",
		tags: ["LMS", "Education", "Video", "Certificate", "Quiz"],
		recommendedTarget: "/plan/new",
	},
	{
		id: "crm-sales-pipeline",
		title: "CRM Penjualan & Pipeline Kanban",
		category: "planning",
		icon: "Users",
		platform: "web",
		description: "Sistem CRM tim sales B2B dengan visualisasi pipeline lead kanban, reminder follow-up, integrasi WhatsApp, dan laporan konversi.",
		prompt: "Saya ingin membangun aplikasi CRM Penjualan untuk tim sales B2B enterprise. Fitur utama meliputi visualisasi pipeline prospek berbentuk Kanban Board (Lead Masuk, Dihubungi, Demo Produk, Negosiasi, Closing, Lost), pencatatan riwayat interaksi deal (telepon, email, meeting), reminder otomatis follow-up via WhatsApp Business API dan email, pembagian prospek otomatis antar staf sales (round-robin), kalkulasi nilai proyek dan komisi sales, serta dashboard analitik rasio konversi. Role mencakup Sales Rep, Sales Manager, dan Direktur. Buatkan PRD lengkap.",
		tags: ["CRM", "Sales", "Kanban", "WhatsApp API", "B2B"],
		recommendedTarget: "/plan/new",
	},
	{
		id: "pos-kasir-retail",
		title: "POS Kasir & Manajemen Stok Retail",
		category: "planning",
		icon: "Receipt",
		platform: "mobile",
		description: "Aplikasi kasir Point of Sale tablet/mobile dengan scan barcode kamera, cetak struk Bluetooth thermal, dan stok opname.",
		prompt: "Saya ingin membuat aplikasi Point of Sale (POS) kasir modern untuk gerai retail dan F&B skala UMKM. Aplikasi berjalan di tablet Android dan iPad secara offline-first. Fitur mencakup input transaksi cepat lewat katalog kategori atau scan barcode kamera/scanner bluetooth, perhitungan diskon promosi dan pajak PPN otomatis, pembayaran multi-metode (Tunai, QRIS, Kartu Debit), cetak struk via printer thermal Bluetooth 58mm/80mm dan kirim nota PDF via WhatsApp, serta rekonsiliasi kas kasir saat buka dan tutup shift. Buatkan PRD dan skema database transaksi.",
		tags: ["POS", "Retail", "Offline-First", "Thermal Printer", "Inventory"],
		recommendedTarget: "/plan/new",
	},

	// === 2. DESIGN TEMPLATES (UI PATTERNS & PROMPT STUDIO) ===
	{
		id: "dark-saas-dashboard-ui",
		title: "Minimalist Dark SaaS Analytics UI",
		category: "design",
		icon: "LayoutDashboard",
		platform: "web",
		description: "Antarmuka dashboard analitik gelap dengan grafik interaktif, hairline 1px borders, metrik KPI, dan tabel data mutasi.",
		prompt: "Buatkan halaman lengkap Dashboard Web SaaS Analytics bergaya modern dark-mode ultra-clean. Gunakan palet warna latar charcoal gelap (#0f1115), card surface onyx (#16181d), dan hairline border 1px halus (#262a33). Di bagian atas buat header dengan nama aplikasi, search bar global, notifikasi, dan profil user. Di bawahnya buat 4 kartu KPI (Total Revenue, Active Users, Conversion Rate, Churn) dengan persentase tren naik hijau neon. Di bagian tengah sediakan area grafik besar tren pendapatan dan diagram distribusi pengguna. Di bagian bawah tampilkan tabel riwayat transaksi terbaru lengkap dengan badge status (Berhasil, Pending, Gagal) dan tombol aksi. Pastikan menggunakan Tailwind CDN dan icon Lucide.",
		tags: ["Dark Mode", "Analytics", "Dashboard", "KPI Cards", "Tailwind CSS"],
		recommendedTarget: "/design/studio",
	},
	{
		id: "simrs-portal-ui",
		title: "Healthcare & SIMRS Hospital Portal UI",
		category: "design",
		icon: "HeartPulse",
		platform: "web",
		description: "Antarmuka sistem informasi rumah sakit dengan status kamar ranap, antrean poliklinik, rekam medis ringkas, dan jadwal dokter.",
		prompt: "Rancang antarmuka desktop portal dashboard Sistem Informasi Manajemen Rumah Sakit (SIMRS) yang bersih, ergonomis, dan profesional untuk perawat dan dokter. Bagian atas menampilkan ringkasan operasional: Total Pasien Hari Ini, Ketersediaan Tempat Tidur Rawat Inap (Bed Availability per kelas VIP, I, II, III), Pasien IGD Aktif, dan Dokter Sedang Bertugas. Tampilkan tabel live antrean poliklinik rawat jalan dengan nomor antrean, nama pasien, poli spesialis, nama dokter, dan status (Menunggu, Dipanggil, Sedang Periksa). Sertakan panel samping ringkasan data vital pasien terpilih (tekanan darah, suhu, alergi obat). Gunakan warna aksen biru medis (#0284c7) dan hijau toska (#0d9488) yang menenangkan.",
		tags: ["SIMRS", "Hospital", "Healthcare", "Patient Queue", "Medical UI"],
		recommendedTarget: "/design/studio",
	},
	{
		id: "ecommerce-mobile-ui",
		title: "E-Commerce Mobile App Storefront UI",
		category: "design",
		icon: "ShoppingBag",
		platform: "mobile",
		description: "Tampilan antarmuka mobile e-commerce modern dengan banner promosi carousel, grid produk 2 kolom, dan bottom navigation bar.",
		prompt: "Buatkan layout antarmuka mobile aplikasi belanja online e-commerce modern di viewport mobile (375px). Di bagian atas buat search bar produk dengan tombol keranjang belanja dan badge jumlah item. Di bawahnya pasang banner promo slider dengan warna gradien menarik dan countdown flash sale. Tampilkan kategori cepat dalam icon bulat (Elektronik, Fashion, Kuliner, Gadget). Di bawahnya buat grid produk 2 kolom yang menampilkan gambar produk, judul produk 2 baris, rating bintang dan jumlah terjual, harga diskon coret, harga akhir tebal, dan tombol tambah ke keranjang instan (+). Di bagian paling bawah buat fixed bottom navigation bar (Home, Kategori, Favorit, Pesanan, Akun).",
		tags: ["Mobile UI", "E-Commerce", "Product Grid", "Bottom Nav", "Storefront"],
		recommendedTarget: "/design/studio",
	},
	{
		id: "fintech-wallet-ui",
		title: "Fintech Digital Wallet & Transfer Flow UI",
		category: "design",
		icon: "CreditCard",
		platform: "mobile",
		description: "Tampilan dompet digital modern dengan kartu saldo virtual gradien, menu transfer cepat, dan riwayat mutasi bank.",
		prompt: "Rancang antarmuka mobile dompet digital fintech modern premium (375px). Header atas menampilkan sapaan pengguna, avatar foto, dan tombol scan QRIS. Bagian utama adalah kartu saldo virtual bergradien ungu-biru elegan yang menampilkan total saldo rupiah, nomor kartu tersembunyi (**** 4892), dan tombol Top Up, Transfer, Tarik Tunai, serta Minta Uang. Di bawahnya tampilkan deretan icon lingkaran aksi cepat kontak favorit untuk transfer 1-klik. Di bagian bawah sediakan daftar riwayat transaksi terbaru yang dikelompokkan berdasarkan tanggal (Hari Ini, Kemarin), lengkap dengan logo merchant, kategori, dan nominal uang berwarna merah (keluar) atau hijau (masuk).",
		tags: ["Fintech", "Wallet", "Virtual Card", "Transfer Flow", "QRIS"],
		recommendedTarget: "/design/studio",
	},
	{
		id: "ai-coding-canvas-ui",
		title: "AI Coding Assistant & Canvas Split-View UI",
		category: "design",
		icon: "Terminal",
		platform: "web",
		description: "Antarmuka split-screen modern ala coding agent: panel chat instruksi di kiri dan live canvas preview browser di kanan.",
		prompt: "Rancang antarmuka desktop split-view untuk tool AI Coding Assistant (seperti Cursor / Claude Code web). Sebelah kiri (lebar 420px) adalah panel chat agen AI dengan riwayat balon chat, blok perintah terminal bash dengan tombol salin, status eksekusi task bertingkat (checklist animasi), dan textarea input prompt mengambang di bawah. Sebelah kanan adalah live canvas preview interaktif yang memiliki browser mock bar (tombol back, forward, URL address bar localhost:3000, reload), selector ukuran layar (Desktop, Tablet, Mobile), dan toggle inspeksi kode HTML/CSS. Gunakan tema dark obsidian modern dengan aksen indigo.",
		tags: ["AI Agent", "Coding Canvas", "Split-View", "Terminal UI", "DevTool"],
		recommendedTarget: "/design/studio",
	},
	{
		id: "editorial-landing-ui",
		title: "Editorial Typography Product Landing UI",
		category: "design",
		icon: "Sparkles",
		platform: "web",
		description: "Halaman landing page produk premium dengan tipografi editorial berani, grid fitur asimetris, dan testimoni elegan.",
		prompt: "Buatkan halaman landing page produk perangkat lunak bernuansa editorial magazine premium. Gunakan tipografi serif yang berani dan kontras tinggi untuk judul hero display, dipadukan dengan sans-serif geometris untuk teks bodi. Bagian hero memiliki headline puitis yang besar, subtitle deskriptif, dan dua tombol CTA (Primary hitam elegan dan Secondary outline hairline). Di bawahnya tampilkan logo klien monokrom bergaya minimalis. Di bagian fitur, gunakan layout bento asimetris dengan kartu bersudut membulat halus, ikon minimalis, dan visual skematis. Di bagian footer sertakan navigasi tautan multi-kolom dan form pendaftaran newsletter sederhana.",
		tags: ["Landing Page", "Editorial", "Typography", "Bento Grid", "Branding"],
		recommendedTarget: "/design/studio",
	},

	// === 3. BOILERPLATE PROJECTS (FULL SCAFFOLDING & SYSTEM ARCHITECTURE) ===
	{
		id: "simrs-hospital",
		title: "SIMRS Enterprise Hospital System Boilerplate",
		category: "boilerplate",
		icon: "Building2",
		platform: "web",
		description: "Sistem Rumah Sakit Enterprise siap jalan: Rawat Inap, Rawat Jalan, Rekam Medis Elektronik (RME), Farmasi, dan Billing.",
		prompt: "Buatkan blueprint arsitektur dan PRD lengkap untuk Boilerplate SIMRS (Sistem Informasi Manajemen Rumah Sakit) Enterprise berbasis web modern. Arsitektur menggunakan TanStack Start + Drizzle ORM + PostgreSQL. Sistem memiliki 5 modul inti: 1) Pendaftaran & Admisi Pasien (antrean BPJS & Umum), 2) Rawat Jalan & Poliklinik Spesialis, 3) Rawat Inap (Kapasitas Bed, Perawat, Visit Dokter), 4) Rekam Medis Elektronik (RME standar Kemenkes SatuSehat ICD-10 & ICD-9-CM), dan 5) Farmasi & Kasir Billing Terintegrasi. Skema database relasional harus mencakup tabel pasien, dokter, pendaftaran, resep, transaksi pembayaran, dan audit trail medis. Sertakan struktur role-based access control (Admin, Dokter, Perawat, Apoteker, Kasir).",
		tags: ["Boilerplate", "SIMRS", "Healthcare", "TanStack Start", "Drizzle ORM", "PostgreSQL"],
		recommendedTarget: "/plan/new",
		techStack: ["TanStack Start", "Drizzle ORM", "PostgreSQL", "Better Auth", "Tailwind CSS"],
	},
	{
		id: "b2b-saas-starter",
		title: "B2B Multi-Tenant SaaS Starter Boilerplate",
		category: "boilerplate",
		icon: "Layers",
		platform: "web",
		description: "Boilerplate SaaS multi-tenant dengan isolasi data organisasi, RBAC peran tim, billing langganan Midtrans, dan audit log.",
		prompt: "Rancang blueprint arsitektur teknis dan PRD lengkap untuk B2B Multi-Tenant SaaS Starter Boilerplate. Fondasi aplikasi mencakup: 1) Multi-tenancy berbasis Organization/Workspace dengan subdomain unik dan isolasi tenant (WHERE organization_id = ?), 2) Autentikasi tim berbasis Better Auth dengan role Owner, Admin, Member, dan Guest, 3) Sistem perizinan granular (Role-Based Access Control / RBAC) untuk modul data, 4) Integrasi Billing Midtrans recurring payment dengan webhook verifikasi dan portal invoice, 5) Audit log sistem untuk setiap mutasi data sensitif, dan 6) Dashboard analitik tim. Berikan rincian DDL skema Drizzle ORM, DTO, dan middleware authorization.",
		tags: ["Boilerplate", "B2B SaaS", "Multi-Tenant", "RBAC", "Better Auth", "Billing"],
		recommendedTarget: "/plan/new",
		techStack: ["TanStack Start", "Drizzle ORM", "Better Auth", "Midtrans", "PostgreSQL"],
	},
	{
		id: "ecommerce-storefront",
		title: "Full-Stack E-Commerce Storefront Boilerplate",
		category: "boilerplate",
		icon: "ShoppingCart",
		platform: "web",
		description: "Boilerplate toko online modern lengkap: etalase katalog, keranjang belanja Zustand, checkout Midtrans/Stripe, dan panel admin pesanan.",
		prompt: "Susun blueprint spesifikasi arsitektur teknis dan PRD untuk Full-Stack E-Commerce Storefront Boilerplate. Sistem terdiri dari dua sisi aplikasi: 1) Storefront Pelanggan (katalog produk dengan filtering kategori dan harga, search instan, halaman detail produk dengan varian ukuran/warna, keranjang belanja lokal tersinkronisasi, dan formulir checkout alamat pengiriman dengan kalkulasi kurir ongkir), 2) Panel Admin Manajemen Toko (dashboard metrik penjualan harian, manajemen CRUD produk dan stok opname, serta daftar pesanan masuk dengan status update pembayaran dan resi pengiriman). Integrasikan gateway pembayaran Midtrans Snap & QRIS. Sediakan skema Drizzle ORM dan alur webhook pembayaran idempotent.",
		tags: ["Boilerplate", "E-Commerce", "Storefront", "Cart State", "Midtrans", "Order Management"],
		recommendedTarget: "/plan/new",
		techStack: ["TanStack Start", "Drizzle ORM", "Zustand", "Midtrans", "PostgreSQL"],
	},
	{
		id: "ai-agent-workflow",
		title: "AI Agentic Workflow & Canvas Boilerplate",
		category: "boilerplate",
		icon: "Bot",
		platform: "web",
		description: "Boilerplate aplikasi agen AI dengan streaming SSE, memory percakapan, pembagian task bertingkat, dan live canvas preview.",
		prompt: "Buatkan spesifikasi arsitektur teknis dan PRD untuk Boilerplate Aplikasi Agen AI (AI Agentic Workflow Platform). Aplikasi menyediakan kemampuan eksekusi agen AI interaktif: 1) Chat orchestration menggunakan Vercel AI SDK dengan model fallback (Claude, GPT, Gemini), 2) Streaming respon realtime menggunakan Server-Sent Events (SSE) dengan penanganan token error retry, 3) Manajemen state percakapan dan branching session tersimpan di PostgreSQL, 4) Mesin pembagi task bertingkat (Planner -> Executor -> Reviewer) dengan status visual kanban progress, dan 5) Sandboxed live preview canvas untuk menampilkan artefak dokumen (Markdown, HTML, Diagram Mermaid). Jelaskan skema database, arsitektur event stream, dan penanganan rate-limiting kredit.",
		tags: ["Boilerplate", "AI Agent", "Streaming SSE", "Vercel AI SDK", "Canvas Sandbox"],
		recommendedTarget: "/plan/new",
		techStack: ["TanStack Start", "Vercel AI SDK", "Drizzle ORM", "SSE", "PostgreSQL"],
	},
]);

export function getTemplatesByCategory(category: TemplateCategory): readonly VibeTemplateEntry[] {
	return VIBE_TEMPLATES.filter((t) => t.category === category);
}

export function searchTemplates(query: string, category?: TemplateCategory | "all"): readonly VibeTemplateEntry[] {
	const q = query.trim().toLowerCase();
	return VIBE_TEMPLATES.filter((t) => {
		if (category && category !== "all" && t.category !== category) return false;
		if (!q) return true;
		return (
			t.title.toLowerCase().includes(q) ||
			t.description.toLowerCase().includes(q) ||
			t.prompt.toLowerCase().includes(q) ||
			t.tags.some((tag) => tag.toLowerCase().includes(q)) ||
			(t.techStack && t.techStack.some((tech) => tech.toLowerCase().includes(q)))
		);
	});
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/template-gallery.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/template-gallery.ts src/lib/template-gallery.test.ts
git commit -m "feat(templates): implement 3-category prompt directory library with 16 comprehensive entries"
```

---

### Task 2: Interactive Template Catalog Component (`src/components/templates/template-catalog.tsx`)

**Files:**
- Create: `src/components/templates/template-catalog.tsx`
- Create: `src/components/templates/template-catalog.test.tsx`

**Interfaces:**
- Consumes: `VIBE_TEMPLATES`, `searchTemplates`, `useNavigate` from `@tanstack/react-router`, Lucide icons.
- Produces: `<TemplateCatalog />` interactive component featuring:
  - 4 Tab Pills: `Semua`, `Planning`, `Design`, `Boilerplate Projects`.
  - Live Search Filter input with clear button.
  - Template Cards with tags, platform badges, tech stack pills, and action buttons:
    - Primary CTA: "Gunakan di VibePlan" (navigates to `/plan/new?prompt=...`) OR "Buka di Studio UI" (navigates to `/design/studio?prompt=...`).
    - Secondary CTA: "Salin Prompt" (copies to clipboard with visual feedback).

- [ ] **Step 1: Write test for TemplateCatalog interactive component**

```typescript
// src/components/templates/template-catalog.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TemplateCatalog } from "./template-catalog";

describe("TemplateCatalog Component", () => {
	it("renders all category tabs and default templates", () => {
		render(<TemplateCatalog onUseTemplate={() => {}} onCopyPrompt={() => {}} />);
		expect(screen.getByText("Semua")).toBeInTheDocument();
		expect(screen.getByText("Planning")).toBeInTheDocument();
		expect(screen.getByText("Design")).toBeInTheDocument();
		expect(screen.getByText("Boilerplate")).toBeInTheDocument();
		expect(screen.getByPlaceholderText(/Cari template/i)).toBeInTheDocument();
	});

	it("filters cards when category tab is clicked", () => {
		render(<TemplateCatalog onUseTemplate={() => {}} onCopyPrompt={() => {}} />);
		const designTab = screen.getByText("Design");
		fireEvent.click(designTab);

		expect(screen.getByText("Minimalist Dark SaaS Analytics UI")).toBeInTheDocument();
		expect(screen.queryByText("SaaS Analytics & Billing Dashboard")).not.toBeInTheDocument();
	});

	it("filters cards when searching by keyword", () => {
		render(<TemplateCatalog onUseTemplate={() => {}} onCopyPrompt={() => {}} />);
		const searchInput = screen.getByPlaceholderText(/Cari template/i);
		fireEvent.change(searchInput, { target: { value: "SIMRS" } });

		expect(screen.getByText("SIMRS Enterprise Hospital System Boilerplate")).toBeInTheDocument();
		expect(screen.queryByText("Habit Tracker Mobile")).not.toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/templates/template-catalog.test.tsx`
Expected: FAIL (Cannot find module)

- [ ] **Step 3: Implement `src/components/templates/template-catalog.tsx`**

Create `src/components/templates/template-catalog.tsx`:
```tsx
import { useNavigate } from "@tanstack/react-router";
import {
	BarChart3,
	Building2,
	Check,
	Copy,
	CreditCard,
	GraduationCap,
	HeartPulse,
	Layers,
	LayoutDashboard,
	Receipt,
	Search,
	ShoppingBag,
	ShoppingCart,
	Smartphone,
	Sparkles,
	Store,
	Terminal,
	Users,
	Bot,
	ArrowRight,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
	type TemplateCategory,
	type VibeTemplateEntry,
	VIBE_TEMPLATES,
	searchTemplates,
} from "@/lib/template-gallery";

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
	BarChart3,
	Store,
	Smartphone,
	GraduationCap,
	Users,
	Receipt,
	LayoutDashboard,
	HeartPulse,
	ShoppingBag,
	CreditCard,
	Terminal,
	Sparkles,
	Building2,
	Layers,
	ShoppingCart,
	Bot,
};

export function TemplateCatalog({
	onUseTemplate,
	onCopyPrompt,
}: {
	onUseTemplate?: (template: VibeTemplateEntry) => void;
	onCopyPrompt?: (prompt: string) => void;
}) {
	const navigate = useNavigate();
	const [activeCategory, setActiveCategory] = useState<TemplateCategory | "all">("all");
	const [searchQuery, setSearchQuery] = useState("");
	const [copiedId, setCopiedId] = useState<string | null>(null);

	const filteredTemplates = useMemo(() => {
		return searchTemplates(searchQuery, activeCategory);
	}, [searchQuery, activeCategory]);

	const handleCopy = async (id: string, prompt: string) => {
		try {
			await navigator.clipboard.writeText(prompt);
			setCopiedId(id);
			if (onCopyPrompt) onCopyPrompt(prompt);
			setTimeout(() => setCopiedId(null), 2000);
		} catch {
			// fallback
		}
	};

	const handleNavigate = (template: VibeTemplateEntry) => {
		if (onUseTemplate) {
			onUseTemplate(template);
			return;
		}
		if (template.recommendedTarget === "/design/studio") {
			navigate({
				to: "/design/studio",
				search: { prompt: template.prompt },
			});
		} else {
			navigate({
				to: "/plan/new",
				search: {
					prompt: template.prompt,
					platform: template.platform,
				},
			});
		}
	};

	return (
		<div className="flex w-full flex-col gap-8">
			{/* Controls Toolbar: Categories and Search Bar */}
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				{/* Category Tabs */}
				<div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-graphite bg-charcoal p-1.5">
					{(
						[
							{ key: "all", label: "Semua" },
							{ key: "planning", label: "Planning" },
							{ key: "design", label: "Design" },
							{ key: "boilerplate", label: "Boilerplate" },
						] as const
					).map((tab) => (
						<button
							key={tab.key}
							type="button"
							onClick={() => setActiveCategory(tab.key)}
							className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition ${
								activeCategory === tab.key
									? "bg-obsidian text-snow shadow-sm"
									: "text-fog hover:text-snow"
							}`}
						>
							{tab.label}
						</button>
					))}
				</div>

				{/* Search Filter */}
				<div className="relative w-full sm:w-72">
					<Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fog" />
					<input
						type="text"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						placeholder="Cari template, tag, atau tech..."
						className="h-9.5 w-full rounded-xl border border-graphite bg-charcoal pl-9.5 pr-4 text-xs text-snow placeholder:text-fog focus:border-steel focus:outline-none"
					/>
				</div>
			</div>

			{/* Template Cards Grid */}
			{filteredTemplates.length === 0 ? (
				<div className="rounded-2xl border border-graphite bg-charcoal/50 p-12 text-center">
					<p className="text-sm text-fog">Tidak ada template yang cocok dengan pencarian kamu.</p>
				</div>
			) : (
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					{filteredTemplates.map((template) => {
						const IconComponent = ICON_MAP[template.icon] ?? Sparkles;
						const isCopied = copiedId === template.id;

						return (
							<div
								key={template.id}
								className="group flex flex-col justify-between rounded-2xl border border-graphite bg-charcoal p-6 transition-colors hover:border-steel"
							>
								<div className="flex flex-col gap-4">
									{/* Top Metadata Header */}
									<div className="flex items-start justify-between gap-3">
										<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-graphite bg-obsidian text-snow">
											<IconComponent size={20} />
										</div>
										<div className="flex flex-wrap items-center gap-1.5">
											<span className="rounded-full border border-graphite bg-obsidian px-2.5 py-0.5 text-[10px] font-medium capitalize text-mist">
												{template.category}
											</span>
											<span className="rounded-full border border-graphite bg-obsidian px-2.5 py-0.5 text-[10px] font-medium capitalize text-fog">
												{template.platform}
											</span>
										</div>
									</div>

									{/* Title & Description */}
									<div>
										<h3 className="text-base font-semibold text-snow group-hover:text-mist transition-colors">
											{template.title}
										</h3>
										<p className="mt-2 line-clamp-3 text-xs leading-relaxed text-fog">
											{template.description}
										</p>
									</div>

									{/* Tech Stack Pills (if boilerplate) */}
									{template.techStack && (
										<div className="flex flex-wrap gap-1 pt-1">
											{template.techStack.map((tech) => (
												<span
													key={tech}
													className="rounded border border-graphite/60 bg-onyx/50 px-2 py-0.5 text-[10px] text-mist"
												>
													{tech}
												</span>
											))}
										</div>
									)}

									{/* Tag Pills */}
									<div className="flex flex-wrap gap-1.5 pt-1">
										{template.tags.slice(0, 3).map((tag) => (
											<span key={tag} className="text-[11px] text-fog/80">
												#{tag}
											</span>
										))}
									</div>
								</div>

								{/* Action Buttons */}
								<div className="mt-6 flex items-center gap-2 border-t border-graphite/40 pt-4">
									<button
										type="button"
										onClick={() => handleNavigate(template)}
										className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-graphite bg-obsidian px-3 py-2 text-xs font-semibold text-snow hover:border-steel hover:bg-white/5 transition"
									>
										<span>{template.category === "design" ? "Rancang di Studio" : "Gunakan di VibePlan"}</span>
										<ArrowRight size={14} />
									</button>
									<button
										type="button"
										title="Salin Prompt"
										onClick={() => handleCopy(template.id, template.prompt)}
										className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-xl border border-graphite bg-obsidian text-fog hover:border-steel hover:text-snow transition"
									>
										{isCopied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
									</button>
								</div>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/components/templates/template-catalog.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/templates/template-catalog.tsx src/components/templates/template-catalog.test.tsx
git commit -m "feat(templates): implement interactive TemplateCatalog with search, filters, and actions"
```

---

### Task 3: Replace `/templates` Placeholder & Connect URL Search Prefill to `/plan/new` and `/design/studio`

**Files:**
- Modify: `src/routes/templates.tsx`
- Modify: `src/routes/plan/new.tsx`
- Modify: `src/routes/design/studio.index.tsx`
- Create: `src/routes/templates.test.tsx`

**Interfaces:**
- Consumes: `TemplateCatalog`, TanStack Router search params validation (`zod`).
- Produces: 
  - Working `/templates` page rendering the catalog.
  - `/plan/new?prompt=...&platform=...` prefilling the prompt textarea.
  - `/design/studio?prompt=...` prefilling the studio input.

- [ ] **Step 1: Write test for `/templates` route integration**

```typescript
// src/routes/templates.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TemplatesRouteView } from "./templates";

describe("Templates Route View", () => {
	it("renders heading and the full template catalog", () => {
		render(<TemplatesRouteView />);
		expect(screen.getByText("Katalog Template Proyek")).toBeInTheDocument();
		expect(screen.getByText("Semua")).toBeInTheDocument();
		expect(screen.getByText("SIMRS Enterprise Hospital System Boilerplate")).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/routes/templates.test.tsx`
Expected: FAIL

- [ ] **Step 3: Update `src/routes/templates.tsx`, `/plan/new.tsx`, and `/design/studio.index.tsx`**

1. In `src/routes/templates.tsx`:
   Replace the placeholder code with:
   ```tsx
   import { createFileRoute } from "@tanstack/react-router";
   import { HubBreadcrumb } from "@/components/home/hub-breadcrumb";
   import { TemplateCatalog } from "@/components/templates/template-catalog";

   export const Route = createFileRoute("/templates")({
     head: () => ({
       meta: [
         { title: "VibeTemplate | VibeEverything" },
         {
           name: "description",
           content:
             "Katalog prompt profesional untuk Planning, Visual UI Design, dan Boilerplate Proyek VibeEverything.",
         },
       ],
     }),
     component: TemplatesRouteView,
   });

   export function TemplatesRouteView() {
     return (
       <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
         <HubBreadcrumb current="VibeTemplate" />

         <header className="mx-auto max-w-2xl text-center">
           <h1 className="text-3xl font-semibold tracking-tight text-snow sm:text-4xl">
             Katalog Template Proyek
           </h1>
           <p className="mt-3 text-sm leading-6 text-fog">
             Pilih blueprint siap pakai untuk memulai perencanaan PRD, mendesain antarmuka di UI Studio, atau menginisiasi proyek enterprise.
           </p>
         </header>

         <TemplateCatalog />
       </main>
     );
   }
   ```
2. In `src/routes/plan/new.tsx`:
   Validate search parameters using Zod:
   ```tsx
   import { z } from "zod";

   const planNewSearchSchema = z.object({
     prompt: z.string().optional(),
     platform: z.enum(["web", "mobile"]).optional(),
   });

   export const Route = createFileRoute("/plan/new")({
     validateSearch: (search) => planNewSearchSchema.parse(search),
     component: PlanNewPage,
   });
   ```
   Pass `search.prompt` and `search.platform` into `HeroContent` initial value props.
3. In `src/routes/design/studio.index.tsx`:
   Validate search parameters using Zod:
   ```tsx
   import { z } from "zod";

   const studioSearchSchema = z.object({
     prompt: z.string().optional(),
   });

   export const Route = createFileRoute("/design/studio/")({
     validateSearch: (search) => studioSearchSchema.parse(search),
     component: StudioIndexPage,
   });
   ```
   Prefill the prompt textarea with `search.prompt` if provided.
4. Run route generation: `pnpm generate-routes`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/routes/templates.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/templates.tsx src/routes/plan/new.tsx src/routes/design/studio.index.tsx src/routes/templates.test.tsx src/routeTree.gen.ts
git commit -m "feat(templates): launch full template catalog route and URL search param prefill wiring"
```

---

### Task 4: Comprehensive VibeBantuan Hub (`src/routes/bantuan.tsx`) with FAQs & Guides

**Files:**
- Create: `src/components/bantuan/faq-accordion.tsx`
- Create: `src/components/bantuan/workflow-guides.tsx`
- Modify: `src/routes/bantuan.tsx`
- Test: `src/routes/-bantuan.test.tsx`

**Interfaces:**
- Consumes: Accordion primitives, Lucide icons, existing feedback form link.
- Produces: Enhanced `/bantuan` route featuring interactive Workflow Guides, real product FAQs across all Vibe modules, direct feedback ticketing access, and billing management.

- [ ] **Step 1: Write test for VibeBantuan FAQs and Guides**

```typescript
// src/routes/-bantuan.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BantuanPage } from "./bantuan";

describe("BantuanPage Hub", () => {
	it("renders workflow guides, FAQs, and feedback links", () => {
		render(<BantuanPage />);
		expect(screen.getByText("Pusat Bantuan")).toBeInTheDocument();
		expect(screen.getByText(/Panduan Alur Kerja/i)).toBeInTheDocument();
		expect(screen.getByText(/Pertanyaan Umum \(FAQ\)/i)).toBeInTheDocument();
		expect(screen.getByText(/Feedback & Bug Report/i)).toBeInTheDocument();
	});

	it("expands FAQ answer when question accordion is clicked", () => {
		render(<BantuanPage />);
		const question = screen.getByText(/Bagaimana cara kerja VibeDesign Scrap/i);
		fireEvent.click(question);

		expect(screen.getByText(/menghasilkan 2 file langsung: index.html dan design.md/i)).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/routes/-bantuan.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement `faq-accordion.tsx`, `workflow-guides.tsx`, and update `bantuan.tsx`**

1. Create `src/components/bantuan/workflow-guides.tsx`:
   Show 3 distinct quick guides:
   - **1. VibePlan Workflow:** Dari prompt ide mentah $\rightarrow$ PRD profesional $\rightarrow$ Acceptance Criteria $\rightarrow$ Kanban Board.
   - **2. VibeDesign Scrap Workflow:** Input URL live $\rightarrow$ Server fetching & asset proxying $\rightarrow$ Generate 2-file (`index.html` + `design.md`) $\rightarrow$ Unduh ZIP.
   - **3. VibeEverything CLI Workflow:** Terminal `vibeeverything login` $\rightarrow$ `vibeeverything codebase sync` $\rightarrow$ Analisis sinkronisasi otomatis.
2. Create `src/components/bantuan/faq-accordion.tsx`:
   Provide 6 realistic FAQs:
   - *Apa perbedaan VibePlan Greenfield dan Codebase Existing?*
   - *Bagaimana cara kerja VibeDesign Scrap?* (Jelaskan output 2 file: `index.html` dan `design.md`).
   - *Apa itu Prompt UI Studio di VibeDesign?* (Jelaskan sandboxed iframe canvas responsif).
   - *Bagaimana cara menghubungkan repository lokal lewat CLI?*
   - *Bagaimana perhitungan kredit dan top-up?*
   - *Bagaimana cara mengirim laporan bug atau meminta fitur baru?*
3. In `src/routes/bantuan.tsx`:
   Integrate `<WorkflowGuides />`, `<FaqAccordion />`, links to `/settings/feedback`, and admin triage.
4. Run route generation: `pnpm generate-routes`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/routes/-bantuan.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/bantuan/ src/routes/bantuan.tsx src/routes/-bantuan.test.tsx src/routeTree.gen.ts
git commit -m "feat(bantuan): enhance help hub with interactive workflow guides and comprehensive FAQs"
```

---

### Task 5: Route Tree Sync & Full Verification for Phase 3

**Files:**
- Modify: `src/routeTree.gen.ts` (regenerated)

- [ ] **Step 1: Regenerate route tree**

Run: `pnpm generate-routes`
Expected: Clean generation with validated search params on `/plan/new`, `/design/studio`, and `/templates`.

- [ ] **Step 2: Run full TypeScript check**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Run linter and formatting check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 4: Run all unit & integration tests across the entire workspace**

Run: `pnpm test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/routeTree.gen.ts
git commit -m "chore: synchronize route tree and verify phase 3 templates and bantuan"
```
