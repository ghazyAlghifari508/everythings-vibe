# design-layout-consistency.md — Enforceable Design Consistency & Layout Architecture

> **Status: MANDATORY EXECUTION CONTRACT**  
> Repositori: **everythings-vibe**  
> Seluruh agen AI dan pengembang yang merancang, mengubah, atau me-refactor antarmuka pengguna (UI/UX) di repositori ini **WAJIB** mematuhi aturan arsitektur tata letak, klasifikasi keluarga halaman (*page family*), inspeksi referensi visual, dan pencegahan inkonsistensi layout di bawah ini tanpa pengecualian.

---

## 1. Prinsip Utama: Konsistensi Desain Tanpa Jebakan Satu-Ukuran-Untuk-Semua

Masalah berulang yang dihasilkan oleh agen AI adalah inkonsistensi tata letak: halaman-halaman yang berada dalam satu keluarga fungsional memiliki lebar kontainer (*container width*) yang acak-acakan, ukuran heading yang berubah-ubah, padding semrawut, struktur kartu yang berbeda-beda, dan navigasi yang saling bertabrakan.

Solusinya **BUKAN** memaksa seluruh layar ke dalam satu template yang kaku dan seragam. Solusinya adalah **menetapkan kontrak desain yang konsisten per keluarga halaman (*page family*)** dengan batas pengecualian yang jelas untuk antarmuka yang secara fungsional memang berbeda (seperti kanvas Studio vs halaman FAQ).

Konsistensi berarti:
1. Pengguna merasakan satu sistem produk yang koheren, berkarakter *developer-grade*, dan profesional.
2. Perbedaan konten diperbolehkan; perbedaan struktur tata letak yang acak dan tanpa alasan **DILARANG KERAS**.

---

## 2. Bagian A: Klasifikasi Keluarga Halaman (*Page Family Classification*)

Sebelum mengimplementasikan atau mengubah halaman apa pun, agen **WAJIB** mengidentifikasi dan mengklasifikasikan halaman tersebut ke dalam salah satu dari 5 keluarga desain resmi:

| Keluarga Halaman | Anggota Halaman di everythings-vibe | Karakter Tata Letak & Shell |
| :--- | :--- | :--- |
| **1. Public Information** | `/pricing`, `/faq`, `/bantuan`, `/about`, `/templates` | Menggunakan global `Navbar` standar (`pt-14`). Kontainer terpusat (`mx-auto`). Prose dan FAQ: `max-w-3xl` / `max-w-4xl`; katalog dan pricing: `max-w-6xl` / `max-w-[1200px]`. Padding konsisten `px-4 py-10 sm:px-6 sm:py-14`. |
| **2. Account Settings** | `/settings/profile`, `/settings/account`, `/settings/api-keys`, `/settings/notifications`, `/settings/billing`, `/settings/feedback` | Global `Navbar` **DISEMBUNYIKAN**. Shell mandiri `SettingsClient`: desktop memiliki sidebar kiri tetap (`md:fixed md:w-64 border-r border-graphite bg-charcoal`), mobile memiliki tab navigasi horizontal atas (`overflow-x-auto hide-scrollbar`). Konten utama: `md:ml-64 p-4 sm:p-8 lg:p-12 w-full max-w-[100vw] overflow-x-hidden`. Kartu konten: `w-full rounded-xl border border-[var(--border-subtle)] p-6 bg-[var(--bg-elevated)]`. |
| **3. Product Workspace** | Studio (`/design`, `/design/$id`), VibeScrape (`/scrape`, `/scrape/$id`, `/scrape/history`), VibePlan Greenfield (`/ask/$id`, `/fitur/$id`, `/prd/$id`, `/ac/$id`, `/task/$id`, `/kanban/$id`), Existing Codebase (`/codebases/*`, `/plan/codebase`) | Mengambil alih viewport penuh (`h-dvh flex flex-col overflow-hidden`). Scroll body dikunci (`body { overflow: hidden }`). Memiliki toolbar/header kontekstual sendiri (bukan navbar global). Studio: floating header + canvas + floating prompt composer; VibePlan: `FlowStepNav` linier; Codebases: multi-pane explorer + chat. |
| **4. Administrative Interface** | `/admin`, `/admin/users`, `/admin/feedback`, `/admin/projects`, `/admin/transactions` | Global `Navbar` **DISEMBUNYIKAN**. Shell mandiri `AdminClient`: single sticky header row `h-14` kohesif (label kompak "Admin", tab horizontal navigasi: Ringkasan, Pengguna, Tiket, Proyek, Transaksi, dan ThemeToggle). Tanpa Streamer Mode. Kontainer utama: `mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8`. Tabel data responsif dan kartu metrik. |
| **5. Shared UI Primitives** | Tombol, input formulir, dialog modal, dropdown menu, toast, status chip, kartu dasar (`src/components/ui/*`) | Primitives murni tanpa logika bisnis domain. Mengikuti token visual `src/app/globals.css`. Digunakan seragam oleh seluruh keluarga halaman tanpa duplikasi. |

---

## 3. Bagian B: Inspeksi Referensi Desain Wajib (*Mandatory Design Reference Inspection*)

Agen **DILARANG KERAS** langsung menulis JSX atau CSS baru tanpa melakukan inspeksi terhadap shell induk dan halaman saudara (*sibling pages*).

### Protokol 5 Langkah Sebelum Mengetik Kode UI:
1. **Baca Shell Induk:** Periksa `src/components/layout/app-layout.tsx` atau shell pembungkus fitur terkait untuk memahami perilaku global navbar, padding top (`pt-14`), lock scroll, dan batas viewport.
2. **Inspeksi Halaman Saudara (*Sibling Page*):** Buka minimal satu file rute yang berada dalam keluarga yang sama.
   - Contoh: Jika membuat/mengubah `/bantuan`, baca `src/components/faq/faq.tsx` atau `src/routes/templates.tsx`.
   - Contoh: Jika membuat tab baru di Settings, baca `src/routes/settings/profile.tsx` dan `src/features/auth-settings/components/settings/settings-client.tsx`.
   - Contoh: Jika mengubah rute admin, baca `src/routes/admin/users.tsx` dan `src/features/admin/components/admin-client.tsx`.
3. **Identifikasi Token & Komponen yang Sudah Ada:** Cari tahu kelas Tailwind apa yang dipakai saudara untuk container width, heading typography, border color, dan background.
4. **Cek Hierarki & Spacing:** Cocokkan ukuran font heading, line-height, margin bawah header, gap antar section, dan padding kartu.
5. **Gunakan Kembali Pola yang Ada:** Jangan pernah menciptakan shell baru atau kombinasi kelas baru hanya karena terasa "lebih cepat". Setiap deviasi tata letak wajib memiliki alasan fungsional yang diverifikasi.

---

## 4. Bagian C: Kontrak Tata Letak per Keluarga Halaman (*Layout Contracts*)

### 1. Kontrak Public Information (`/pricing`, `/faq`, `/bantuan`, `/templates`)
- **Container Strategy:**
  - Halaman berbasis konten baca/tanya-jawab (FAQ, Bantuan): `mx-auto w-full max-w-3xl` atau `max-w-4xl`.
  - Halaman berbasis kartu katalog/pricing: `mx-auto w-full max-w-6xl` atau `max-w-[1200px]`.
- **Header Alignment & Hierarchy:**
  - FAQ / Bantuan / Templates: Heading kiri atau tengah terpusat proporsional.
  - Judul: `text-2xl sm:text-3xl` font `font-[620]` atau `text-3xl sm:text-4xl` font `font-semibold` tracking `tracking-tight text-snow`.
  - Deskripsi/Subjudul: `mt-2.5 sm:mt-3 text-sm sm:text-base leading-relaxed text-fog`.
  - Section Heading: `font-mono text-xs uppercase tracking-widest text-fog` atau `text-lg font-semibold text-snow`.
- **Spacing Scale:**
  - Page wrapper: `px-4 py-10 sm:px-6 sm:py-14 lg:py-16`.
  - Gap antar seksi utama: `gap-8` sampai `gap-12`.
- **Cards & Borders:**
  - Kartu: `rounded-xl border border-graphite bg-charcoal` atau `bg-obsidian`.
  - Divider antar item: `divide-y divide-graphite/60`.

### 2. Kontrak Account Settings (`/settings/*`)
- **Shell Structure:**
  - Sidebar desktop: lebar fixed `w-64`, posisi `md:fixed md:bottom-0 left-0 top-0 border-r border-graphite bg-charcoal`.
  - Sidebar mobile: horizontal swipe navigation di atas layar dengan `overflow-x-auto hide-scrollbar`.
  - Konten utama: `flex-1 md:ml-64 p-4 sm:p-8 lg:p-12 w-full max-w-[100vw] overflow-x-hidden`.
- **Content Panels:**
  - Kontainer form/panel: `w-full rounded-xl border border-[var(--border-subtle)] p-6 bg-[var(--bg-elevated)]`.
  - Judul panel: `mb-6 font-inter font-[510] text-xl font-bold text-[var(--text-primary)]`.
- **Action Placement:**
  - Tombol submit/simpan: Berada di pojok kanan bawah form atau di baris aksi yang jelas, menggunakan primitive `Button` varian `default` (primary).

### 3. Kontrak Product Workspace (Studio, Scrape, VibePlan, Existing Codebase)
- **Viewport Strategy:**
  - Full-screen fluid layout: `h-dvh flex flex-col overflow-hidden bg-charcoal text-snow`.
  - Body scroll terkunci (`document.body.style.overflow = "hidden"` dikelola oleh `AppLayout`).
- **Navigasi Kontekstual:**
  - Workspace memiliki header/toolbar khusus sesuai perannya:
    - Studio: `StudioHeader` melayang di atas kanvas dengan zoom, frame tools, dan dialog styling.
    - Greenfield Plan: `FlowStepNav` menampilkan progres tahapan linier (`Ask -> Fitur -> PRD -> AC -> Task -> Kanban`).
    - Existing Codebase: Toolbar sinkronisasi snapshot + multi-pane sidebar explorer.
    - VibeScrape: Mode switcher ekstraksi URL (`ScrapModeSwitcher`) dengan detail inspeksi hasil (`ScrapeDetailView`).
- **Pengecualian yang Sah (*Justified Exceptions*):**
  - Studio membutuhkan kanvas tanpa batas (*infinite/pan canvas*) dan panel composer melayang (*floating composer*).
  - VibePlan PRD membutuhkan dual-panel (dokumen di kiri + obrolan revisi di kanan) dengan fallback tabbed view di mobile (`< 1024px`).

### 4. Kontrak Administrative Interface (`/admin/*`)
- **Header Structure:**
  - Single sticky top navbar kohesif 1 baris (`h-14 items-center justify-between border-b border-graphite/60 bg-charcoal/95 backdrop-blur-sm px-4 sm:px-6 lg:px-8`).
  - Berisi label kompak "Admin", satu `nav` landmark dengan navigasi horizontal terintegrasi (`overflow-x-auto hide-scrollbar`), dan ThemeToggle. Tanpa Streamer Mode toggle, tanpa link Keluar ekstra, dan tanpa logo global ganda.
- **Container Strategy:**
  - Konten halaman: `mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8`.
- **Data Tables & Metrics:**
  - Grid kartu metrik: `grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4`.
  - Tabel: Tabel data terstruktur dengan header `bg-charcoal text-snow font-inter text-xs font-[510]` dan baris `divide-y divide-graphite bg-obsidian`, dengan card list fallback pada mobile.

---

## 5. Bagian D: Aturan Tata Kelola Breadcrumb (*Breadcrumb Governance*)

Breadcrumb adalah alat navigasi hierarkis kontekstual, **BUKAN dekorasi wajib yang boleh ditempelkan di setiap halaman secara serampangan**.

### Keputusan Produk Resmi:
1. **`/bantuan`:** **TIDAK MENGGUNAKAN BREADCRUMB.** Halaman pusat bantuan berada langsung di bawah navigasi utama dan tidak memerlukan rantai navigasi `Home > Bantuan`.
2. **`/faq`:** **TIDAK MENGGUNAKAN BREADCRUMB.** Konten tanya-jawab langsung fokus pada topik pembahasan.
3. **`/settings/*`:** **TIDAK MENGGUNAKAN BREADCRUMB.** Navigasi settings sudah sepenuhnya diakomodasi oleh sidebar kiri `SettingsClient` dan link "Kembali" ke Home.
4. **`/scrape`:** Menggunakan breadcrumb `Home > VibeScrape` melalui komponen `HubBreadcrumb`.
5. **Full-screen Workspaces (Studio, Greenfield PRD, Codebase):** Mengikuti kontrak navigasi mandirinya masing-masing (tidak menggunakan `HubBreadcrumb` standar).
6. **DILARANG:** Menambahkan `HubBreadcrumb` ke halaman baru secara otomatis tanpa instruksi spesifikasi yang jelas.

---

## 6. Bagian E: Prioritaskan Penggunaan Ulang Komponen (*Component Reuse First*)

Sebelum membuat file komponen baru atau menulis ulang styling elemen umum:

1. **Cari Primitives Bersama di `src/components/ui/`:**
   - Tombol $\rightarrow$ `src/components/ui/button.tsx` (`Button`, varian `default`, `outline`, `secondary`, `ghost`, `destructive`).
   - Kartu $\rightarrow$ `src/components/ui/card.tsx` (`Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`).
   - Dialog/Modal $\rightarrow$ `src/components/ui/dialog.tsx`.
   - Dropdown Menu $\rightarrow$ `src/components/ui/dropdown-menu.tsx`.
   - Ikon $\rightarrow$ `src/components/ui/icon.tsx` (`Icon` wrapping Hugeicons).
   - Input $\rightarrow$ `src/components/ui/input.tsx`.
   - Theme Toggle $\rightarrow$ `src/components/ui/theme-toggle.tsx`.
2. **Periksa Komponen Domain di `src/features/<feature>/components/`:**
   - Jangan menulis ulang tabel pricing jika sudah ada `PricingComponent`.
   - Jangan menulis ulang panel scraper jika sudah ada `ScrapeWorkspaceView`.
3. **Hindari Komponen Duplikat:**
   - Dilarang membuat `CustomButton`, `MyCard`, `PageContainer`, atau wrapper modal baru jika kebutuhan dapat dipenuhi dengan komposisi atau varian dari primitive yang sudah ada.
4. **Justifikasi Komponen Baru:**
   - Buat komponen kustom HANYA JIKA primitive yang ada secara fundamental tidak mendukung interaksi yang dibutuhkan (misal: kanvas diagram zoom/pan, visualizer AST). Catat alasannya dalam commit.

---

## 7. Bagian F: Anti-Slop Struktural (Melampaui Larangan Dekorasi Semata)

Aturan anti-slop tidak hanya melarang gradien neon atau bayangan 3D murahan (`anti-ai-slop.md`). Anti-slop struktural secara tegas melarang kebiasaan buruk AI berikut:

### Pola Terlarang:
1. **Dilarang Menambah Navbar Baru atau Baris Navigasi Ganda:** Dilarang meletakkan `<header>` atau `<nav>` baru di dalam konten halaman jika halaman tersebut sudah dibungkus oleh navbar global atau sidebar settings.
2. **Dilarang Menambahkan Link Produk Tanpa Instruksi:** Dilarang menambahkan link eksternal, tab navigasi liar, atau menu baru yang tidak diminta oleh user.
3. **Dilarang Hero Heading Raksasa di Halaman Utilitas:** Halaman bantuan, pengaturan, formulir, atau riwayat tidak boleh memiliki hero section raksasa dengan font `text-6xl` yang menghabiskan setengah layar. Gunakan heading utilitas yang tenang (`text-2xl` sampai `text-3xl`).
4. **Dilarang Grid 4-Kartu Sempit Berisi Teks Panjang:** Jangan memaksakan bento grid 4-kolom jika teks di dalamnya panjang dan terpotong. Gunakan list vertikal terstruktur dengan pembagi garis hairline.
5. **Dilarang Kartu Bersarang Demi Tampilan (*Nested Decorative Cards*):** Dilarang membungkus card di dalam card lain jika kartu dalam tidak merepresentasikan entitas data yang berbeda.
6. **Dilarang Menempelkan Badge Status Sembarangan:** Jangan menambahkan badge seperti `"Aktif"`, `"New"`, atau `"Official"` jika status tersebut sudah jelas atau tidak memiliki nilai informatif bagi user.
7. **Dilarang Floating Controls Tanpa Fungsi:** Jangan menaruh tombol melayang (*floating button/fab*) jika aksi tersebut dapat diletakkan secara alami pada header atau footer seksi.
8. **Dilarang Showcase Fitur Berkedok Dokumentasi Bantuan:** Halaman bantuan adalah tempat menyelesaikan masalah user, bukan etalase promosi marketing fitur.
9. **Dilarang Menempelkan Ikon di Samping Setiap Label:** Ikon hanya digunakan untuk memperjelas aksi interaktif atau pembeda kategori utama. Jangan meletakkan ikon di setiap kalimat atau heading teks.
10. **Dilarang Mengulang Nama Brand Sebagai Judul Filler:** Hindari judul seperti *"everythings-vibe Solusi Masa Depan Anda"* di halaman pengaturan atau bantuan. Gunakan label fungsional lugas: *"Pusat Bantuan"*, *"Profil Pengguna"*, *"Pertanyaan yang Sering Diajukan"*.
11. **Dilarang Klaim Palsu pada UI Copy:** Jangan menulis deskripsi fitur yang tidak benar-benar ada di codebase.
12. **Dilarang Tampilan Kosong Kerempeng (*Scared AI Wireframe*):** Tetap jaga kepadatan informasi (*information density*) yang fungsional, terstruktur, dan siap pakai.

---

## 8. Bagian G: Kontrak Desain Responsif (*Responsive Contract*)

Setiap perubahan antarmuka **WAJIB** diuji secara mental dan struktural pada 3 breakpoint utama:
- **Mobile:** 360px – 640px (`sm` breakpoint)
- **Tablet:** 641px – 1024px (`md` & `lg` breakpoint)
- **Desktop:** > 1024px (`xl` & `2xl` breakpoint)

### Invarian Responsif:
1. **Zero Horizontal Overflow:** Halaman tidak boleh bocor secara horizontal (`overflow-x: hidden` alami pada root).
2. **No Unjustified Fixed Width:** Dilarang menggunakan lebar piksel kaku seperti `w-[900px]` pada kontainer utama. Gunakan `w-full max-w-[900px]`.
3. **No Forced Card Height:** Dilarang mengunci tinggi kartu dengan `h-[300px]` jika konten teks di dalamnya dapat bertambah di layar sempit. Gunakan `min-h-[...]` atau biarkan mengalir secara alami (`flex-grow`).
4. **Touch Targets Safe ($\ge$ 44px):** Tombol aksi, link navigasi, dan baris accordion wajib memiliki tinggi interaktif minimal 44px di perangkat sentuh.
5. **Responsive Tables & Horizontal Tabs:**
   - Tabel data di mobile beralih menjadi format card list atau memiliki wrapper `overflow-x-auto`.
   - Navigasi tab horizontal yang meluap wajib menggunakan `overflow-x-auto hide-scrollbar`.

---

## 9. Bagian H: Standar Sistem Ikonografi Hugeicons (*Icon System Contract*)

Seluruh ikon di repositori **everythings-vibe** menggunakan library **Hugeicons** melalui komponen abstraksi resmi:

```tsx
import { Icon } from "@/components/ui/icon";
import { Search01Icon } from "@hugeicons/core-free-icons";

// Pemakaian standar:
<Icon icon={Search01Icon} size={18} aria-hidden="true" />
```

### Aturan Wajib Ikon:
1. **Komponen Tunggal:** Selalu impor `Icon` dari `@/components/ui/icon`. Jangan mengimpor `HugeiconsIcon` mentah secara langsung di komponen fitur.
2. **Ukuran Standar:**
   - Ukuran default adalah `18px` (`size={18}`).
   - Ikon mini dalam badge/chip/tabel: `12px` – `14px`.
   - Ikon tombol aksi standar: `16px` – `18px`.
   - Ikon hero/fitur utama: `20px` – `24px`.
3. **Stroke Weight Hairline:** Default stroke weight adalah `1.5` (`strokeWidth={1.5}`). Memberikan tampilan tajam dan elegan tanpa terkesan tebal/kartun.
4. **Pewarisan Warna:** Menggunakan `color="currentColor"` bawaan. Atur warna melalui kelas teks Tailwind pada elemen induk atau prop `className` (`text-fog`, `text-snow`, `text-mist`).
5. **Verifikasi Glif Riil:** Jangan memilih ikon hanya karena nama ekspornya terdengar mirip. Pastikan bentuk visualnya sesuai dengan konteks semantiknya.
6. **Aksesibilitas:**
   - Ikon dekoratif otomatis menerima `aria-hidden="true"` di dalam `Icon`.
   - Jika ikon berfungsi sebagai tombol mandiri tanpa teks pendamping, **WAJIB** sertakan `aria-label` pada tombolnya (misal: `<button aria-label="Tutup dialog"><Icon icon={Cancel01Icon} /></button>`).

---

## 10. Bagian I: Kontrol Ruang Lingkup Navigasi & Fitur (*Scope Control*)

Agen AI dilarang keras memperluas ruang lingkup navigasi tanpa permintaan spesifik dari pengguna:

1. **Dilarang Menambah Rute Baru:** Jangan membuat file rute baru di `src/routes/` jika task hanya meminta perbaikan tata letak atau pembenahan komponen.
2. **Dilarang Mengubah Menu Global Navbar:** Jangan menambahkan tautan baru ke `src/components/layout/navbar-nav-links.tsx` tanpa izin eksplisit.
3. **Dilarang Mengubah Menu Settings / Admin:** Jangan menambahkan opsi baru ke daftar `NAV_ITEMS` di `settings-client.tsx` atau `admin-client.tsx` kecuali task secara eksplisit menugaskan penambahan fitur tersebut.
4. **Pemisahan Tegas:** Selalu bedakan navigasi global (berlaku di seluruh platform) dari navigasi kontekstual (hanya berlaku di dalam workspace aktif).

---

## 11. Bagian J: Checklist Audit Konsistensi Pra-Selesai (*Pre-Completion Audit Checklist*)

Sebelum menyatakan pekerjaan UI selesai (*Done*), agen **WAJIB** memeriksa dan memverifikasi setiap poin berikut:

- [ ] **Family Shell Check:** Apakah halaman mematuhi shell keluarga desainnya (Public Info, Settings, Workspace, Admin, Shared UI)?
- [ ] **Sibling Comparison Check:** Apakah ukuran heading, max container width, dan padding halaman selaras dengan halaman saudara dalam keluarga yang sama?
- [ ] **Breadcrumb Rule Check:** Apakah penggunaan breadcrumb mematuhi keputusan resmi (misal: Bantuan & FAQ tidak menggunakan breadcrumb, Scrape menggunakan breadcrumb)?
- [ ] **Component Reuse Check:** Apakah komponen memanfaatkan primitive yang sudah ada di `src/components/ui/` (Button, Card, Dialog, Icon) tanpa membuat duplikasi?
- [ ] **Icon System Check:** Apakah seluruh ikon menggunakan komponen `Icon` dengan ukuran `18px` dan stroke `1.5px` dari `@hugeicons/core-free-icons`?
- [ ] **No Anti-Slop Violations:** Apakah bebas dari navbar ganda, hero raksasa tak berdasar, kartu bersarang tanpa fungsi, dan badge semrawut?
- [ ] **Responsive Verification:** Apakah tampilan sudah terverifikasi bebas dari horizontal overflow pada mobile (360px), tablet (768px), dan desktop (1280px)?
- [ ] **Touch Target Check:** Apakah seluruh tombol dan elemen interaktif memiliki target sentuh $\ge$ 44px?
- [ ] **Clean Code & Imports:** Apakah import yang tidak terpakai (*unused imports*) dan artefak coba-coba sudah dibersihkan?
- [ ] **Deterministic Checks Pass:** Apakah `pnpm biome check <files>` dan `pnpm exec tsc --noEmit` lolos tanpa error?
