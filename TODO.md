# everythings-vibe — Backlog & Roadmap (TODO)

Dokumen ini memuat daftar rencana kerja, backlog arsitektur, standarisasi kualitas, refaktor teknis, dan pembersihan sistem untuk repositori **everythings-vibe**.

---

## 📌 DAFTAR ISI BACKLOG
1. [Bagian 1: Architectural Backlog — Greenfield Workspace Routing Architecture Refactor](#1-architectural-backlog--greenfield-workspace-routing-architecture-refactor)
2. [Bagian 2: UI/UX Standarisasi — WAJIB Mobile & Tablet Responsive Seluruh Halaman](#2-uiux-standarisasi--wajib-mobile--tablet-responsive-seluruh-halaman)
3. [Bagian 3: Refactoring & Clean Code — Dekonstruksi File Monster (~2.000 Baris) & Reusable Architecture](#3-refactoring--clean-code--dekonstruksi-file-monster-2000-baris--reusable-architecture)
4. [Bagian 4: Dead Code Elimination — Pembersihan Total Deathcode, File/Folder Sampah & Unused Dependencies](#4-dead-code-elimination--pembersihan-total-deathcode-filefolder-sampah--unused-dependencies)
5. [Bagian 5: Rebranding Ecosystem — Migrasi Menyeluruh dari VibeEverything ke everythings-vibe](#5-rebranding-ecosystem--migrasi-menyeluruh-dari-vibeeverything-ke-everythings-vibe)
6. [Bagian 6: Runtime & Performance Optimization — Migrasi Node.js ke Bun](#6-runtime--performance-optimization--migrasi-nodejs-ke-bun)
7. [Bagian 7: Arsitektur Berbasis Fitur — Modular Feature-Driven Directory Structure](#7-arsitektur-berbasis-fitur--modular-feature-driven-directory-structure)
8. [Bagian 8: Aturan Tegas AI Agent — Enforcement Policy: Anti-Slop, Strict Structure & Zero Dead Code](#8-aturan-tegas-ai-agent--enforcement-policy-anti-slop-strict-structure--zero-dead-code)

---

## 1. Architectural Backlog — Greenfield Workspace Routing Architecture Refactor

### 1.1. Ringkasan Ide & Kebutuhan
* **Status:** `Proposed / Backlog`
* **Inisiator:** Product & UX Alignment
* **Deskripsi:** Saat ini alur Greenfield berpindah-pindah rute menggunakan path mandiri terpisah:
  - `/ask/:id` (Guided Questions)
  - `/fitur/:id` (Feature & Subfeature Tree Diagram)
  - `/prd/:id` (8-Section PRD & AI Revision Chat)
  - `/ac/:id` (Acceptance Criteria)
  - `/task/:id` (Whiteboard Task Breakdown)
  - `/kanban/:id` (Interactive Kanban Board)
* **Tujuan Refactor:** Menyatukan pengalaman pengguna agar berada di dalam satu shell workspace yang konsisten dan mulus, tanpa kesan "pindah-pindah website".

---

### 1.2. Evaluasi Opsi Solusi

#### Opsi 1: Search-Param-Driven State Routing (Wizard Single-Route)
* **Format URL:** `/vibeplan/:id?step=question` $\rightarrow$ `?step=fitur` $\rightarrow$ `?step=prd` $\rightarrow$ `?step=ac` $\rightarrow$ `?step=task` $\rightarrow$ `?step=kanban`
* **Mekanisme:**
  - Route tunggal di TanStack Router: `src/routes/vibeplan/$id.tsx` (atau `/plan/$id.tsx`).
  - Search param schema Zod:
    ```typescript
    const planSearchSchema = z.object({
      step: z.enum(["question", "fitur", "prd", "ac", "task", "kanban"]).default("question"),
    });
    ```
  - Navigasi antar step menggunakan `navigate({ search: { step: "fitur" } })`.
* **Kelebihan:**
  - Shell workspace (Navbar, project title, persistent websocket/SSE) tidak pernah re-mount.
  - State lokal antar tahap awal lebih mudah di-share di level parent.
  - Browser Back & Forward otomatis mengontrol parameter `step`.
* **Tantangan Teknis:**
  - Wajib menerapkan code-splitting / dynamic `lazy()` imports pada level view komponen agar bundle PRD editor, whiteboard canvas, dan kanban drag-and-drop tidak di-download sekaligus di awal.
  - Data loading harus menggunakan granular TanStack Query di komponen anak, bukan monolithic loader di parent.

#### Opsi 2: Nested Layout Routes (Pola Standar Industri / Sub-Routes)
* **Format URL:**
  - `/vibeplan/:id/ask`
  - `/vibeplan/:id/fitur`
  - `/vibeplan/:id/prd`
  - `/vibeplan/:id/ac`
  - `/vibeplan/:id/task`
  - `/vibeplan/:id/kanban`
* **Mekanisme:**
  - Parent layout: `src/routes/vibeplan/$id.tsx` dengan `<Outlet />`.
  - Child routes di dalam `src/routes/vibeplan/$id/`.
* **Kelebihan:**
  - Tetap memiliki satu parent persistent workspace layout.
  - Menjaga granular loader per child route secara otomatis bawaan TanStack Start.
  - Code-splitting native per file route tetap optimal tanpa manual wrapper.
  - URL tetap sangat deskriptif dan mudah di-bookmark / di-share.

---

### 1.3. Lingkup Perubahan & Dampak (Impact Assessment)
Jika refactor ini dieksekusi di masa mendatang, area berikut wajib diperbarui:
1. **Routing Files:** Penataan ulang file di `src/routes/`.
2. **Step Mapping Helper:** Penyesuaian `stepToRoute` & `stepToRouteTarget` di `src/lib/flow-step.ts`.
3. **Card History & Deep Linking:** Link resume di `src/components/history/history-card.tsx`.
4. **Auth & Redirection:** Callback login / onboarding redirect targets.
5. **Test Suites:** Penyesuaian assertions rute di file unit test dan E2E test terkait navigasi rute.

---

### 1.4. Milestone Eksekusi (Ketika Siap Diimplementasikan)
- [ ] **Fase 1 — Desain Spesifikasi:** Putuskan antara Opsi 1 (Search-Param) atau Opsi 2 (Nested Layout Routes).
- [ ] **Fase 2 — Layout Shell Prototype:** Buat layout parent `/vibeplan/$id` dengan shared Navbar & breadcrumb.
- [ ] **Fase 3 — Migrasi View Anak:** Pindahkan implementasi Ask, Fitur, PRD, AC, Task, dan Kanban ke dalam outlet/switcher baru.
- [ ] **Fase 4 — Router Redirects:** Tambahkan backward-compatibility redirect dari `/ask/:id`, `/prd/:id`, dll. ke route baru agar link lama tidak 404.
- [ ] **Fase 5 — Verifikasi & Test Suite:** Update dan jalankan seluruh suite `pnpm check`, `pnpm test`, dan QA DevTools.

---

## 2. UI/UX Standarisasi — WAJIB Mobile & Tablet Responsive Seluruh Halaman

### 2.1. Latar Belakang & Urgensi
Saat ini sebagian antarmuka terfokus pada viewport desktop (layar lebar). Ketika dibuka pada layar Tablet (768px - 1024px) atau Ponsel/Mobile (360px - 480px), terdapat potensi horizontal overflow, font terpotong, canvas sulit digeser/di-pinch, toolbar menumpuk, tabel/kanban board terdistorsi, atau drawer/modal yang melebihi batas layar.
**Mandat:** Seluruh halaman dan komponen UI tanpa terkecuali WAJIB responsif, nyaman disentuh (touch-friendly), dan bebas dari bug layout pada resolusi mobile serta tablet.

### 2.2. Prinsip & Standar Responsivitas (Definition of Done)
1. **Zero Horizontal Overflow:** Tidak ada elemen yang bocor ke kanan (`overflow-x: hidden` alami tanpa merusak scrolling konten utama).
2. **Breakpoints Standar:**
   - **Mobile:** 360px – 640px (`sm` breakpoint Tailwind).
   - **Tablet / Small Laptop:** 641px – 1024px (`md` & `lg` breakpoint).
   - **Desktop:** > 1024px (`xl` & `2xl`).
3. **Touch Targets Safe:** Semua button, icon button, dan trigger minimal memiliki ukuran interaktif 44x44px.
4. **Readable Typography:** Ukuran font dan line-height nyaman dibaca di layar kecil tanpa perlu zoom manual.
5. **Fluid Drawers & Bottom Sheets:** Sidebar/panel di desktop berubah menjadi collapsible bottom sheet atau off-canvas drawer di mobile.

---

### 2.3. Checklist Audit & Perbaikan per Halaman

#### A. Public & Marketing Pages
- [ ] **Landing Page (`src/routes/index.tsx`):**
  - [ ] Hero Section: Susunan headline, CTA button, dan ilustrasi bento grid stack vertikal pada layar `< 768px`.
  - [ ] 4-Bento Navigation Hub: Grid bento 4-kolom berubah menjadi 1-kolom di mobile dan 2-kolom di tablet.
  - [ ] Interactive feature previews / showcase tidak meluap ke luar layar.
- [ ] **Pricing Page (`src/routes/pricing.tsx`):**
  - [ ] Pricing card grid berubah dari 3-kolom menjadi 1-kolom bersusun dengan kartu "Recommended" tetap kontras.
  - [ ] Tabel perbandingan fitur memiliki horizontal scroll indikator yang jelas atau accordion di mobile.
  - [ ] Tombol Checkout/Top-up mudah diakses (sticky bottom bar jika diperlukan).
- [ ] **About (`src/routes/about.tsx`) & FAQ (`src/routes/faq.tsx`):**
  - [ ] Padding container responsif (`px-4 sm:px-6 lg:px-8`).
  - [ ] Accordion item pada FAQ mudah ditekan dengan target sentuh lebar.
- [ ] **Templates Page (`src/routes/templates.tsx`):**
  - [ ] Filter tab / category pill dapat digeser horizontal secara halus (`flex overflow-x-auto no-scrollbar`).
  - [ ] Card template beralih ke layout 1-kolom (mobile) dan 2-kolom (tablet).
- [ ] **Bantuan & Feedback (`src/routes/bantuan.tsx`):**
  - [ ] Form input keluhan, file uploader screenshot, dan tombol kirim responsif penuh.
- [ ] **Auth, Login & Onboarding (`src/routes/login.tsx`, `src/routes/onboarding.tsx`):**
  - [ ] Card formulir login OAuth (Google & GitHub) berada tepat di tengah tanpa margin terpotong keyboard virtual mobile.
  - [ ] Step onboarding multi-step muat dengan rapi tanpa tertutup header browser HP.
- [ ] **Maintenance Page (`src/routes/maintenance.tsx`):**
  - [ ] Ilustrasi dan pesan error terpusat dan proporsional di seluruh ukuran layar.

#### B. Core Workspace & Flow Pages
- [ ] **Global Navbar & History Drawer (`src/components/layout/navbar.tsx`, `history-drawer.tsx`):**
  - [ ] Hamburger icon responsif di pojok kiri atas untuk membuka History Drawer di mobile.
  - [ ] Logo dan status kredit tetap terbaca rapi; sisa kredit tidak berhimpitan dengan profile avatar.
  - [ ] Profile dropdown menu dan modal dialogs pas di dalam viewport HP.
- [ ] **History Page (`src/routes/history.tsx`):**
  - [ ] Daftar project card tersusun rapi dengan badge status yang tidak wrap semrawut.
  - [ ] Search input dan filter dropdown mudah diakses di layar sempit.
- [ ] **Plan Hub (`src/routes/plan/index.tsx`, `plan/new.tsx`, `plan/codebase.tsx`):**
  - [ ] Pilihan mode workspace ("Greenfield New Project" vs "Existing Codebase") stack vertikal di mobile.
  - [ ] Form input ide / deskripsi proyek memenuhi lebar layar dengan padding yang proporsional.
  - [ ] CLI sync instruction box di `/plan/codebase` memiliki copy-to-clipboard button yang nyaman dan text block `overflow-x-auto`.
- [ ] **Guided Questions (`src/routes/ask/$id.tsx`):**
  - [ ] Question cards dan multiple-choice options mudah dipilih via sentuhan jari (min 44px tinggi tap).
  - [ ] Textarea untuk custom answer tidak tertutup oleh tombol navigasi "Next / Generate".
  - [ ] Progress indicator pertanyaan di atas terlihat jelas dan tidak gepeng di tablet/HP.
- [ ] **Feature Tree Diagram (`src/routes/fitur/$id.tsx`):**
  - [ ] Canvas diagram pohon fitur (`FeatureMapCanvas`) mendukung gesture pan (geser layar) dan zoom in/out di mobile/tablet.
  - [ ] Floating action toolbar (Zoom, Reset, Download, Continue) tidak menutupi diagram utama di mobile.
- [ ] **PRD Viewer & AI Revision Chat (`src/routes/prd/$id.tsx`):**
  - [ ] Dual-panel (PRD Document di kiri + Chat Panel di kanan) berubah menjadi tabbed view atau toggle sheet di mobile (`< 1024px`).
  - [ ] Markdown PRD rendered table memiliki wrapper `overflow-x-auto` agar tabel spesifikasi tidak memotong halaman.
  - [ ] Mermaid diagram di dalam PRD otomatis scale atau menyediakan zoom modal jika diagram terlalu lebar.
  - [ ] Chat panel bubble input tidak tertutup virtual keyboard mobile.
- [ ] **PRD Public Share (`src/routes/prd/share/$token.tsx`):**
  - [ ] View publik PRD bebas gangguan pada browser mobile; tombol export/copy link tetap accessible.
- [ ] **Acceptance Criteria (`src/routes/ac/$id.tsx`):**
  - [ ] Daftar AC dan scenario Gherkin (Given-When-Then) ter-render rapi tanpa text clipping.
  - [ ] Tombol edit / regenerate / accept criteria responsif dan tidak tumpang tindih.
- [ ] **Task Breakdown Whiteboard Canvas (`src/routes/task/$id.tsx`):**
  - [ ] `WhiteboardCanvas` mendukung viewport touch / drag canvas di tablet dan ponsel.
  - [ ] Task card hierarchy node tidak berantakan saat resolusi layar berubah.
  - [ ] Mode list alternatif (opsional jika canvas terlalu padat untuk layar 360px HP) agar pengguna tetap bisa membaca task tree.
- [ ] **Interactive Kanban Board (`src/routes/kanban/$id.tsx`):**
  - [ ] Kolom Kanban (To Do, In Progress, Done, etc.) dapat di-scroll horizontal secara halus (`flex gap-4 overflow-x-auto snap-x`).
  - [ ] Drag-and-drop task card kompatibel dengan sentuhan sentuh layar (touch dnd fallback atau action menu pindah status).
  - [ ] Modal detail card kanban muat penuh di layar HP (full-screen modal atau bottom sheet).
- [ ] **Codebase Workspace (`src/routes/codebases/index.tsx`, `src/routes/codebases/$id.tsx`):**
  - [ ] Dual/Triple pane (Explorer sidebar + Canvas/Doc Preview + Chat) beralih menjadi navigation tab atau drawer switch di mobile/tablet.
  - [ ] Terminal sync command prompt box tidak membuat horizontal overflow di HP.

#### C. Design Studio Pages
- [ ] **Design Scrap & Studio (`src/routes/design/index.tsx`, `scrap.*`, `studio.*`):**
  - [ ] Layout editor desain responsif: panel tools, canvas preview, dan inspect panel beradaptasi pada viewport tablet.
  - [ ] Di layar mobile, berikan tampilan preview yang optimal atau notifikasi visual bahwa mode editing lebih disarankan di tablet/desktop.

#### D. Settings & Admin Dashboard
- [ ] **Settings Pages (`src/routes/settings/*`):**
  - [ ] Sidebar navigasi Settings (`Profile`, `Account`, `Billing`, `API Keys`, `Notifications`, `Feedback`) berubah menjadi horizontal tab atau dropdown select di mobile.
  - [ ] Tabel riwayat transaksi invoice Midtrans di `billing.tsx` responsif dengan card list fallback di mobile.
- [ ] **Admin Dashboard (`src/routes/admin/*`):**
  - [ ] Metric cards di `admin/index.tsx` stack menjadi 1 kolom (mobile) dan 2 kolom (tablet).
  - [ ] Tabel pengguna, proyek, feedback, dan transaksi menggunakan responsive table layout (card view pada viewport kecil).

---

## 3. Refactoring & Clean Code — Dekonstruksi File Monster (~2.000 Baris) & Reusable Architecture

### 3.1. Latar Belakang Masalah
Ditemukan beberapa file raksasa (monster files) yang memiliki panjang antara 1.000 hingga hampir 2.000 baris kode dalam satu file. Hal ini melanggar prinsip *Single Responsibility Principle* (SRP), membuat readability sangat rendah, mempersulit maintenance, memicu merge conflict, dan memperlambat debugging.

### 3.2. Temuan File Raksasa dalam Codebase (Fakta Kode)
1. **`src/routes/codebases/$id.tsx` — 1.835 Baris:**
   - Menampung seluruh logika workspace codebase: screen connection, sync polling, dynamic analysis fetcher, multi-tab switching, SSE streaming chat, Kanban integration, whiteboard integration, download handlers, dan puluhan state lokal.
2. **`src/lib/codebase-sync.ts` — 1.582 Baris:**
   - Menampung schema validation Zod, CLI command generator, format prompt builder, mock payload fixtures, token expiry checker, progress stage calculator, dan error mapper dalam satu file raksasa.
3. **`src/components/task/whiteboard-canvas.tsx` — 1.349 Baris:**
   - Menggabungkan logic canvas coordinate matrix, drag-and-drop listener, zoom/pan transforms, rendering node pohon task, konektor garis SVG/canvas, minimap, toolbar actions, dan modal edit task.
4. **`src/lib/services/credit-service.ts` — 1.256 Baris:**
   - Menampung transaksi balance, deduction atomic locks, audit logs, invoice creation, package listing, dan top-up webhook processing.
5. **`src/components/chat/chat-panel.tsx` — 1.183 Baris:**
   - Menggabungkan virtualized message list, markdown rendering, AI stream typewriter effect, file upload, quick prompts, revision patch parser (`:::UPDATE_SECTION:::`) dan audio/speech triggers.
6. **File Pendukung Lain yang Membengkak:**
   - `src/routes/api/chat.ts` — 931 baris.
   - `src/components/codebase/codebase-chat-workspace.tsx` — 814 baris.
   - `src/routes/plan/codebase.tsx` — 779 baris.
   - `src/components/layout/navbar.tsx` — 771 baris.

---

### 3.3. Arsitektur Reusable & Clean Code yang Ditargetkan
* **Batas Maksimal Baris:** Target ideal per file komponen/service adalah $\le$ 300 - 400 baris.
* **Separation of Concerns (SoC):**
  - **View Component:** Hanya menangani representasi visual dan styling JSX.
  - **Custom Hook:** Menangani seluruh stateful logic, SSE subscription, event listeners, dan API calls.
  - **Utility / Pure Function:** Fungsi transformasi data murni tanpa side-effect diletakkan di file terpisah.
  - **Types / Schemas:** Definisi tipe domain dan skema Zod diletakkan di module terpisah atau didekatkan ke domain.

---

### 3.4. Checklist Refactoring File Monster

#### A. Refactor `src/routes/codebases/$id.tsx` (1.835 baris $\rightarrow$ modular components)
- [ ] Ekstraksi Custom Hook State & Polling:
  - [ ] Buat `src/hooks/codebase/use-codebase-workspace.ts` (mengelola query data proyek, status sync, tab aktif).
  - [ ] Buat `src/hooks/codebase/use-codebase-chat-stream.ts` (mengelola SSE chat streaming dan message state).
- [ ] Dekonstruksi Sub-Komponen View:
  - [ ] Pindahkan Screen Switcher ke `src/components/codebase/workspace/codebase-screen-resolver.tsx`.
  - [ ] Ekstraksi Tab Content Renderers ke folder `src/components/codebase/tabs/`:
    - `tab-overview.tsx`
    - `tab-doc-preview.tsx`
    - `tab-feature-map.tsx`
    - `tab-whiteboard.tsx`
    - `tab-kanban.tsx`
  - [ ] Ekstraksi Toolbar & Header Workspace ke `src/components/codebase/workspace/codebase-workspace-header.tsx`.
- [ ] Ringankan `src/routes/codebases/$id.tsx` menjadi file routing tipis (< 150 baris) yang hanya menyatukan layout shell dan hook.

#### B. Refactor `src/lib/codebase-sync.ts` (1.582 baris $\rightarrow$ domain services)
- [ ] Pecah menjadi modul terisolasi di dalam `src/lib/codebase/`:
  - [ ] `sync-schemas.ts`: Seluruh Zod schema dan inferensi tipe TypeScript.
  - [ ] `sync-commands.ts`: Logic pembentukan command CLI (`everythings-vibe codebase sync ...`).
  - [ ] `sync-stages.ts`: Evaluasi stage progress, status enum, dan message mapping.
  - [ ] `sync-prompts.ts`: Prompt generator untuk AI analysis instruksi sync.
- [ ] Pertahankan re-export di `src/lib/codebase-sync.ts` sebagai facade agar backward compatibility impor tidak rusak.

#### C. Refactor `src/components/task/whiteboard-canvas.tsx` (1.349 baris $\rightarrow$ canvas submodules)
- [ ] Ekstraksi Logic Transformasi Canvas:
  - [ ] Buat hook `src/hooks/use-canvas-viewport.ts` (mengelola pan, zoom, scale, pointer events, pinch-to-zoom).
- [ ] Ekstraksi Komponen Grafis:
  - [ ] `src/components/task/canvas/canvas-toolbar.tsx` (tombol zoom in/out, fit to screen, reset, fullscreen).
  - [ ] `src/components/task/canvas/canvas-minimap.tsx` (radar view posisi canvas).
  - [ ] `src/components/task/canvas/canvas-node.tsx` (rendering satu node task/subtask).
  - [ ] `src/components/task/canvas/canvas-connectors.tsx` (rendering garis hubungan antar node).
- [ ] Bersihkan `whiteboard-canvas.tsx` hingga fokus sebagai orchestrator visual canvas (< 300 baris).

#### D. Refactor `src/components/chat/chat-panel.tsx` (1.183 baris $\rightarrow$ chat primitives)
- [ ] Ekstraksi Sub-Komponen Chat:
  - [ ] `src/components/chat/chat-message-list.tsx` (scrollable container dan virtualization).
  - [ ] `src/components/chat/chat-message-item.tsx` (bubble pesan user vs assistant, copy button, timestamp).
  - [ ] `src/components/chat/chat-input-area.tsx` (textarea auto-grow, submit shortcut, voice trigger, token counter).
  - [ ] `src/components/chat/chat-patch-preview.tsx` (rendering visual diff untuk patch `:::UPDATE_SECTION:::`).
- [ ] Ekstraksi State Hook:
  - [ ] `src/hooks/use-chat-panel.ts` (mengisolasi autosave draft, scroll-to-bottom anchor, audio status).

#### E. Refactor `src/lib/services/credit-service.ts` (1.256 baris $\rightarrow$ domain modules)
- [ ] Pecah menjadi service modular di bawah `src/lib/services/credit/`:
  - [ ] `credit-balance.ts` (query saldo kredit & tenant verification).
  - [ ] `credit-deduction.ts` (atomic lock `consumeCredit` dengan strict WHERE clauses).
  - [ ] `credit-topup.ts` (paket kredit, penambahan saldo, dan integrasi invoice).
  - [ ] `credit-history.ts` (audit ledger logging & query pagination riwayat).
- [ ] Facade file `src/lib/services/credit-service.ts` mengekspor kembali seluruh fungsi untuk menjaga kontrak pemanggil.

#### F. Standar Koding & Safety Guard
- [ ] Terapkan aturan ketat `no-type-bypass.md`: Dilarang menggunakan `as any`, `as never`, atau `@ts-ignore` pada hasil refaktor.
- [ ] Menjaga seluruh test eksisting (unit test & e2e) tetap hijau: Tidak boleh me-refactor dengan cara menghapus assertion valid.
- [ ] Dokumentasi interface / types yang jelas pada setiap modul baru.

---

## 4. Dead Code Elimination — Pembersihan Total Deathcode, File/Folder Sampah & Unused Dependencies

### 4.1. Latar Belakang & Tujuan
Seiring iterasi pengembangan fitur, banyak sisa artefak sementara, rute coba-coba (spike/prototype yang sudah usang), file boilerplate tidak terpakai, fungsi yatim (unreferenced functions), tipe data kadaluarsa, atau package dependencies yang tertinggal.
**Tujuan:** Membersihkan repositori secara tuntas dari seluruh dead code agar codebase ramping, waktu build lebih cepat, ukuran bundle minimal, dan struktur folder bersih tanpa "sampah".

### 4.2. Checklist Audit & Eliminasi Bertahap

#### Tahap 1: Audit Rute & Folder Sementara (Route Spikes)
- [ ] **Audit `src/routes/demo/`:**
  - [ ] Periksa file `src/routes/demo/tanstack-query.tsx`. Jika ini hanya rute testing internal yang tidak digunakan lagi di production, jadwalkan untuk dihapus beserta foldernya.
  - [ ] Jalankan `pnpm generate-routes` untuk memastikan rute terhapus rapi dari `src/routeTree.gen.ts`.
- [ ] **Audit Scrap & Eksperimen Desain:**
  - [ ] Periksa `src/routes/design/scrap.*.tsx` dan pastikan file yang sudah digantikan oleh `studio.*` dibersihkan atau ditata secara teratur.
- [ ] **Audit File Testing Berawalan Dash (`-*`):**
  - [ ] Pindahkan file test di `src/routes/` yang berawalan `-` (seperti `-codebase.test.tsx`, `-bantuan.test.tsx`, `-templates.test.tsx`) keluar dari folder `src/routes/` menuju folder test fitur masing-masing agar `src/routes/` murni hanya berisi file route.

#### Tahap 2: Audit Komponen & Hooks Yatim (Unreferenced Components & Hooks)
- [ ] **Audit `src/components/ui/`:**
  - [ ] Periksa seluruh primitive UI (apakah ada komponen shadcn/radix yang di-generate tapi tidak pernah diimpor di rute/komponen mana pun).
- [ ] **Audit `src/components/` per Feature Domain:**
  - [ ] Cari komponen yang tidak lagi memiliki caller/consumer di `src/components/prd/`, `ac/`, `task/`, `kanban/`, `codebase/`.
- [ ] **Audit `src/hooks/`:**
  - [ ] Periksa seluruh custom hooks di `src/hooks/` yang sudah tidak memiliki import aktif.

#### Tahap 3: Audit Lib, Helpers & Tipe Data Obsolete
- [ ] **Audit `src/lib/`:**
  - [ ] Grep fungsi-fungsi helper yang tidak pernah dipanggil di mana pun.
  - [ ] Hapus mock data lama yang sudah digantikan oleh integrasi API/DB riil.
- [ ] **Audit `src/db/schema.ts` & `src/types/`:**
  - [ ] Periksa kolom/tipe yang didefinisikan tetapi tidak pernah dibaca/ditulis di application code.
  - [ ] Pastikan tidak ada skema Zod yatim yang tidak terikat pada validasi rute atau API.

#### Tahap 4: Audit Package Dependencies (`package.json`)
- [ ] Jalankan tool pendeteksi dead code / unused packages:
  - [ ] Jalankan `npx knip` atau script analisa unused imports/dependencies.
  - [ ] Periksa dependencies di root `package.json` yang tidak lagi diimpor di `src/`.
  - [ ] Periksa dependencies di `packages/cli/package.json` yang tidak lagi dipakai di CLI.
- [ ] Hapus package yang tidak terpakai menggunakan `pnpm remove <package-name>`.

#### Tahap 5: Gate Verifikasi Pasca Eliminasi
- [ ] [ ] Jalankan `pnpm generate-routes` $\rightarrow$ Pastikan route tree ter-update tanpa dangling routes.
- [ ] [ ] Jalankan `pnpm check` (Biome format & lint) $\rightarrow$ Pastikan tidak ada error import broken.
- [ ] [ ] Jalankan `pnpm exec tsc --noEmit` $\rightarrow$ Pastikan kompilasi TypeScript 100% bebas error tipe hilang.
- [ ] [ ] Jalankan `pnpm test` $\rightarrow$ Pastikan semua unit & integration tests tetap PASS.
- [ ] [ ] Jalankan `pnpm build` $\rightarrow$ Pastikan build production bundling TanStack Start selesai dengan sukses.

---

## 5. Rebranding Ecosystem — Migrasi Menyeluruh dari "VibeEverything" ke "everythings-vibe"

### 5.1. Latar Belakang & Identitas Baru
Proyek sedang bertransformasi secara merek dan repositori dari identitas lama **"VibeEverything"** (atau "vibe everything") menjadi identitas baru: **"everythings-vibe"** (nama proyek/package resmi: `everythings-vibe`, format tampilan display: `EverythingsVibe` atau `everythings-vibe` sesuai konsensus desain).
Seluruh artefak merek, judul halaman, logo, instruksi CLI, email, metadata OpenGraph, dan dokumentasi harus diselaraskan secara konsisten.

---

### 5.2. Inventaris Lokasi yang Wajib Dimigrasikan

#### A. Logo & UI Display Branding
- [ ] **Logo Component (`src/components/ui/logo.tsx`):**
  - [ ] Perbarui teks merek dari `VibeEverything` menjadi `everythings-vibe` (atau `EverythingsVibe`).
  - [ ] Perbarui komentar dan metadata fungsi `VibeEverythingMark` menjadi `EverythingsVibeMark`.
- [ ] **Navigation & Footer (`src/components/layout/navbar.tsx`, `footer.tsx`):**
  - [ ] Sesuaikan tampilan brand name dan link home.
  - [ ] Perbarui tooltip, aria-label, dan alt text logo.

#### B. Page Titles & Meta Tags (SEO & Head)
- [ ] **Root Shell Meta (`src/routes/__root.tsx`):**
  - [ ] Ganti title utama: `"everythings-vibe - All-in-One AI Vibe-Coding Workspace"`.
  - [ ] Perbarui description, OpenGraph title, Twitter card, dan manifest name.
- [ ] **Seluruh Route Head Title di `src/routes/`:**
  - [ ] `src/routes/index.tsx`: Title & description `everythings-vibe`.
  - [ ] `src/routes/pricing.tsx`: `"Pricing | everythings-vibe"`.
  - [ ] `src/routes/faq.tsx`: `"FAQ | everythings-vibe"`.
  - [ ] `src/routes/bantuan.tsx`: `"Bantuan | everythings-vibe"`.
  - [ ] `src/routes/history.tsx`: `"History | everythings-vibe"`.
  - [ ] `src/routes/codebases/index.tsx`: `"Project Tersimpan | everythings-vibe"`.
  - [ ] `src/routes/templates.tsx`: `"Templates | everythings-vibe"`.
  - [ ] `src/routes/maintenance.tsx`: `"everythings-vibe Sedang Dalam Perbaikan"`.
  - [ ] `src/routes/settings/feedback.tsx`: Teks copy *"Bantu kami meningkatkan everythings-vibe..."*.

#### C. In-App Copy, Helper Text & CLI Commands
- [ ] **CLI Sync Instructions (`src/lib/codebase-sync.ts`, `src/routes/plan/codebase.tsx`, `src/components/task/implementation-options.tsx`):**
  - [ ] Ubah perintah sinkronisasi terminal:
    - Dari: `vibeeverything codebase sync --project-id ...`
    - Menjadi: `everythings-vibe codebase sync --project-id ...`
  - [ ] Ubah instruksi instalasi global:
    - Dari: `npm i -g @ghazynabiel/vibeeverything`
    - Menjadi: `npm i -g @ghazynabiel/everythings-vibe` (atau nama package npm yang ditargetkan).
  - [ ] Ubah pesan status stage sync: *"Agent berhasil tersambung ke everythings-vibe"*, *"Mengirim source code ke everythings-vibe"*.
- [ ] **Sistem Pembayaran & Notifikasi:**
  - [ ] `src/routes/api/payments/create.ts`: Item label Midtrans `"Top Up X Kredit everythings-vibe"`.
  - [ ] `src/lib/email.ts`: Pengirim email `"everythings-vibe <onboarding@resend.dev>"` dan footer *"Email otomatis dari everythings-vibe"*.
- [ ] **Constants File (`src/lib/constants.ts`):**
  - [ ] Ubah `EXPORT_FILENAME_PREFIX`: Dari `"vibeeverything"` menjadi `"everythings-vibe"`.

#### D. CLI Package (`packages/cli/`)
- [ ] **`packages/cli/package.json`:**
  - [ ] Update `"name"`: `@ghazynabiel/everythings-vibe`.
  - [ ] Update `"description"`: *"CLI tool for everythings-vibe — manage projects, codebases, and tasks from terminal"*.
  - [ ] Update `"bin"`:
    ```json
    "bin": {
      "everythings-vibe": "dist/index.js",
      "vibe": "dist/index.js",
      "vibeeverything": "dist/index.js"
    }
    ```
    *(Catatan: Pertahankan alias `vibeeverything` sementara agar backward compatible dengan instalasi user lama).*
- [ ] **CLI Program Metadata (`packages/cli/src/index.ts`):**
  - [ ] Perbarui `program.name("everythings-vibe")`.
  - [ ] Perbarui banner sambutan CLI dan pesan `--help`.

#### E. Dokumentasi & Rules Repository
- [ ] Perbarui referensi di `AGENTS.md` (bagian header, kontrak, dan identifier yang relevan).
- [ ] Perbarui file-file spesifikasi di `docs/` yang menyebutkan VibeEverything.
- [ ] Perbarui `README.md` repositori dengan nama dan instruksi baru.

#### F. Test Suites & Contract Alignment
- [ ] **Update Test Expectations:**
  - Periksa dan sesuaikan test file yang memvalidasi teks copy lama:
    - `src/lib/codebase-naming.test.ts`
    - `src/lib/codebase-sync.test.ts`
    - `src/lib/codebase-sync-stage.test.ts`
    - `src/routes/plan/-codebase-*.test.tsx` (seluruh suite pengujian sinkronisasi codebase)
    - `src/components/task/implementation-options.test.tsx`
  - Pastikan semua assertion string yang awalnya mengecek `"vibeeverything"` atau `"VibeEverything"` disesuaikan ke `"everythings-vibe"` / `"EverythingsVibe"`.
- [ ] Jalankan `pnpm test` untuk membuktikan bahwa tidak ada assertion yang tertinggal atau gagal.

---

## 6. Runtime & Performance Optimization — Migrasi Node.js ke Bun

### Metadata
* **Status:** `Proposed / Backlog`
* **Prioritas:** `P2`
* **Kompleksitas:** `Tinggi`
* **Tujuan:** Mengevaluasi dan menerapkan Bun sebagai runtime serta package manager apabila terbukti meningkatkan performa, stabilitas, dan efisiensi aplikasi secara terukur tanpa mengorbankan kompatibilitas ekosistem TanStack Start.

---

### 6.1. Latar Belakang & Tujuan
Saat ini repositori **everythings-vibe** berjalan di atas runtime Node.js (Node 20/22+) dengan package manager `pnpm`. Seiring berkembangnya platform menjadi ekosistem multi-surface (VibePlan, VibeDesign, Existing Codebase sync, VibeTemplate), kebutuhan akan efisiensi proses server semakin tinggi.

Evaluasi migrasi ke Bun didasari oleh potensi manfaat:
1. **Startup & Execution Performance:** Kecepatan cold startup server function dan event loop berbasis JavaScriptCore.
2. **Resource Utilization:** Efisiensi memori (RAM) dan CPU overhead pada server production.
3. **Dependency Installation & Tooling:** Kecepatan instalasi dependensi, caching modul, dan eksekusi task runner terintegrasi.
4. **Development Experience (DX):** Waktu booting development server dan reload lingkungan lokal yang lebih gegas.

> **PENTING — BATASAN ARSITEKTUR:**  
> **TanStack Start TETAP menjadi full-stack web framework utama.**  
> Bun hanya dievaluasi sebagai pengganti *runtime engine* (menggantikan Node.js process) dan package manager, **BUKAN** untuk merombak atau menulis ulang backend menggunakan Elysia, Hono, Express, atau framework lainnya. Seluruh route handlers, server functions (`createServerFn`), middleware, SSR streaming, dan loader TanStack Start dipertahankan sepenuhnya.

---

### 6.2. Target Arsitektur
Arsitektur target apabila Bun dinyatakan lolos evaluasi:

* **Frontend:** React 19 + TanStack Router (file-based routing, type-safe search params).
* **Full-stack Framework:** TanStack Start (SSR, client hydration, server functions).
* **Runtime:** Bun (v1.2+) sebagai host eksekusi server production dan development, jika hasil benchmark mendukung.
* **Build Tooling:** Vite 8 + `@tanstack/react-start/plugin/vite` + Tailwind CSS 4 Vite plugin.
* **Database & ORM:** PostgreSQL 17 + Drizzle ORM (mempertahankan connection pooling, schema, dan migrasi).
* **AI Integration:** Vercel AI SDK v7 (`ai`, `@ai-sdk/openai`) via local gateway 9router dengan SSE streaming.
* **Background Worker:** Scraping & Crawling worker (Playwright Chromium) dipertahankan sebagai proses terisolasi dan dievaluasi secara independen dari web server utama.
* **CLI Companion:** `packages/cli` tetap kompatibel ganda (bisa dijalankan via Node.js atau Bun di terminal pengguna).

---

### 6.3. Audit Dependencies & Runtime Compatibility
Sebelum migrasi dilakukan, setiap risiko kompatibilitas wajib diaudit dan diverifikasi secara empiris:

- [ ] **Audit Scripts & Referensi Eksplisit Node.js:**
  - [ ] Periksa script `package.json`: `"dev": "node --dns-result-order=ipv4first node_modules/vite/bin/vite.js dev --port 3000"`. Evaluasi penggantian dengan `bun --bun vite dev` atau `bun run vite dev`.
  - [ ] Periksa referensi `process.execPath`, `node:child_process` (misal `spawn` di `src/lib/services/scrape-dev-all.ts` dan test runner), serta `node:worker_threads` (di `src/lib/crawl-url-filter.ts`).
  - [ ] Periksa modul utilitas Node.js: `node:crypto` (`createHash`, `createHmac`, `randomBytes`, `timingSafeEqual`), `node:timers/promises`, `node:util` (`isDeepStrictEqual`), serta modul jaringan `node:net` dan `node:dns/promises` (SSRF protection di `render-page.ts` dan `url-validator.ts`).
- [ ] **TanStack Start & Vite Compatibility:**
  - [ ] Verifikasi kompatibilitas SSR handler TanStack Start di bawah runtime Bun (apakah Nitro/Vinxi server adapter berjalan mulus).
  - [ ] Uji build pipeline `vite build` dan `vite preview` di bawah Bun.
- [ ] **Database & Connection Pooling:**
  - [ ] Uji kompatibilitas driver `pg` (`node-postgres` `Pool`) di bawah Bun Node-compatibility layer vs native `bun:sql` / postgres.
  - [ ] Pastikan transaksi atomic credit (`WHERE credits_used + :charge <= credits`) dan tenant queries (`WHERE user_id = ?`) tidak mengalami race condition atau connection leak.
- [ ] **Better Auth & Session Lifecycle:**
  - [ ] Verifikasi cookie parsing, session verification, OAuth callback handling (Google/GitHub), dan CSRF middleware pada environment Bun.
- [ ] **Vercel AI SDK & SSE Streaming:**
  - [ ] Uji kestabilan chunk streaming (`ReadableStream` / Server-Sent Events) dari `ai-sdk` ke klien.
  - [ ] Pastikan abort handling (`AbortController`), timeout handling, dan typewriter reveal tidak mengalami buffer stall di Bun.
- [ ] **Scraping Worker & Playwright:**
  - [ ] Uji eksekusi browser automation Playwright Chromium di bawah Bun (apakah socket IPC child process browser stabil).
  - [ ] Verifikasi graceful shutdown worker process agar tidak meninggalkan zombie Chromium processes.
- [ ] **CLI Runtime Requirements (`packages/cli`):**
  - [ ] Pastikan package CLI tetap kompatibel ketika di-install secara global oleh user yang hanya memiliki Node.js (`npm i -g @ghazynabiel/everythings-vibe`).
- [ ] **Deployment Environment & CI/CD:**
  - [ ] Evaluasi kesiapan container Docker (Bun official image vs Node Alpine/Debian) dan environment variables.

---

### 6.4. Tahapan Migrasi (Milestone Terukur)

1. **Milestone 1 — Baseline Benchmark (Node.js Baseline):**
   - [ ] Catat metrik performa saat ini menggunakan Node.js pada workload standar (cold start, SSR latency, build time, memory footprint) sebagai angka pembanding acuan.
2. **Milestone 2 — Compatibility Assessment:**
   - [ ] Uji seluruh library inti dan native Node modules di sandbox Bun lokal.
   - [ ] Identifikasi dependency atau API yang memicu warning atau incompatibilities.
3. **Milestone 3 — Bun Package Manager Evaluation:**
   - [ ] Uji instalasi dependency via `bun install` vs `pnpm install` (periksa lockfile reproducibility, hoisting behavior, dan workspace support untuk `packages/cli`).
   - [ ] Pastikan seluruh dev tooling (Biome, Vitest, TypeScript compiler) dapat berjalan normal.
4. **Milestone 4 — Bun Runtime Integration (Local Dev & Test):**
   - [ ] Sesuaikan scripts di `package.json` untuk pengujian lokal berbasis Bun tanpa mengubah kontrak aplikasi.
   - [ ] Jalankan seluruh test suite (`vitest run`) di bawah runtime Bun dan pastikan 100% test passing.
5. **Milestone 5 — Production Simulation Benchmark:**
   - [ ] Jalankan simulasi beban produksi setara (stress test API endpoints, server function SSR, dan AI stream pipeline) membandingkan Node.js vs Bun.
6. **Milestone 6 — Stability & Regression Validation:**
   - [ ] Lakukan verifikasi manual end-to-end: Auth login, Greenfield PRD generation, Existing Codebase sync, VibeDesign Studio live preview, dan Midtrans webhook.
7. **Milestone 7 — Deployment Strategy & Rollback Plan:**
   - [ ] Susun strategi deployment bertahap (canary / blue-green).
   - [ ] Dokumentasikan SOP rollback instan kembali ke Node.js jika ditemukan anomali stabilitas di production.

---

### 6.5. Performance Benchmark & Acceptance Criteria

#### Metrik Evaluasi:
* **Cold Startup & Dev Server Boot:** Waktu dari perintah dijalankan hingga server siap menerima request HTTP pertama.
* **Dependency Installation Duration:** Waktu clean install dependensi (`fresh clone`).
* **Production Build Duration:** Total waktu eksekusi `vite build` dan kompilasi route tree.
* **Server Response Latency (p50 / p95):** Latensi respon server functions dan API endpoints di bawah beban konkurensi (10, 50, 100 concurrent requests).
* **SSR TTFB (Time to First Byte):** Waktu respon awal dokumen HTML ter-render di rute utama.
* **CPU & Memory Footprint:** Konsumsi resource idle dan konsumsi puncak (*peak memory*) saat pemrosesan berat.
* **AI Streaming Overhead:** Latensi waktu-ke-chunk-pertama (*time-to-first-chunk*) pada pipeline SSE.
* **Scraping Throughput & Worker Resource:** Penggunaan memori saat Playwright me-render dan meng-capture snapshot web.
* **Error Rate & Runtime Uptime:** Ketiadaan unhandled exceptions, segfaults, atau memory leaks selama uji ketahanan 24 jam.

> **Catatan Metrik Isolasi:**  
> Metrik benchmark runtime wajib dipisahkan dari latensi eksternal pihak ketiga (seperti latensi jaringan internet, durasi kalkulasi reasoning model AI dari 9router, atau waktu respons eksternal server Midtrans). Keputusan migrasi harus bersandar pada bukti benchmark yang dapat direproduksi, bukan klaim asumtif.

#### Migration Acceptance Criteria (Syarat Kelolosan Migrasi):
- [ ] **Zero Functional & Security Regressions:** Tidak ada satupun fitur atau batas keamanan (auth, session, tenant isolation, credit atomicity) yang rusak atau melemah.
- [ ] **Critical Workflows Berfungsi Sempurna:** Seluruh alur kritis (VibePlan, VibeDesign Studio, Codebase CLI Sync, Billing Midtrans) lolos verifikasi.
- [ ] **Test & Build 100% Green:** Seluruh unit test, integration test, typecheck (`tsc --noEmit`), dan `vite build` selesai sukses tanpa error.
- [ ] **Peningkatan Terukur & Nyata:** Bun terbukti memberikan peningkatan efisiensi yang signifikan (misal penurunan TTFB, build time lebih cepat, atau penghematan RAM) tanpa meningkatkan error rate.
- [ ] **Rollback Plan Teruji:** Prosedur beralih kembali ke Node.js runtime siap dan dapat dieksekusi dalam hitungan menit bila terjadi kendala tak terduga.

> **Prinsip Keputusan:**  
> Apabila hasil benchmark menunjukkan Bun tidak memberikan manfaat performa yang signifikan, atau memicu instabilitas pada worker scraping/connection pool database, maka **Node.js tetap dipertahankan sebagai runtime standar produksi**.

---

## 7. Arsitektur Berbasis Fitur — Modular Feature-Driven Directory Structure

### 7.1. Latar Belakang & Masalah Struktur Eksisting
Saat ini struktur repositori masih menganut pola *layer-based* umum di mana komponen tersebar di `src/components/`, hooks di `src/hooks/`, logic backend di `src/lib/services/`, dan test tersebar acak di `src/routes/` atau `src/lib/`. 
Ketika sebuah fitur (misalnya **Greenfield Planning** atau **Codebase Sync**) ingin dipelajari, dimodifikasi, atau di-refactor, developer/agent harus melompat-lompat di 5+ direktori terpisah.

### 7.2. Konsep Target: Feature-Driven Architecture (`src/features/`)
Setiap domain bisnis memiliki rumah mandiri di bawah `src/features/<feature-name>/`. Seluruh kode yang berkaitan erat (*high cohesion*) diletakkan di dalam folder fitur tersebut.

```
src/
├── features/
│   ├── greenfield/            # Fitur alur Greenfield (Ask, Fitur tree, PRD, AC, Task canvas, Kanban)
│   │   ├── components/        # UI khusus greenfield (PrdViewer, WhiteboardCanvas, KanbanBoard)
│   │   ├── hooks/             # Custom hooks khusus greenfield (useKanban, useWhiteboard)
│   │   ├── services/          # Logika bisnis & API (prd-service, ac-service, task-service)
│   │   ├── types/             # Domain types & Zod schemas
│   │   └── tests/             # Unit & integration tests khusus greenfield
│   ├── codebase/              # Fitur Existing Codebase Workspace & CLI Sync
│   │   ├── components/        # CodebaseExplorer, CodebaseChatWorkspace, DocPreview
│   │   ├── hooks/             # useCodebaseWorkspace, useCodebaseChatStream
│   │   ├── services/          # codebase-analysis, codebase-sync, codebase-anchor
│   │   ├── types/             # Sync schemas, Analysis schemas
│   │   └── tests/             # Seluruh test sinkronisasi & analisis codebase
│   ├── studio/                # Fitur VibeDesign Studio & Scrap
│   │   ├── components/        # StudioCanvas, FramePicker, StyleInspector
│   │   ├── services/          # crawl-website, design-synthesis, scrape-worker
│   │   └── tests/             # Test crawling & studio synthesis
│   ├── templates/             # Fitur Katalog Template & Blueprints
│   ├── billing/               # Fitur Midtrans Snap, Credits, Balance & Invoices
│   └── auth-settings/         # Fitur Autentikasi Better Auth, Profile & Pengaturan
├── routes/                    # THIN ROUTING LAYER (Hanya definisi rute, loader, dan panggil fitur)
├── components/ui/             # SHARED PRIMITIVES (shadcn/radix murni yang reusable lintas fitur)
└── lib/                       # SHARED INFRASTRUCTURE (DB client, session, auth client, core constants)
```

---

### 7.3. Solusi & Penataan File Test TanStack Router Berawalan Dash (`-*`)
* **Mengapa ada file berawalan `-` di `src/routes/`?**
  Di TanStack Router (file-based routing), seluruh file di dalam `src/routes/` otomatis diubah menjadi URL rute. Prefix tanda hubung (`-`) adalah konvensi resmi TanStack Router untuk **mengabaikan file (Route Ignore Prefix)** agar generator rute tidak membuat endpoint untuk file tersebut.
  Di repositori ini, prefix `-` digunakan untuk menaruh file test langsung di sebelah file rute (misal `src/routes/plan/-codebase.test.tsx`).
* **Apakah pola ini bagus?**
  **TIDAK IDEAL jangka panjang.** Menaruh file test di dalam folder `src/routes/`:
  1. Mengotori folder rute dengan puluhan file non-rute (saat ini ada 30+ file test bertanda `-` di `src/routes/`).
  2. Membingungkan navigasi developer dan AI agent saat membaca struktur URL aplikasi.
* **Target Refaktor:**
  - Pindahkan SELURUH file `-*.test.ts` dan `-*.test.tsx` dari `src/routes/` ke folder `tests/` di masing-masing domain fitur (`src/features/<feature>/tests/` atau `tests/routes/`).
  - Folder `src/routes/` harus bersih 100%, hanya berisi file rute resmi (`index.tsx`, `$id.tsx`, `__root.tsx`).

---

### 7.4. Checklist Migrasi Struktur Modular
- [ ] **Fase 1: Scaffolding Direktori Fitur (`src/features/`):**
  - [ ] Buat struktur dasar `src/features/greenfield/`, `src/features/codebase/`, `src/features/studio/`, `src/features/billing/`, `src/features/templates/`.
- [ ] **Fase 2: Migrasi Domain Codebase:**
  - [ ] Pindahkan komponen `src/components/codebase/*` ke `src/features/codebase/components/`.
  - [ ] Pindahkan helpers `src/lib/codebase-*` ke `src/features/codebase/services/`.
  - [ ] Pindahkan file test `-codebase-*.test.tsx` dari `src/routes/plan/` ke `src/features/codebase/tests/`.
- [ ] **Fase 3: Migrasi Domain Greenfield:**
  - [ ] Pindahkan komponen `prd/`, `ac/`, `task/`, `kanban/`, `ask/`, `fitur/` ke `src/features/greenfield/components/`.
  - [ ] Pindahkan services `prd-service.ts`, `ac-service.ts`, `task-service.ts` ke `src/features/greenfield/services/`.
- [ ] **Fase 4: Migrasi Domain Design Studio:**
  - [ ] Pindahkan komponen `src/components/design/*` ke `src/features/studio/components/`.
  - [ ] Pindahkan logic scraping & crawling ke `src/features/studio/services/`.
  - [ ] Pindahkan file test `-studio.*.test.tsx` dari `src/routes/` ke `src/features/studio/tests/`.
- [ ] **Fase 5: Pembersihan `src/routes/` (Thin Routes Only):**
  - [ ] Pastikan setiap file di `src/routes/` hanya bertindak sebagai wire up (mengambil params/search params, memanggil loader/query, lalu me-render View dari `src/features/`).
  - [ ] Hapus seluruh prefiks `-` dari `src/routes/`.
- [ ] **Fase 6: Validasi Integritas Import & Test:**
  - [ ] Jalankan `pnpm generate-routes` untuk memastikan route tree tetap valid.
  - [ ] Jalankan `pnpm check` dan `pnpm test` hingga seluruh suite lulus tanpa import error.

---

## 8. Aturan Tegas AI Agent — Enforcement Policy: Anti-Slop, Strict Structure & Zero Dead Code

### 8.1. Latar Belakang & Urgensi
Seringkali AI coding assistant (agent) bertindak malas atau memilih jalan pintas:
- Menaruh file sembarangan di root `src/lib/` atau `src/hooks/` alih-alih meletakkannya di domain fiturnya.
- Menulis kode monster hingga ribuan baris dalam 1 file karena tidak mau repot memecah komponen.
- Meninggalkan file coba-coba, sisa prototipe, export yang tidak dipakai, atau helper yatim (*deathcode*).
- Menaruh file test di dalam folder routing dengan prefiks `-` sembarangan.
**Tujuan:** Merumuskan aturan tertulis yang mengikat (*mandatory execution contract*) di `.agents/rules/` dan `AGENTS.md` agar setiap agent yang bekerja pada repositori ini wajib mematuhi arsitektur yang bersih.

---

### 8.2. Rencana Pembuatan File Aturan: `.agents/rules/architecture-folder-structure.md`

Aturan ini memuat 5 Kontrak Wajib Agen:

#### 1. Kontrak Penempatan Kode (Strict Feature Colocation)
* Setiap pembuatan komponen, hook, helper, atau service baru **WAJIB** dimasukkan ke dalam folder fiturnya di `src/features/<feature-name>/`.
* DILARANG membuat file baru di `src/lib/` atau `src/hooks/` kecuali itu adalah modul infrastruktur global yang digunakan oleh $\ge$ 3 fitur berbeda (dan harus didokumentasikan alasannya).
* Komponen di `src/components/ui/` hanya boleh diisi oleh primitive UI murni (shadcn/Radix) tanpa logika bisnis.

#### 2. Kontrak Ukuran File & Anti-Monster (Max 300–400 Baris)
* Batas keras (*hard ceiling*) untuk file kode adalah **400 baris**.
* Jika suatu file mendekati 350 baris, agent WAJIB memecahnya ke dalam sub-komponen, custom hook, atau helper module terpisah.
* DILARANG membuat file monster 1.000–2.000 baris. Pekerjaan dianggap cacat/gagal (*violating*) jika menghasilkan file monster.

#### 3. Kontrak Zero Dead Code & Zero Garbage (Anti-Deathcode)
* Setiap fungsi, variabel, tipe data, dan komponen yang dibuat WAJIB memiliki pemanggil aktif (*active consumer*).
* Dilarang meninggalkan mock fixtures, file spike, atau rute coba-coba setelah task selesai.
* Sebelum menyatakan task "Done", agent WAJIB melakukan audit dead code (memastikan tidak ada unreferenced exports atau unused dependencies).

#### 4. Kontrak Thin Routes (Folder `src/routes/` Murni Bersih)
* Folder `src/routes/` hanya diperuntukkan bagi pendefinisian rute TanStack Router/Start.
* File rute maksimal 100–150 baris yang hanya bertugas menghubungkan loader, search params, dan merender container dari `src/features/`.
* DILARANG membuat file non-rute atau file test berawalan `-` di dalam `src/routes/`. Seluruh test harus berada di folder `tests/` fitur.

#### 5. Kontrak Verifikasi Handoff & Stop-on-Violation
* Jika agent mendapati dirinya melanggar salah satu poin di atas karena alasan "cepat" atau "kemudahan", agent **WAJIB BERHENTI** dan memperbaiki strukturnya terlebih dahulu.
* Setiap commit harus memenuhi kriteria atomik dan lolos `pnpm check`, `pnpm test`, dan pemeriksaan dead code.

---

### 8.3. Checklist Implementasi Aturan Agent
- [x] Buat file aturan baru: `.agents/rules/architecture-folder-structure.md` yang memuat kontrak di atas secara komprehensif.
- [x] Perbarui `AGENTS.md`:
  - [x] Tambahkan tautan `.agents/rules/architecture-folder-structure.md` ke dalam daftar *Always Read / Router Rules*.
  - [x] Tambahkan pasal larangan file monster (> 400 baris) dan larangan menumpuk file test di `src/routes/`.
- [x] Perbarui `.agents/rules/basic-rules.md`:
  - [x] Perbarui peta direktori target dari layer-based ke `src/features/`.
- [ ] Integrasikan script audit dead code ke dalam command verifikasi lokal:
  - [ ] Tambahkan script `"audit:deadcode": "knip"` pada `package.json` agar mudah dijalankan oleh developer maupun agent sebelum handoff.

---

## 📋 Ringkasan Prioritas Eksekusi Mendatang

| Prioritas | Backlog Item | Tingkat Dampak | Kompleksitas |
| :--- | :--- | :--- | :--- |
| **P1** | **Pembuatan Rules Agent (`architecture-folder-structure.md`)** | Kritis (Mencegah Sampah Baru Sejak Hari Ini) | Rendah (Dokumentasi & Regulasi) |
| **P1** | **Standarisasi Responsivitas Mobile & Tablet** | Sangat Tinggi (UX Pengguna Mobile) | Sedang - Luas |
| **P1** | **Dead Code Elimination & Pembersihan File `-` di Routes** | Tinggi (Mengurangi Bundle & Menghapus Kerumitan) | Sedang |
| **P2** | **Migrasi Node.js ke Bun — Runtime & Performance Optimization** | Potensial Tinggi (Performance & Runtime Efficiency) | Tinggi |
| **P2** | **Rebranding VibeEverything $\rightarrow$ everythings-vibe** | Tinggi (Konsistensi Merek & CLI) | Sedang (Banyak File & Test Update) |
| **P2** | **Refactoring File Monster (~2.000 Baris)** | Sangat Tinggi (Maintainability & Clean Code) | Tinggi (Arsitektural & Butuh Kehati-hatian) |
| **P2** | **Migrasi ke Feature-Driven Architecture (`src/features/`)** | Sangat Tinggi (Kerapihan Struktur Jangka Panjang) | Tinggi (Pindai & Pindahkan File Bertahap) |
| **P3** | **Greenfield Workspace Routing Refactor** | Strategis (Pengalaman Workspace Single Shell) | Tinggi |
