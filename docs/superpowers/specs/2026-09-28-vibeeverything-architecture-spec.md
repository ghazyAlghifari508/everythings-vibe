# VibeEverything Architecture Specification

> **Status:** APPROVED & BULLETPROOFED FOR IMPLEMENTATION  
> **Date:** 2026-09-28  
> **Target Version:** VibeEverything 3.0.0 (Rebrand dari PRDFY)  
> **Workspace:** `C:\Coding\Web Development\Tanstack-start\prdfy`  
> **Referensi Logic 1 (Docrivo):** `C:\Coding\Web Development\Next\docrivo`  
> **Referensi Logic 2 (OpenDesign):** `https://github.com/nexu-io/open-design`  
> **Visual UI Blueprint:** `prototype-vibe-hub.html`  

---

## 1. Product Overview & Architecture Philosophy

VibeEverything adalah workspace all-in-one untuk AI vibe-coding yang mengintegrasikan seluruh tahapan konsepsi produk:
1. **VibePlan** — Perencanaan PRD & Task breakdown dari nol (*Greenfield*) maupun dari repo yang sudah ada (*Codebase Existing* via CLI sync).
   - *Penting:* Modul Codebase Existing memanfaatkan engine yang sudah ada di `src/routes/codebases/` tanpa membuat sistem baru dari nol.
2. **VibeDesign** — Pembuatan konteks visual dan antarmuka UI:
   - **Opsi 1: Scrap HTML & DESIGN.md (Porting & Adaptasi Docrivo):** Mengambil algoritma scraping, preview cleaner, dan prompt `DESIGN.md` dari `C:\Coding\Web Development\Next\docrivo`, lalu menyesuaikannya secara modular ke stack VibeEverything agar Docrivo dipensiunkan. Menghasilkan 2 file: `index.html` (preview desktop 1440px berskala) dan `design.md` (token visual, komponen, do's/don'ts). Dilengkapi dengan endpoint asset proxy (`/api/scrape/asset`) agar resource eksternal tidak terblokir CORS/CSP.
   - **Opsi 2: Prompt UI Studio (Adaptasi OpenDesign):** Mengambil pola prompt generator dan arsitektur sandboxed iframe runtime dari `https://github.com/nexu-io/open-design` untuk generate antarmuka web instan berbasis Tailwind CSS & Lucide icons dengan parser pembersih markdown codeblock (`extractCleanHtml`).
3. **VibeTemplate** — Katalog prompt 3 kategori: *Planning*, *Design*, dan *Boilerplate Projects* (SIMRS Hospital App, B2B SaaS, E-Commerce).
4. **VibeBantuan** — Tiket support & form feedback terintegrasi admin.

---

## 2. Source Code Integration Strategy (PORTING & ADAPTASI, BUKAN COPY-PASTE BUTA)

### 2.1. Porting & Adaptasi Docrivo (`C:\Coding\Web Development\Next\docrivo`)
Docrivo dijadikan referensi kode kerja yang matang. Agent **wajib mengadaptasi** kode tersebut agar sesuai dengan arsitektur VibeEverything:
- **Scraper & Cleaner Core (`src/lib/fetch-html.ts`, `src/lib/preview-html.ts`):**
  Ambil fungsi fetching, sanitasi tag script berbahaya, dan konversi link relatif ke URL absolut. Sesuaikan path import (`@/*`) dan error handling menggunakan standar VibeEverything.
- **Asset Proxy Endpoint (`src/routes/api/scrape.asset.ts`):**
  Porting handler `GET /api/scrape/asset` dari Docrivo (`src/routes/api/scrape.asset.ts`) agar aset CSS, font, dan gambar pada preview sandboxed iframe tidak terblokir CORS atau CSP browser.
- **System Prompt DESIGN.md (`src/lib/prompts-design-md.ts`):**
  Ambil template prompt 12.000+ karakter dari Docrivo (`src/lib/ai-provider.ts`). Hubungkan ke AI streaming orchestrator VibeEverything (`@/lib/services/ai-orchestrator.ts`).
- **Autentikasi & Database Layer:**
  JANGAN gunakan helper sesi Docrivo. Gunakan helper autentikasi VibeEverything (`@/lib/session` $\rightarrow$ `requireUserServer()`) dan database client Drizzle (`@/db` $\rightarrow$ `db`).
- **Komponen UI (`src/components/design/`):**
  Adaptasi komponen `html-scraper.tsx` dan `scrape-detail.tsx` dari Docrivo agar memakai styling Tailwind VibeEverything, hairline 1px borders, serta output langsung 2 file (`index.html` + `design.md`) dengan tombol salin dan download ZIP.

### 2.2. Adaptasi Pola OpenDesign (`https://github.com/nexu-io/open-design`)
OpenDesign dijadikan acuan pola untuk Prompt UI Studio. Agent **mengadaptasi logikanya ke dalam komponen React/TanStack Start**:
1. **Prompt Generator Antarmuka:** Ambil aturan prompt OpenDesign yang menuntut output single-file HTML lengkap, script Tailwind CDN (`<script src="https://cdn.tailwindcss.com"></script>`), font modern, dan dummy data realistis.
2. **Parser Pembersih Markdown (`src/lib/clean-html.ts`):** Helper fungsi `extractCleanHtml(raw: string)` wajib digunakan untuk mengekstrak isi tag ````html ... ```` agar iframe me-render web interaktif, bukan plain text markdown.
3. **Sandboxed Iframe Canvas Runtime:** Ambil arsitektur rendering runtime OpenDesign: komponen canvas yang merender HTML ke `<iframe srcdoc={...} sandbox="allow-scripts" />` dengan pengatur lebar viewport (1440px Desktop, 768px Tablet, 375px Mobile).
4. **Code Inspection Panel:** Ambil pola ekstraksi kode HTML dengan copy-to-clipboard instan dan tab toggle Preview vs Code.

### 2.3. Acuan Antarmuka & Drawer Lazy Fetch
- Seluruh struktur layout, style Tailwind, hairline 1px borders, transisi warna, dan drawer riwayat mengacu langsung ke file:
  [`prototype-vibe-hub.html`](file:///C:/Coding/Web%20Development/Tanstack-start/prdfy/prototype-vibe-hub.html)
- **Lazy Fetch History Drawer:** HistoryDrawer dipasang di root navbar namun data riwayat **HANYA di-fetch on-demand saat drawer dibuka** (`enabled: isOpen` via TanStack Query) agar tidak membebani database di setiap pergantian halaman.

---

## 3. Topologi Navigasi & Route

```
/ (Homepage Bento Hub: VibePlan, VibeDesign, VibeTemplate, VibeBantuan)
├── /plan (Pilihan Opsi Perencanaan)
│   ├── /plan/new (Greenfield PRD Chat & Generator - Migrasi dari Hero lama)
│   └── /plan/codebase (Codebase Existing - Membungkus/Mengarahkan ke /codebases)
├── /design (Pilihan Opsi Desain)
│   ├── /design/scrap (Opsi 1: URL Scraper & Riwayat)
│   │   └── /design/scrap/$id (Detail 2 File: index.html 1440px desktop preview + design.md)
│   └── /design/studio (Opsi 2: Prompt UI Studio Input)
│       └── /design/studio/$id (Canvas Iframe Sandbox Runtime + Chat Revision)
├── /templates (Katalog Prompt: Planning, Design, Boilerplate)
├── /pricing (Halaman Paket & Topup Kredit)
├── /history (Arsip Riwayat Lengkap)
├── /bantuan (Halaman Support & Form Feedback)
└── /api
    └── /api/scrape/asset (Proxy aset gambar/CSS preview scrap)
```

> **Aturan Wajib Route Generation:** Setiap kali file di dalam `src/routes/` ditambah atau diubah, jalankan `pnpm generate-routes` agar `src/routeTree.gen.ts` selalu sinkron dan lulus typecheck.

---

## 4. Skema Database (Drizzle ORM) — SESUAI DENGAN TIPE TEXT VIBEEVERYTHING

> **PERINGATAN TIPE DATA (CRITICAL):**  
> Di VibeEverything (`src/db/schema.ts`), tabel `users.id` bertipe **`text("id")`** karena Better Auth.  
> Seluruh kolom `id` dan foreign key `user_id` WAJIB bertipe **`text`**, DILARANG menggunakan `uuid`!

```typescript
// src/db/schema.ts
import { sql } from "drizzle-orm";
import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./schema";

// 1. Scrapes (Porting & Adaptasi dari Docrivo)
export const scrapes = pgTable("scrapes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  sourceUrl: text("source_url").notNull(),
  domain: text("domain").notNull(),
  title: text("title"),
  status: text("status", { enum: ["queued", "processing", "completed", "failed"] })
    .notNull()
    .default("queued"),
  html: text("html"),
  previewHtml: text("preview_html"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const scrapeDocuments = pgTable("scrape_documents", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  scrapeId: text("scrape_id")
    .notNull()
    .references(() => scrapes.id, { onDelete: "cascade" }),
  designMd: text("design_md").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// 2. Studio Projects (Adaptasi Pola OpenDesign)
export const studioProjects = pgTable("studio_projects", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const studioRevisions = pgTable("studio_revisions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text("project_id")
    .notNull()
    .references(() => studioProjects.id, { onDelete: "cascade" }),
  prompt: text("prompt").notNull(),
  htmlCode: text("html_code").notNull(),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```

---

## 5. Rebranding CLI (`packages/cli`) & Sinkronisasi String Web App

1. **CLI Package:**
   - Package name: `@ghazynabiel/vibeeverything`
   - Executable binary: `vibeeverything` (dengan alias `prdfy` untuk backward compatibility).
   - Banner terminal, help output, dan dokumentasi README diperbarui ke **VibeEverything CLI**.
2. **Sinkronisasi Teks Web App (`src/lib/codebase-sync.ts`):**
   - Generator perintah terminal di `src/lib/codebase-sync.ts` dan test-nya diperbarui dari `prdfy codebase sync ...` menjadi `vibeeverything codebase sync ...`.
