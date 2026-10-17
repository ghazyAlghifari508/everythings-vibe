# everythings-vibe — Backlog &amp; Roadmap (TODO)

Dokumen ini memuat daftar rencana kerja, backlog arsitektur, standarisasi kualitas, refaktor teknis, dan pembersihan sistem untuk repositori **everythings-vibe**.

---

## 📌 DAFTAR ISI BACKLOG

1. [Bagian 1: Architectural Backlog — Greenfield Workspace Routing Architecture Refactor](#1-architectural-backlog--greenfield-workspace-routing-architecture-refactor)
2. [Bagian 2: UI/UX Standarisasi — WAJIB Mobile &amp; Tablet Responsive Seluruh Halaman](#2-uiux-standarisasi--wajib-mobile--tablet-responsive-seluruh-halaman)

1. [Bagian 4: Dead Code Elimination — Pembersihan Total Deathcode, File/Folder Sampah &amp; Unused Dependencies](#4-dead-code-elimination--pembersihan-total-deathcode-filefolder-sampah--unused-dependencies)
2. [Bagian 5: Rebranding Ecosystem — Migrasi Menyeluruh dari VibeEverything ke everythings-vibe](#5-rebranding-ecosystem--migrasi-menyeluruh-dari-vibeeverything-ke-everythings-vibe)
3. [Bagian 6: Runtime &amp; Performance Optimization — Migrasi Node.js ke Bun](#6-runtime--performance-optimization--migrasi-nodejs-ke-bun)
4. [Bagian 7: Arsitektur Berbasis Fitur — Modular Feature-Driven Directory Structure](#7-arsitektur-berbasis-fitur--modular-feature-driven-directory-structure)
5. [Bagian 8: Aturan Tegas AI Agent — Enforcement Policy: Anti-Slop, Strict Structure &amp; Zero Dead Code](#8-aturan-tegas-ai-agent--enforcement-policy-anti-slop-strict-structure--zero-dead-code)
6. [Bagian 9: Decoupling &amp; Standalone Domain — Pemisahan VibeScrape dari VibeDesign](#9-decoupling--standalone-domain--pemisahan-vibescrape-dari-vibedesign)
7. [Bagian 10: Design System &amp; Iconography Overhaul — Migrasi dari Lucide React ke Hugeicons](#10-design-system--iconography-overhaul--migrasi-dari-lucide-react-ke-hugeicons)

---

## 1. Architectural Backlog — Greenfield Workspace Routing Architecture Refactor

### 1.1. Ringkasan Ide &amp; Kebutuhan

- **Status:** `Proposed / Backlog`
- **Inisiator:** Product &amp; UX Alignment
- **Deskripsi:** Saat ini alur Greenfield berpindah-pindah rute menggunakan path mandiri terpisah:
  - `/ask/:id` (Guided Questions)
  - `/fitur/:id` (Feature &amp; Subfeature Tree Diagram)
  - `/prd/:id` (8-Section PRD &amp; AI Revision Chat)
  - `/ac/:id` (Acceptance Criteria)
  - `/task/:id` (Whiteboard Task Breakdown)
  - `/kanban/:id` (Interactive Kanban Board)
- **Tujuan Refactor:** Menyatukan pengalaman pengguna agar berada di dalam satu shell workspace yang konsisten dan mulus, tanpa kesan "pindah-pindah website".

---

### 1.2. Evaluasi Opsi Solusi

#### Opsi 1: Search-Param-Driven State Routing (Wizard Single-Route)

- **Format URL:** `/vibeplan/:id?step=question` $\rightarrow$ `?step=fitur` $\rightarrow$ `?step=prd` $\rightarrow$ `?step=ac` $\rightarrow$ `?step=task` $\rightarrow$ `?step=kanban`
- **Mekanisme:**
  - Route tunggal di TanStack Router: `src/routes/vibeplan/$id.tsx` (atau `/plan/$id.tsx`).
  - Search param schema Zod:
    ```typescript
    const planSearchSchema = z.object({
      step: z.enum(["question", "fitur", "prd", "ac", "task", "kanban"]).default("question"),
    });
    ```
  - Navigasi antar step menggunakan `navigate({ search: { step: "fitur" } })`.
- **Kelebihan:**
  - Shell workspace (Navbar, project title, persistent websocket/SSE) tidak pernah re-mount.
  - State lokal antar tahap awal lebih mudah di-share di level parent.
  - Browser Back &amp; Forward otomatis mengontrol parameter `step`.
- **Tantangan Teknis:**
  - Wajib menerapkan code-splitting / dynamic `lazy()` imports pada level view komponen agar bundle PRD editor, whiteboard canvas, dan kanban drag-and-drop tidak di-download sekaligus di awal.
  - Data loading harus menggunakan granular TanStack Query di komponen anak, bukan monolithic loader di parent.

#### Opsi 2: Nested Layout Routes (Pola Standar Industri / Sub-Routes)

- **Format URL:**
  - `/vibeplan/:id/ask`
  - `/vibeplan/:id/fitur`
  - `/vibeplan/:id/prd`
  - `/vibeplan/:id/ac`
  - `/vibeplan/:id/task`
  - `/vibeplan/:id/kanban`
- **Mekanisme:**
  - Parent layout: `src/routes/vibeplan/$id.tsx` dengan `<Outlet />`.
  - Child routes di dalam `src/routes/vibeplan/$id/`.
- **Kelebihan:**
  - Tetap memiliki satu parent persistent workspace layout.
  - Menjaga granular loader per child route secara otomatis bawaan TanStack Start.
  - Code-splitting native per file route tetap optimal tanpa manual wrapper.
  - URL tetap sangat deskriptif dan mudah di-bookmark / di-share.

---

### 1.3. Lingkup Perubahan &amp; Dampak (Impact Assessment)

Jika refactor ini dieksekusi di masa mendatang, area berikut wajib diperbarui:

1. **Routing Files:** Penataan ulang file di `src/routes/`.
2. **Step Mapping Helper:** Penyesuaian `stepToRoute` &amp; `stepToRouteTarget` di `src/lib/flow-step.ts`.
3. **Card History &amp; Deep Linking:** Link resume di `src/components/history/history-card.tsx`.
4. **Auth &amp; Redirection:** Callback login / onboarding redirect targets.
5. **Test Suites:** Penyesuaian assertions rute di file unit test dan E2E test terkait navigasi rute.

---

### 1.4. Milestone Eksekusi (Ketika Siap Diimplementasikan)

- [ ] **Fase 1 — Desain Spesifikasi:** Putuskan antara Opsi 1 (Search-Param) atau Opsi 2 (Nested Layout Routes).
- [ ] **Fase 2 — Layout Shell Prototype:** Buat layout parent `/vibeplan/$id` dengan shared Navbar &amp; breadcrumb.
- [ ] **Fase 3 — Migrasi View Anak:** Pindahkan implementasi Ask, Fitur, PRD, AC, Task, dan Kanban ke dalam outlet/switcher baru.
- [ ] **Fase 4 — Router Redirects:** Tambahkan backward-compatibility redirect dari `/ask/:id`, `/prd/:id`, dll. ke route baru agar link lama tidak 404.
- [ ] **Fase 5 — Verifikasi &amp; Test Suite:** Update dan jalankan seluruh suite `pnpm check`, `pnpm test`, dan QA DevTools.
- [ ] **Fase 6 — Input PRD:** Pastikan alur input PRD ikut migrasi ke layout workspace baru tanpa kehilangan perilaku yang sudah ada.
- [ ] **Fase 7 — Skill Compliance:** Pastikan skill benar-benar dipakai pada setiap tahap eksekusi (bukan hanya dibaca).

---

## 2. UI/UX Standarisasi — WAJIB Mobile &amp; Tablet Responsive Seluruh Halaman

### 2.1. Latar Belakang &amp; Urgensi

Saat ini sebagian antarmuka terfokus pada viewport desktop (layar lebar). Ketika dibuka pada layar Tablet (768px - 1024px) atau Ponsel/Mobile (360px - 480px), terdapat potensi horizontal overflow, font terpotong, canvas sulit digeser/di-pinch, toolbar menumpuk, tabel/kanban board terdistorsi, atau drawer/modal yang melebihi batas layar.
**Mandat:** Seluruh halaman dan komponen UI tanpa terkecuali WAJIB responsif, nyaman disentuh (touch-friendly), dan bebas dari bug layout pada resolusi mobile serta tablet.

### 2.2. Prinsip &amp; Standar Responsivitas (Definition of Done)

1. **Zero Horizontal Overflow:** Tidak ada elemen yang bocor ke kanan (`overflow-x: hidden` alami tanpa merusak scrolling konten utama).
2. **Breakpoints Standar:**
   - **Mobile:** 360px – 640px (`sm` breakpoint Tailwind).
   - **Tablet / Small Laptop:** 641px – 1024px (`md` &amp; `lg` breakpoint).
   - **Desktop:** &gt; 1024px (`xl` &amp; `2xl`).
3. **Touch Targets Safe:** Semua button, icon button, dan trigger minimal memiliki ukuran interaktif 44x44px.
4. **Readable Typography:** Ukuran font dan line-height nyaman dibaca di layar kecil tanpa perlu zoom manual.
5. **Fluid Drawers &amp; Bottom Sheets:** Sidebar/panel di desktop berubah menjadi collapsible bottom sheet atau off-canvas drawer di mobile.

---

### 2.3. Checklist Audit &amp; Perbaikan per Halaman

#### A. Public &amp; Marketing Pages

- [ ] **Landing Page (`src/routes/index.tsx`):**
  - [ ] Hero Section: Susunan headline, CTA button, dan ilustrasi bento grid stack vertikal pada layar `< 768px`.
  - [ ] 4-Bento Navigation Hub: Grid bento 4-kolom berubah menjadi 1-kolom di mobile dan 2-kolom di tablet.
  - [ ] Interactive feature previews / showcase tidak meluap ke luar layar.
- [ ] **Pricing Page (`src/routes/pricing.tsx`):**
  - [ ] Pricing card grid berubah dari 3-kolom menjadi 1-kolom bersusun dengan kartu "Recommended" tetap kontras.
  - [ ] Tabel perbandingan fitur memiliki horizontal scroll indikator yang jelas atau accordion di mobile.
  - [ ] Tombol Checkout/Top-up mudah diakses (sticky bottom bar jika diperlukan).
- [ ] **About (`src/routes/about.tsx`) &amp; FAQ (`src/routes/faq.tsx`):**
  - [ ] Padding container responsif (`px-4 sm:px-6 lg:px-8`).
  - [ ] Accordion item pada FAQ mudah ditekan dengan target sentuh lebar.
- [ ] **Templates Page (`src/routes/templates.tsx`):**
  - [ ] Filter tab / category pill dapat digeser horizontal secara halus (`flex overflow-x-auto no-scrollbar`).
  - [ ] Card template beralih ke layout 1-kolom (mobile) dan 2-kolom (tablet).
- [ ] **Bantuan &amp; Feedback (`src/routes/bantuan.tsx`):**
  - [ ] Form input keluhan, file uploader screenshot, dan tombol kirim responsif penuh.
- [ ] **Auth, Login &amp; Onboarding (`src/routes/login.tsx`, `src/routes/onboarding.tsx`):**
  - [ ] Card formulir login OAuth (Google &amp; GitHub) berada tepat di tengah tanpa margin terpotong keyboard virtual mobile.
  - [ ] Step onboarding multi-step muat dengan rapi tanpa tertutup header browser HP.
- [ ] **Maintenance Page (`src/routes/maintenance.tsx`):**
  - [ ] Ilustrasi dan pesan error terpusat dan proporsional di seluruh ukuran layar.

#### B. Core Workspace &amp; Flow Pages

- [ ] **Global Navbar &amp; History Drawer (`src/components/layout/navbar.tsx`, `history-drawer.tsx`):**
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
- [ ] **PRD Viewer &amp; AI Revision Chat (`src/routes/prd/$id.tsx`):**
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

#### C. VibeScrape &amp; VibeDesign Studio Pages

- [ ] **VibeScrape Workspace (`src/routes/scrape/*` / legacy `/design/scrap.*`):**
  - [ ] Form input URL scrape, status progress bar, parameter tuning, dan extraction error card tampil rapi di mobile tanpa horizontal overflow.
  - [ ] Tampilan hasil ekstraksi `DESIGN.md`, inspeksi color token swatch, dan asset gallery adaptif di mobile/tablet.
- [ ] **VibeDesign Studio (`src/routes/design/studio.*`):**
  - [ ] Layout editor desain responsif: panel tools, multi-screen canvas preview, dan inspect panel beradaptasi pada viewport tablet.
  - [ ] Di layar mobile, berikan tampilan preview yang optimal atau notifikasi visual bahwa mode canvas editing lebih disarankan di tablet/desktop.

#### D. Settings &amp; Admin Dashboard

- [ ] **Settings Pages (`src/routes/settings/*`):**
  - [ ] Sidebar navigasi Settings (`Profile`, `Account`, `Billing`, `API Keys`, `Notifications`, `Feedback`) berubah menjadi horizontal tab atau dropdown select di mobile.
  - [ ] Tabel riwayat transaksi invoice Midtrans di `billing.tsx` responsif dengan card list fallback di mobile.
- [ ] **Admin Dashboard (`src/routes/admin/*`):**
  - [ ] Metric cards di `admin/index.tsx` stack menjadi 1 kolom (mobile) dan 2 kolom (tablet).
  - [ ] Tabel pengguna, proyek, feedback, dan transaksi menggunakan responsive table layout (card view pada viewport kecil).

---

## 3. Refactoring &amp; Clean Code — Dekonstruksi File Monster (~2.000 Baris) &amp; Reusable Architecture

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

### 3.3. Arsitektur Reusable &amp; Clean Code yang Ditargetkan

- **Batas Maksimal Baris:** Target ideal per file komponen/service adalah $\le$ 300 - 400 baris.
- **Separation of Concerns (SoC):**
  - **View Component:** Hanya menangani representasi visual dan styling JSX.
  - **Custom Hook:** Menangani seluruh stateful logic, SSE subscription, event listeners, dan API calls.
  - **Utility / Pure Function:** Fungsi transformasi data murni tanpa side-effect diletakkan di file terpisah.
  - **Types / Schemas:** Definisi tipe domain dan skema Zod diletakkan di module terpisah atau didekatkan ke domain.

---

### 3.4. Checklist Refactoring File Monster

#### A. Refactor `src/routes/codebases/$id.tsx` (1.835 baris $\rightarrow$ modular components)

- [ ] Ekstraksi Custom Hook State &amp; Polling:
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
  - [ ] Ekstraksi Toolbar &amp; Header Workspace ke `src/components/codebase/workspace/codebase-workspace-header.tsx`.
- [ ] Ringankan `src/routes/codebases/$id.tsx` menjadi file routing tipis (&lt; 150 baris) yang hanya menyatukan layout shell dan hook.

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
- [ ] Bersihkan `whiteboard-canvas.tsx` hingga fokus sebagai orchestrator visual canvas (&lt; 300 baris).

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
  - [ ] `credit-balance.ts` (query saldo kredit &amp; tenant verification).
  - [ ] `credit-deduction.ts` (atomic lock `consumeCredit` dengan strict WHERE clauses).
  - [ ] `credit-topup.ts` (paket kredit, penambahan saldo, dan integrasi invoice).
  - [ ] `credit-history.ts` (audit ledger logging &amp; query pagination riwayat).
- [ ] Facade file `src/lib/services/credit-service.ts` mengekspor kembali seluruh fungsi untuk menjaga kontrak pemanggil.

#### F. Standar Koding &amp; Safety Guard

- [ ] Terapkan aturan ketat `no-type-bypass.md`: Dilarang menggunakan `as any`, `as never`, atau `@ts-ignore` pada hasil refaktor.
- [ ] Menjaga seluruh test eksisting (unit test &amp; e2e) tetap hijau: Tidak boleh me-refactor dengan cara menghapus assertion valid.
- [ ] Dokumentasi interface / types yang jelas pada setiap modul baru.

---

## 4. Dead Code Elimination — Pembersihan Total Deathcode, File/Folder Sampah &amp; Unused Dependencies

### 4.1. Latar Belakang &amp; Tujuan

Seiring iterasi pengembangan fitur, banyak sisa artefak sementara, rute coba-coba (spike/prototype yang sudah usang), file boilerplate tidak terpakai, fungsi yatim (unreferenced functions), tipe data kadaluarsa, atau package dependencies yang tertinggal.
**Tujuan:** Membersihkan repositori secara tuntas dari seluruh dead code agar codebase ramping, waktu build lebih cepat, ukuran bundle minimal, dan struktur folder bersih tanpa "sampah".

### 4.2. Checklist Audit &amp; Eliminasi Bertahap

#### Tahap 1: Audit Rute &amp; Folder Sementara (Route Spikes)

- [ ] **Audit `src/routes/demo/`:**
  - [ ] Periksa file `src/routes/demo/tanstack-query.tsx`. Jika ini hanya rute testing internal yang tidak digunakan lagi di production, jadwalkan untuk dihapus beserta foldernya.
  - [ ] Jalankan `pnpm generate-routes` untuk memastikan rute terhapus rapi dari `src/routeTree.gen.ts`.
- [ ] **Pemisahan Scrap dari Design Studio &amp; Pembersihan Rute Usang:**
  - [ ] Rute `src/routes/design/scrap.*.tsx` bukan bagian dari studio dan tidak boleh dibiarkan bercampur di bawah `/design/`. Rute ini akan dipindahkan ke domain mandiri `/scrape/*` (VibeScrape) dengan redirect 301 backward compatibility (lihat Bagian 9).
- [ ] **Audit File Testing Berawalan Dash (`-*`):**
  - [ ] Pindahkan file test di `src/routes/` yang berawalan `-` (seperti `-codebase.test.tsx`, `-bantuan.test.tsx`, `-templates.test.tsx`) keluar dari folder `src/routes/` menuju folder test fitur masing-masing agar `src/routes/` murni hanya berisi file route.

#### Tahap 2: Audit Komponen &amp; Hooks Yatim (Unreferenced Components &amp; Hooks)

- [ ] **Audit `src/components/ui/`:**
  - [ ] Periksa seluruh primitive UI (apakah ada komponen shadcn/radix yang di-generate tapi tidak pernah diimpor di rute/komponen mana pun).
- [ ] **Audit `src/components/` per Feature Domain:**
  - [ ] Cari komponen yang tidak lagi memiliki caller/consumer di `src/components/prd/`, `ac/`, `task/`, `kanban/`, `codebase/`.
- [ ] **Audit `src/hooks/`:**
  - [ ] Periksa seluruh custom hooks di `src/hooks/` yang sudah tidak memiliki import aktif.

#### Tahap 3: Audit Lib, Helpers &amp; Tipe Data Obsolete

- [ ] **Audit `src/lib/`:**
  - [ ] Grep fungsi-fungsi helper yang tidak pernah dipanggil di mana pun.
  - [ ] Hapus mock data lama yang sudah digantikan oleh integrasi API/DB riil.
- [ ] **Audit `src/db/schema.ts` &amp; `src/types/`:**
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
- [ ] [ ] Jalankan `pnpm check` (Biome format &amp; lint) $\rightarrow$ Pastikan tidak ada error import broken.
- [ ] [ ] Jalankan `pnpm exec tsc --noEmit` $\rightarrow$ Pastikan kompilasi TypeScript 100% bebas error tipe hilang.
- [ ] [ ] Jalankan `pnpm test` $\rightarrow$ Pastikan semua unit &amp; integration tests tetap PASS.
- [ ] [ ] Jalankan `pnpm build` $\rightarrow$ Pastikan build production bundling TanStack Start selesai dengan sukses.

---

## 5. Rebranding Ecosystem — Migrasi Menyeluruh dari "VibeEverything" ke "everythings-vibe"

### 5.1. Latar Belakang &amp; Identitas Baru

Proyek sedang bertransformasi secara merek dan repositori dari identitas lama **"VibeEverything"** (atau "vibe everything") menjadi identitas baru: **"everythings-vibe"** (nama proyek/package resmi: `everythings-vibe`, format tampilan display: `EverythingsVibe` atau `everythings-vibe` sesuai konsensus desain).
Seluruh artefak merek, judul halaman, logo, instruksi CLI, email, metadata OpenGraph, dan dokumentasi harus diselaraskan secara konsisten.

---

### 5.2. Inventaris Lokasi yang Wajib Dimigrasikan

#### A. Logo &amp; UI Display Branding

- [ ] **Logo Component (`src/components/ui/logo.tsx`):**
  - [ ] Perbarui teks merek dari `VibeEverything` menjadi `everythings-vibe` (atau `EverythingsVibe`).
  - [ ] Perbarui komentar dan metadata fungsi `VibeEverythingMark` menjadi `EverythingsVibeMark`.
- [ ] **Navigation &amp; Footer (`src/components/layout/navbar.tsx`, `footer.tsx`):**
  - [ ] Sesuaikan tampilan brand name dan link home.
  - [ ] Perbarui tooltip, aria-label, dan alt text logo.

#### B. Page Titles &amp; Meta Tags (SEO &amp; Head)

- [ ] **Root Shell Meta (`src/routes/__root.tsx`):**
  - [ ] Ganti title utama: `"everythings-vibe - All-in-One AI Vibe-Coding Workspace"`.
  - [ ] Perbarui description, OpenGraph title, Twitter card, dan manifest name.
- [ ] **Seluruh Route Head Title di `src/routes/`:**
  - [ ] `src/routes/index.tsx`: Title &amp; description `everythings-vibe`.
  - [ ] `src/routes/pricing.tsx`: `"Pricing | everythings-vibe"`.
  - [ ] `src/routes/faq.tsx`: `"FAQ | everythings-vibe"`.
  - [ ] `src/routes/bantuan.tsx`: `"Bantuan | everythings-vibe"`.
  - [ ] `src/routes/history.tsx`: `"History | everythings-vibe"`.
  - [ ] `src/routes/codebases/index.tsx`: `"Project Tersimpan | everythings-vibe"`.
  - [ ] `src/routes/templates.tsx`: `"Templates | everythings-vibe"`.
  - [ ] `src/routes/maintenance.tsx`: `"everythings-vibe Sedang Dalam Perbaikan"`.
  - [ ] `src/routes/settings/feedback.tsx`: Teks copy *"Bantu kami meningkatkan everythings-vibe..."*.

#### C. In-App Copy, Helper Text &amp; CLI Commands

- [ ] **CLI Sync Instructions (`src/lib/codebase-sync.ts`, `src/routes/plan/codebase.tsx`, `src/components/task/implementation-options.tsx`):**
  - [ ] Ubah perintah sinkronisasi terminal:
    - Dari: `vibeeverything codebase sync --project-id ...`
    - Menjadi: `everythings-vibe codebase sync --project-id ...`
  - [ ] Ubah instruksi instalasi global:
    - Dari: `npm i -g @ghazynabiel/vibeeverything`
    - Menjadi: `npm i -g @ghazynabiel/everythings-vibe` (atau nama package npm yang ditargetkan).
  - [ ] Ubah pesan status stage sync: *"Agent berhasil tersambung ke everythings-vibe"*, *"Mengirim source code ke everythings-vibe"*.
- [ ] **Sistem Pembayaran &amp; Notifikasi:**
  - [ ] `src/routes/api/payments/create.ts`: Item label Midtrans `"Top Up X Kredit everythings-vibe"`.
  - [ ] `src/features/billing/services/email.ts`: Pengirim email `"everythings-vibe <onboarding@resend.dev>"` dan footer *"Email otomatis dari everythings-vibe"*.
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

#### E. Dokumentasi &amp; Rules Repository

- [ ] Perbarui referensi di `AGENTS.md` (bagian header, kontrak, dan identifier yang relevan).
- [ ] Perbarui file-file spesifikasi di `docs/` yang menyebutkan VibeEverything.
- [ ] Perbarui `README.md` repositori dengan nama dan instruksi baru.

#### F. Test Suites &amp; Contract Alignment

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

## 6. Runtime &amp; Performance Optimization — Migrasi Node.js ke Bun

### Metadata

- **Status:** `Proposed / Backlog`
- **Prioritas:** `P2`
- **Kompleksitas:** `Tinggi`
- **Tujuan:** Mengevaluasi dan menerapkan Bun sebagai runtime serta package manager apabila terbukti meningkatkan performa, stabilitas, dan efisiensi aplikasi secara terukur tanpa mengorbankan kompatibilitas ekosistem TanStack Start.

---

### 6.1. Latar Belakang &amp; Tujuan

Saat ini repositori **everythings-vibe** berjalan di atas runtime Node.js (Node 20/22+) dengan package manager `pnpm`. Seiring berkembangnya platform menjadi ekosistem multi-surface (VibePlan, VibeDesign, Existing Codebase sync, VibeTemplate), kebutuhan akan efisiensi proses server semakin tinggi.

Evaluasi migrasi ke Bun didasari oleh potensi manfaat:

1. **Startup &amp; Execution Performance:** Kecepatan cold startup server function dan event loop berbasis JavaScriptCore.
2. **Resource Utilization:** Efisiensi memori (RAM) dan CPU overhead pada server production.
3. **Dependency Installation &amp; Tooling:** Kecepatan instalasi dependensi, caching modul, dan eksekusi task runner terintegrasi.
4. **Development Experience (DX):** Waktu booting development server dan reload lingkungan lokal yang lebih gegas.

> **PENTING — BATASAN ARSITEKTUR:**  
> **TanStack Start TETAP menjadi full-stack web framework utama.**  
> Bun hanya dievaluasi sebagai pengganti *runtime engine* (menggantikan Node.js process) dan package manager, **BUKAN** untuk merombak atau menulis ulang backend menggunakan Elysia, Hono, Express, atau framework lainnya. Seluruh route handlers, server functions (`createServerFn`), middleware, SSR streaming, dan loader TanStack Start dipertahankan sepenuhnya.

---

### 6.2. Target Arsitektur

Arsitektur target apabila Bun dinyatakan lolos evaluasi:

- **Frontend:** React 19 + TanStack Router (file-based routing, type-safe search params).
- **Full-stack Framework:** TanStack Start (SSR, client hydration, server functions).
- **Runtime:** Bun (v1.2+) sebagai host eksekusi server production dan development, jika hasil benchmark mendukung.
- **Build Tooling:** Vite 8 + `@tanstack/react-start/plugin/vite` + Tailwind CSS 4 Vite plugin.
- **Database &amp; ORM:** PostgreSQL 17 + Drizzle ORM (mempertahankan connection pooling, schema, dan migrasi).
- **AI Integration:** Vercel AI SDK v7 (`ai`, `@ai-sdk/openai`) via local gateway 9router dengan SSE streaming.
- **Background Worker:** Scraping &amp; Crawling worker (Playwright Chromium) dipertahankan sebagai proses terisolasi dan dievaluasi secara independen dari web server utama.
- **CLI Companion:** `packages/cli` tetap kompatibel ganda (bisa dijalankan via Node.js atau Bun di terminal pengguna).

---

### 6.3. Audit Dependencies &amp; Runtime Compatibility

Sebelum migrasi dilakukan, setiap risiko kompatibilitas wajib diaudit dan diverifikasi secara empiris:

- [ ] **Audit Scripts &amp; Referensi Eksplisit Node.js:**
  - [ ] Periksa script `package.json`: `"dev": "node --dns-result-order=ipv4first node_modules/vite/bin/vite.js dev --port 3000"`. Evaluasi penggantian dengan `bun --bun vite dev` atau `bun run vite dev`.
  - [ ] Periksa referensi `process.execPath`, `node:child_process` (misal `spawn` di `src/lib/services/scrape-dev-all.ts` dan test runner), serta `node:worker_threads` (di `src/lib/crawl-url-filter.ts`).
  - [ ] Periksa modul utilitas Node.js: `node:crypto` (`createHash`, `createHmac`, `randomBytes`, `timingSafeEqual`), `node:timers/promises`, `node:util` (`isDeepStrictEqual`), serta modul jaringan `node:net` dan `node:dns/promises` (SSRF protection di `render-page.ts` dan `url-validator.ts`).
- [ ] **TanStack Start &amp; Vite Compatibility:**
  - [ ] Verifikasi kompatibilitas SSR handler TanStack Start di bawah runtime Bun (apakah Nitro/Vinxi server adapter berjalan mulus).
  - [ ] Uji build pipeline `vite build` dan `vite preview` di bawah Bun.
- [ ] **Database &amp; Connection Pooling:**
  - [ ] Uji kompatibilitas driver `pg` (`node-postgres` `Pool`) di bawah Bun Node-compatibility layer vs native `bun:sql` / postgres.
  - [ ] Pastikan transaksi atomic credit (`WHERE credits_used + :charge <= credits`) dan tenant queries (`WHERE user_id = ?`) tidak mengalami race condition atau connection leak.
- [ ] **Better Auth &amp; Session Lifecycle:**
  - [ ] Verifikasi cookie parsing, session verification, OAuth callback handling (Google/GitHub), dan CSRF middleware pada environment Bun.
- [ ] **Vercel AI SDK &amp; SSE Streaming:**
  - [ ] Uji kestabilan chunk streaming (`ReadableStream` / Server-Sent Events) dari `ai-sdk` ke klien.
  - [ ] Pastikan abort handling (`AbortController`), timeout handling, dan typewriter reveal tidak mengalami buffer stall di Bun.
- [ ] **Scraping Worker &amp; Playwright:**
  - [ ] Uji eksekusi browser automation Playwright Chromium di bawah Bun (apakah socket IPC child process browser stabil).
  - [ ] Verifikasi graceful shutdown worker process agar tidak meninggalkan zombie Chromium processes.
- [ ] **CLI Runtime Requirements (`packages/cli`):**
  - [ ] Pastikan package CLI tetap kompatibel ketika di-install secara global oleh user yang hanya memiliki Node.js (`npm i -g @ghazynabiel/everythings-vibe`).
- [ ] **Deployment Environment &amp; CI/CD:**
  - [ ] Evaluasi kesiapan container Docker (Bun official image vs Node Alpine/Debian) dan environment variables.

---

### 6.4. Tahapan Migrasi (Milestone Terukur)

1. **Milestone 1 — Baseline Benchmark (Node.js Baseline):**
   - [ ] Catat metrik performa saat ini menggunakan Node.js pada workload standar (cold start, SSR latency, build time, memory footprint) sebagai angka pembanding acuan.
2. **Milestone 2 — Compatibility Assessment:**
   - [ ] Uji seluruh library inti dan native Node modules di sandbox Bun lokal.
   
      \[ \] Identifikasi dependency atau API yang memicu warning atau incompatibilities.
3. **Milestone 3 — Bun Package Manager Evaluation:**
   - [ ] Uji instalasi dependency via `bun install` vs `pnpm install` (periksa lockfile reproducibility, hoisting behavior, dan workspace support untuk `packages/cli`).
   
      \[ \] Pastikan seluruh dev tooling (Biome, Vitest, TypeScript compiler) dapat berjalan normal.
4. **Milestone 4 — Bun Runtime Integration (Local Dev &amp; Test):**
   - [ ] Sesuaikan scripts di `package.json` untuk pengujian lokal berbasis Bun tanpa mengubah kontrak aplikasi.
   
      \[ \] Jalankan seluruh test suite (`vitest run`) di bawah runtime Bun dan pastikan 100% test passing.
5. **Milestone 5 — Production Simulation Benchmark:**
   - [ ] Jalankan simulasi beban produksi setara (stress test API endpoints, server function SSR, dan AI stream pipeline) membandingkan Node.js vs Bun.
6. **Milestone 6 — Stability &amp; Regression Validation:**
   - [ ] Lakukan verifikasi manual end-to-end: Auth login, Greenfield PRD generation, Existing Codebase sync, VibeDesign Studio live preview, dan Midtrans webhook.
7. **Milestone 7 — Deployment Strategy &amp; Rollback Plan:**
   - [ ] Susun strategi deployment bertahap (canary / blue-green).
   
      \[ \] Dokumentasikan SOP rollback instan kembali ke Node.js jika ditemukan anomali stabilitas di production.

---

### 6.5. Performance Benchmark &amp; Acceptance Criteria

#### Metrik Evaluasi:

- **Cold Startup &amp; Dev Server Boot:** Waktu dari perintah dijalankan hingga server siap menerima request HTTP pertama.
- **Dependency Installation Duration:** Waktu clean install dependensi (`fresh clone`).
- **Production Build Duration:** Total waktu eksekusi `vite build` dan kompilasi route tree.
- **Server Response Latency (p50 / p95):** Latensi respon server functions dan API endpoints di bawah beban konkurensi (10, 50, 100 concurrent requests).
- **SSR TTFB (Time to First Byte):** Waktu respon awal dokumen HTML ter-render di rute utama.
- **CPU &amp; Memory Footprint:** Konsumsi resource idle dan konsumsi puncak (*peak memory*) saat pemrosesan berat.
- **AI Streaming Overhead:** Latensi waktu-ke-chunk-pertama (*time-to-first-chunk*) pada pipeline SSE.
- **Scraping Throughput &amp; Worker Resource:** Penggunaan memori saat Playwright me-render dan meng-capture snapshot web.
- **Error Rate &amp; Runtime Uptime:** Ketiadaan unhandled exceptions, segfaults, atau memory leaks selama uji ketahanan 24 jam.

> **Catatan Metrik Isolasi:**  
> Metrik benchmark runtime wajib dipisahkan dari latensi eksternal pihak ketiga (seperti latensi jaringan internet, durasi kalkulasi reasoning model AI dari 9router, atau waktu respons eksternal server Midtrans). Keputusan migrasi harus bersandar pada bukti benchmark yang dapat direproduksi, bukan klaim asumtif.

#### Migration Acceptance Criteria (Syarat Kelolosan Migrasi):

- [ ] **Zero Functional &amp; Security Regressions:** Tidak ada satupun fitur atau batas keamanan (auth, session, tenant isolation, credit atomicity) yang rusak atau melemah.
- [ ] **Critical Workflows Berfungsi Sempurna:** Seluruh alur kritis (VibePlan, VibeDesign Studio, Codebase CLI Sync, Billing Midtrans) lolos verifikasi.
- [ ] **Test &amp; Build 100% Green:** Seluruh unit test, integration test, typecheck (`tsc --noEmit`), dan `vite build` selesai sukses tanpa error.
- [ ] **Peningkatan Terukur &amp; Nyata:** Bun terbukti memberikan peningkatan efisiensi yang signifikan (misal penurunan TTFB, build time lebih cepat, atau penghematan RAM) tanpa meningkatkan error rate.
- [ ] **Rollback Plan Teruji:** Prosedur beralih kembali ke Node.js runtime siap dan dapat dieksekusi dalam hitungan menit bila terjadi kendala tak terduga.

> **Prinsip Keputusan:**  
> Apabila hasil benchmark menunjukkan Bun tidak memberikan manfaat performa yang signifikan, atau memicu instabilitas pada worker scraping/connection pool database, maka **Node.js tetap dipertahankan sebagai runtime standar produksi**.

---

## 7. Arsitektur Berbasis Fitur — Modular Feature-Driven Directory Structure

### 7.1. Latar Belakang &amp; Masalah Struktur Eksisting

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
│   ├── studio/                # Fitur VibeDesign Studio (Interactive Canvas & Prototyping)
│   │   ├── components/        # StudioCanvas, StudioFrame, StudioSidebar, FramePicker
│   │   ├── hooks/             # useStudioWorkspace, useStudioCanvasMarquee
│   │   ├── services/          # studio-service, studio-design-blueprint, studio-export
│   │   ├── types/             # studio-schemas, studio-types
│   │   └── tests/             # Unit & integration tests studio synthesis
│   ├── scrape/                # Fitur VibeScrape (Web Scraping, Crawling & Token Extraction)
│   │   ├── components/        # ScrapeWorkspaceForm, HtmlScraperPanel, ScrapeHistoryList
│   │   ├── hooks/             # useScrapeStatus, useScrapePreview
│   │   ├── services/          # scrape-service, scrape-worker (Playwright), crawl-website
│   │   ├── types/             # scrape-contract, scrape Zod schemas
│   │   └── tests/             # Unit & integration tests scraping & Playwright crawling
│   ├── templates/             # Fitur Katalog Template & Blueprints
│   ├── billing/               # Fitur Midtrans Snap, Credits, Balance & Invoices
│   └── auth-settings/         # Fitur Autentikasi Better Auth, Profile & Pengaturan
├── routes/                    # THIN ROUTING LAYER (Hanya definisi rute, loader, dan panggil fitur)
├── components/ui/             # SHARED PRIMITIVES (shadcn/radix murni yang reusable lintas fitur)
└── lib/                       # SHARED INFRASTRUCTURE (DB client, session, auth client, core constants)
```

---

### 7.3. Solusi &amp; Penataan File Test TanStack Router Berawalan Dash (`-*`)

- **Mengapa ada file berawalan `-` di `src/routes/`?**
Di TanStack Router (file-based routing), seluruh file di dalam `src/routes/` otomatis diubah menjadi URL rute. Prefix tanda hubung (`-`) adalah konvensi resmi TanStack Router untuk **mengabaikan file (Route Ignore Prefix)** agar generator rute tidak membuat endpoint untuk file tersebut.
Di repositori ini, prefix `-` digunakan untuk menaruh file test langsung di sebelah file rute (misal `src/routes/plan/-codebase.test.tsx`).
- **Apakah pola ini bagus?**
**TIDAK IDEAL jangka panjang.** Menaruh file test di dalam folder `src/routes/`:
  1. Mengotori folder rute dengan puluhan file non-rute (saat ini ada 30+ file test bertanda `-` di `src/routes/`).
  2. Membingungkan navigasi developer dan AI agent saat membaca struktur URL aplikasi.
- **Target Refaktor:**
  - Pindahkan SELURUH file `-*.test.ts` dan `-*.test.tsx` dari `src/routes/` ke folder `tests/` di masing-masing domain fitur (`src/features/<feature>/tests/` atau `tests/routes/`).
  - Folder `src/routes/` harus bersih 100%, hanya berisi file rute resmi (`index.tsx`, `$id.tsx`, `__root.tsx`).

---

### 7.4. Checklist Migrasi Struktur Modular

- [ ] **Fase 1: Scaffolding Direktori Fitur (`src/features/`):**
  - [ ] Buat struktur dasar `src/features/greenfield/`, `src/features/codebase/`, `src/features/studio/`, `src/features/scrape/`, `src/features/billing/`, `src/features/templates/`.
- [x] **Fase 2: Migrasi Domain Codebase:**
  - [x] Pindahkan komponen `src/components/codebase/*` ke `src/features/codebase/components/`.
  - [x] Pindahkan helpers `src/lib/codebase-*` ke `src/features/codebase/services/`.
  - [x] Pindahkan file test `-codebase-*.test.tsx` dari `src/routes/plan/` ke `src/features/codebase/tests/`.
- [ ] **Fase 3: Migrasi Domain Greenfield:**
  - [ ] Pindahkan komponen `prd/`, `ac/`, `task/`, `kanban/`, `ask/`, `fitur/` ke `src/features/greenfield/components/`.
  - [ ] Pindahkan services `prd-service.ts`, `ac-service.ts`, `task-service.ts` ke `src/features/greenfield/services/`.
- [ ] **Fase 4: Migrasi Domain VibeDesign Studio:**
  - [ ] Pindahkan komponen `src/components/design/studio-*` ke `src/features/studio/components/`.
  - [ ] Pindahkan services `studio-service.ts`, `studio-design-blueprint.ts`, `studio-export.ts` ke `src/features/studio/services/`.
  - [ ] Pindahkan file test `-studio.*.test.tsx` dari `src/routes/` ke `src/features/studio/tests/`.
- [ ] **Fase 5: Migrasi Domain VibeScrape (Web Scraping &amp; Extraction):**
  - [ ] Pindahkan komponen `src/components/design/scrape-*` dan `html-scraper*.tsx` ke `src/features/scrape/components/`.
  - [ ] Pindahkan hooks `use-scrape-status.ts` dan `use-scrape-preview.ts` ke `src/features/scrape/hooks/`.
  - [ ] Pindahkan logic scraping, crawling, dan worker (`scrape-service.ts`, `scrape-job-service.ts`, `scrape-worker.ts`, `crawl-website.ts`) ke `src/features/scrape/services/`.
  - [ ] Pindahkan file test `-scrap.*.test.tsx` dari `src/routes/design/` dan `-scrape.*.test.ts` dari `src/routes/api/` ke `src/features/scrape/tests/`.
- [ ] **Fase 6: Pembersihan `src/routes/` (Thin Routes Only) &amp; Route Separation:**
  - [ ] Pastikan setiap file di `src/routes/` hanya bertindak sebagai wire up (mengambil params/search params, memanggil loader/query, lalu me-render View dari `src/features/`).
  - [ ] Pisahkan namespace routing VibeScrape (`/scrape/*`) dari VibeDesign Studio (`/design/studio/*`) dengan redirect backward-compatibility.
  - [ ] Hapus seluruh prefiks `-` dari `src/routes/`.
- [ ] **Fase 7: Validasi Integritas Import &amp; Test:**
  - [ ] Jalankan `pnpm generate-routes` untuk memastikan route tree tetap valid.
  - [ ] Jalankan `pnpm check` dan `pnpm test` hingga seluruh suite lulus tanpa import error.

---

## 8. Aturan Tegas AI Agent — Enforcement Policy: Anti-Slop, Strict Structure &amp; Zero Dead Code

### 8.1. Latar Belakang &amp; Urgensi

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

- Setiap pembuatan komponen, hook, helper, atau service baru **WAJIB** dimasukkan ke dalam folder fiturnya di `src/features/<feature-name>/`.
- DILARANG membuat file baru di `src/lib/` atau `src/hooks/` kecuali itu adalah modul infrastruktur global yang digunakan oleh $\ge$ 3 fitur berbeda (dan harus didokumentasikan alasannya).
- Komponen di `src/components/ui/` hanya boleh diisi oleh primitive UI murni (shadcn/Radix) tanpa logika bisnis.

#### 2. Kontrak Ukuran File &amp; Anti-Monster (Max 300–400 Baris)

- Batas keras (*hard ceiling*) untuk file kode adalah **400 baris**.
- Jika suatu file mendekati 350 baris, agent WAJIB memecahnya ke dalam sub-komponen, custom hook, atau helper module terpisah.
- DILARANG membuat file monster 1.000–2.000 baris. Pekerjaan dianggap cacat/gagal (*violating*) jika menghasilkan file monster.

#### 3. Kontrak Zero Dead Code &amp; Zero Garbage (Anti-Deathcode)

- Setiap fungsi, variabel, tipe data, dan komponen yang dibuat WAJIB memiliki pemanggil aktif (*active consumer*).
- Dilarang meninggalkan mock fixtures, file spike, atau rute coba-coba setelah task selesai.
- Sebelum menyatakan task "Done", agent WAJIB melakukan audit dead code (memastikan tidak ada unreferenced exports atau unused dependencies).

#### 4. Kontrak Thin Routes (Folder `src/routes/` Murni Bersih)

- Folder `src/routes/` hanya diperuntukkan bagi pendefinisian rute TanStack Router/Start.
- File rute maksimal 100–150 baris yang hanya bertugas menghubungkan loader, search params, dan merender container dari `src/features/`.
- DILARANG membuat file non-rute atau file test berawalan `-` di dalam `src/routes/`. Seluruh test harus berada di folder `tests/` fitur.

#### 5. Kontrak Verifikasi Handoff &amp; Stop-on-Violation

- Jika agent mendapati dirinya melanggar salah satu poin di atas karena alasan "cepat" atau "kemudahan", agent **WAJIB BERHENTI** dan memperbaiki strukturnya terlebih dahulu.
- Setiap commit harus memenuhi kriteria atomik dan lolos `pnpm check`, `pnpm test`, dan pemeriksaan dead code.

---

### 8.3. Checklist Implementasi Aturan Agent

- [x] Buat file aturan baru: `.agents/rules/architecture-folder-structure.md` yang memuat kontrak di atas secara komprehensif.
- [x] Perbarui `AGENTS.md`:
  - [x] Tambahkan tautan `.agents/rules/architecture-folder-structure.md` ke dalam daftar *Always Read / Router Rules*.
  - [x] Tambahkan pasal larangan file monster (&gt; 400 baris) dan larangan menumpuk file test di `src/routes/`.
- [x] Perbarui `.agents/rules/basic-rules.md`:
  - [x] Perbarui peta direktori target dari layer-based ke `src/features/`.
- [ ] Integrasikan script audit dead code ke dalam command verifikasi lokal:
  - [ ] Tambahkan script `"audit:deadcode": "knip"` pada `package.json` agar mudah dijalankan oleh developer maupun agent sebelum handoff.

---

## 9. Decoupling &amp; Standalone Domain — Pemisahan VibeScrape dari VibeDesign

### 9.1. Latar Belakang &amp; Rasional Pemisahan

- **Status:** `Proposed / Backlog`
- **Prioritas:** `P2`
- **Kompleksitas:** `Sedang - Luas`
- **Tujuan:** Memisahkan fitur Web Scraping menjadi pilar domain fitur mandiri tingkat pertama (**VibeScrape**) yang sepenuhnya terisolasi dari **VibeDesign Studio**.

#### Masalah Coupling Historis:

Sebelumnya, modul Web Scraping diletakkan di bawah payung VibeDesign (rute `src/routes/design/scrap.*.tsx`, komponen di `src/components/design/`, dan grouping "VibeDesign Studio &amp; Scrap"). Coupling ini terjadi akibat asumsi lama bahwa scraping hanyalah langkah pendukung (*auxiliary input*) untuk menyedot CSS/warna website sebelum merancang prototipe Studio.

#### Mengapa Scraping Harus Menjadi Fitur Mandiri (VibeScrape)?

1. **Perbedaan Domain Masalah &amp; Tanggung Jawab (Separation of Concerns):**
   - **VibeScrape:** Bertanggung jawab atas ekstraksi data web eksternal, crawling headless browser (Playwright Chromium), sanitasi HTML &amp; filtering skrip pelacak, ekstraksi stylesheet/aset gambar/SVG/font, kalkulasi kontras warna, serta kompilasi panduan token desain terstruktur ke dalam format `DESIGN.md`.
   - **VibeDesign Studio:** Bertanggung jawab atas lingkungan kanvas pembuatan prototipe visual interaktif, pembangkitan komponen HTML/Tailwind via AI reasoning, multi-screen live preview (desktop, tablet, mobile), inspeksi frame, dan riwayat revisi berbasis versi.
2. **Nilai Penggunaan Mandiri di Luar Studio Prototyping:**
 Artefak `DESIGN.md` dan aset visual hasil VibeScrape bernilai tinggi untuk berbagai use-case yang sama sekali tidak membutuhkan Studio:
   - Sumber konteks visual dan token desain bagi alur **VibePlan** (Greenfield &amp; Codebase).
   - Panduan styling acuan bagi coding agent (`AGENTS.md`, `.cursorrules`, `.claude/rules/`).
   - Audit desain sistem, riset antarmuka kompetitor, dan benchmarking UI.
   - Ekspor mandiri aset dan dokumen token desain tanpa harus membuka kanvas prototipe.
3. **Penyederhanaan Mental Model &amp; Pengalaman Pengguna (UX Clarity):**
 Menyatukan scraping di dalam studio membuat alur membingungkan. Pengguna yang hanya ingin mengekstrak token dari sebuah website terpaksa harus melewati menu desain. Dengan pemisahan ini, pengguna mendapatkan alur yang cepat, transparan, dan terfokus di rute `/scrape`.
4. **Isolasi Beban Worker &amp; Keamanan (SSRF &amp; Resource Safety):**
 Scraping melibatkan Chromium headless, request jaringan ke internet publik, dan validasi SSRF (`url-validator.ts`). Mengisolasi worker ini ke domain `src/features/scrape/` memastikan kegagalan crawling atau lonjakan memori browser tidak mempengaruhi stabilitas server utama maupun VibeDesign.

---

### 9.2. Arsitektur Target Pemisahan Domain

Struktur direktori target mengisolasi kedua domain secara tegas di bawah `src/features/`:

```
src/features/
├── scrape/                            # FITUR MANDIRI: VibeScrape
│   ├── components/                    # Komponen UI spesifik ekstraksi & scraping
│   │   ├── scrape-workspace-form.tsx  # Form input URL & parameter tuning
│   │   ├── html-scraper-panel.tsx     # Panel kontrol scraper
│   │   ├── scrape-detail.tsx          # Detail hasil ekstraksi & viewer token DESIGN.md
│   │   ├── scrape-history-list.tsx    # Daftar audit riwayat scraping pengguna
│   │   ├── scrape-progress.tsx        # Indikator progress crawling & status Playwright
│   │   ├── scrape-error-card.tsx      # Tampilan penanganan error ekstraksi
│   │   └── scrap-mode-switcher.tsx    # Pemilih mode ekstraksi
│   ├── hooks/                         # Custom hooks VibeScrape
│   │   ├── use-scrape-status.ts       # Polling/SSE status job scraping
│   │   └── use-scrape-preview.ts      # Preview DOM & asset snapshot
│   ├── services/                      # Backend & worker logic VibeScrape
│   │   ├── scrape-service.ts          # Layanan orkestrasi scraping & query DB
│   │   ├── scrape-job-service.ts      # Antrean job & tracking eksekusi
│   │   ├── scrape-worker.ts           # Background worker Playwright Chromium
│   │   ├── crawl-website.ts           # Headless crawling engine & link traversal
│   │   ├── scrape-extraction-service.ts # Parser CSS, font, color palette & DESIGN.md
│   │   └── scrape-image-storage.ts    # Penyimpanan lokal screenshot & aset visual
│   ├── types/                         # Kontrak & Zod schemas domain VibeScrape
│   │   ├── scrape-contract.ts         # Schema kontrak scraping & parameter spec
│   │   └── scrape-error-presentation.ts # Klasifikasi error & pemulihan
│   └── tests/                         # Seluruh unit, integration & worker test VibeScrape
│
└── studio/                            # FITUR MANDIRI: VibeDesign Studio
    ├── components/                    # Komponen UI studio prototyping
    │   ├── studio-canvas.tsx          # Multi-screen canvas container
    │   ├── studio-frame.tsx           # Frame render prototipe (iframe sandbox)
    │   ├── studio-sidebar.tsx         # Sidebar pengaturan & layer tree
    │   ├── studio-header.tsx          # Toolbar canvas & zoom/pan controls
    │   └── studio-design-picker.tsx   # Dialog pemilihan preset & token impor
    ├── hooks/                         # Custom hooks VibeDesign Studio
    │   ├── use-studio-workspace.ts    # State aktif kanvas & framing
    │   └── use-studio-canvas-marquee.ts # Interaksi seleksi marquee pada kanvas
    ├── services/                      # Logika bisnis & AI synthesis VibeDesign
    │   ├── studio-service.ts          # CRUD proyek studio & riwayat versi revisi
    │   ├── studio-design-blueprint.ts # Sintesis AI untuk markup HTML/Tailwind
    │   ├── studio-design-skills.ts    # Registry design skills (Taste, Anti-Slop, dll.)
    │   └── studio-export.ts           # Ekspor prototipe ke file mandiri / ZIP
    ├── types/                         # Schema & tipe domain VibeDesign
    │   └── studio-schemas.ts          # Zod schema blueprint, frames, dan presets
    └── tests/                         # Unit & integration test studio canvas & generator
```

---

### 9.3. Pemisahan Routing &amp; URL Namespace

#### 1. Rute Resmi Baru VibeScrape (`/scrape/*`):

- `/scrape`: Halaman beranda VibeScrape (form input URL, pengaturan parameter, inisiasi ekstraksi).
- `/scrape/$id`: Halaman detail hasil scrape (viewer `DESIGN.md`, daftar aset terunduh, preview HTML/CSS, tombol ekspor).
- `/scrape/history`: Riwayat lengkap proses scraping yang pernah dijalankan oleh pengguna.
- API Endpoints: `/api/scrape`, `/api/scrape/preview`, `/api/scrape/asset` (tetap bersih di bawah namespace `/api/scrape/*`).

#### 2. Rute Resmi VibeDesign Studio (`/design/studio/*` atau `/design/*`):

- `/design/studio`: Dashboard &amp; inisiasi kanvas prototipe visual interaktif.
- `/design/studio/$id`: Workspace studio aktif dengan editor kanvas multi-screen.
- API Endpoints: `/api/studio/project`, `/api/studio/generate`, `/api/studio/frame`, `/api/studio/asset`.

#### 3. Backward Compatibility &amp; Seamless Redirects:

Agar tidak merusak bookmark atau tautan eksternal yang sudah ada:

- `src/routes/design/scrap.tsx` $\rightarrow$ Redirect otomatis (HTTP 301 / loader redirect) ke `/scrape`.
- `src/routes/design/scrap.index.tsx` $\rightarrow$ Redirect ke `/scrape`.
- `src/routes/design/scrap.$id.tsx` $\rightarrow$ Redirect ke `/scrape/$id`.
- `src/routes/design/scrap.history.tsx` $\rightarrow$ Redirect ke `/scrape/history`.

---

### 9.4. Kontrak Integrasi Antar-Fitur (Cross-Feature Consumption)

Pemisahan fitur tidak menghilangkan sinergi. VibeDesign Studio tetap dapat memanfaatkan hasil scraping VibeScrape melalui kontrak integrasi yang bersih:

1. **Konsumsi Satu Arah (*One-Way Dependency*):**
 VibeDesign Studio bertindak sebagai *consumer* (pengguna artefak). VibeScrape **sama sekali tidak memiliki dependensi** ke VibeDesign Studio.
2. **Pola Pemanggilan DTO / Service Publik:**
 Di dalam VibeDesign Studio, terdapat opsi *"Gunakan Desain dari URL / Scrape"*:
   - Studio memanggil fungsi publik `getScrapeDocument(scrapeId)` dari `src/features/scrape/services/scrape-service.ts`.
   - Dokumen `DESIGN.md` yang diperoleh langsung disuntikkan ke context prompt blueprint studio.
3. **Decoupled Engine:**
 Modul studio bebas 100% dari dependensi Playwright, Chromium headless, maupun kode crawling jaringan.

---

### 9.5. Database Schema &amp; Worker Isolation

1. **Tabel Database Milik VibeScrape:**
   - `scrapes`: Menyimpan URL sasaran, status eksekusi job (`pending`, `scraping`, `completed`, `failed`), waktu eksekusi, opsi ekstraksi, dan metadata sesi.
   - `scrape_documents`: Menyimpan dokumen markdown terstruktur (`DESIGN.md`), stylesheet mentah, dan manifest aset.
2. **Tabel Database Milik VibeDesign Studio:**
   - `studio_projects`: Proyek desain kanvas, preferensi framework/preset, prompt desain pengguna.
   - `studio_revisions`: Riwayat versi kode HTML/Tailwind interaktif per iterasi AI.
3. **Isolasi Background Worker:**
   - Skrip worker Playwright `scrape-worker.ts` dijalankan sebagai proses latar belakang terisolasi.
   - Dilengkapi proteksi SSRF (`url-validator.ts`), pembatasan resource memori browser, dan graceful shutdown handler agar tidak membebani proses Node/Bun web server utama.

---

### 9.6. Checklist Eksekusi Pemisahan VibeScrape

- [ ] **Fase 1 — Scaffolding Direktori Domain VibeScrape:**
  - [ ] Buat struktur folder: `src/features/scrape/{components,hooks,services,types,tests}`.
- [ ] **Fase 2 — Migrasi Komponen UI Scraper:**
  - [ ] Pindahkan komponen scraper dari `src/components/design/` ke `src/features/scrape/components/`:
    - `scrape-workspace-form.tsx`
    - `html-scraper-panel.tsx` &amp; `html-scraper.tsx`
    - `scrape-detail.tsx`
    - `scrape-history-list.tsx`
    - `scrape-progress.tsx`
    - `scrape-error-card.tsx`
    - `scrap-mode-switcher.tsx`
    - `scrape-filter-select.tsx`, `scrape-form-notice.tsx`, `scrape-back-link.tsx`
- [ ] **Fase 3 — Migrasi Custom Hooks:**
  - [ ] Pindahkan `use-scrape-status.ts` dan `use-scrape-preview.ts` dari `src/hooks/` ke `src/features/scrape/hooks/`.
- [ ] **Fase 4 — Migrasi Services, Crawler &amp; Worker:**
  - [ ] Pindahkan services dari `src/lib/services/` dan `src/lib/` ke `src/features/scrape/services/`:
    - `scrape-service.ts` &amp; `scrape-job-service.ts`
    - `scrape-worker.ts` &amp; `crawl-website.ts`
    - `scrape-extraction-service.ts`
    - `scrape-image-storage.ts` &amp; `scrape-images.ts`
    - `scrape-retry.ts`, `scrape-preview-document.ts`, `scrape-history.ts`
  - [ ] Pindahkan tipe &amp; kontrak ke `src/features/scrape/types/`:
    - `scrape-contract.ts`
    - `scrape-error-presentation.ts`
    - `scrape-parameter-spec.ts` &amp; `scrape-view-state.ts`
- [ ] **Fase 5 — Migrasi Rute TanStack Router:**
  - [ ] Buat rute baru: `src/routes/scrape/index.tsx`, `src/routes/scrape/$id.tsx`, dan `src/routes/scrape/history.tsx`.
  - [ ] Ubah file rute lama `src/routes/design/scrap.*.tsx` menjadi thin redirect ke rute `/scrape/*`.
  - [ ] Jalankan `pnpm generate-routes` untuk meregenerasi route tree TanStack Router.
- [ ] **Fase 6 — Pemindahan Test Suites:**
  - [ ] Pindahkan seluruh file test scraping (`-scrap.*.test.tsx`, `scrape-*.test.ts`) keluar dari `src/routes/` dan `src/lib/` ke dalam `src/features/scrape/tests/`.
- [ ] **Fase 7 — Integrasi Bersih VibeDesign Studio:**
  - [ ] Pastikan komponen studio di `src/features/studio/` hanya memanggil DTO/service publik dari `src/features/scrape/` tanpa circular dependency.
- [ ] **Fase 8 — Verifikasi &amp; Test Passing:**
  - [ ] Jalankan `pnpm check`, `pnpm test`, dan verifikasi build hingga 100% green.

---

## 10. Design System &amp; Iconography Overhaul — Migrasi dari Lucide React ke Hugeicons

### 10.1. Latar Belakang &amp; Rasional Migrasi

- **Status:** `Proposed / Backlog`
- **Prioritas:** `P2`
- **Kompleksitas:** `Sedang - Luas` (~100+ file UI dan komponen di seluruh repositori)
- **Tujuan:** Menggantikan seluruh pemakaian dan dependensi icon library `lucide-react` dengan **Hugeicons** (`@hugeicons/react` dan `@hugeicons/core-free-icons`) di seluruh aplikasi **everythings-vibe** demi meningkatkan estetika visual, konsistensi hairline stroke, dan diferensiasi desain developer-grade.

#### Mengapa Beralih dari Lucide React ke Hugeicons?

1. **Estetika Developer-Grade &amp; Menolak Standar "AI Slop Boilerplate":**
 Lucide React adalah icon library bawaan standar yang digunakan oleh hampir seluruh template shadcn/ui dan proyek starter AI. Hal ini membuat aplikasi tampak seperti produk "template pasaran". Hugeicons menghadirkan estetika stroke yang lebih tajam (*crisp hairline*), sudut kurva yang presisi, dan nuansa visual modern yang dirancang khusus untuk antarmuka produk teknologi tinggi.
2. **Kekayaan Varian Gaya &amp; Diferensiasi State:**
 Hugeicons menyediakan lebih dari 4.000+ ikon gratis dengan konsistensi grid yang ketat. Mendukung fitur canggih seperti `altIcon` (perubahan ikon otomatis saat state aktif/toggled) yang sangat cocok untuk tombol interaktif seperti bookmark, copy, pin, expand/collapse, dan status checklist.
3. **Kesesuaian dengan Identitas Multi-Surface everythings-vibe:**
 Set ikon Hugeicons mencakup glif teknis yang sangat kaya untuk kebutuhan alur kerja developer: branching git, snapshot terminal, visualisasi token desain, frame multi-screen canvas, hingga pipeline inspeksi kode AST.

---

### 10.2. Target Arsitektur Iconography &amp; Abstraksi Komponen (`Icon`)

#### Masalah Pola Direct Import di Codebase Eksisting:

Saat ini hampir 100+ file komponen mengimpor langsung dari package pihak ketiga:

```tsx
import { Check, Search, Settings } from 'lucide-react';
```

Pola ini menciptakan coupling langsung yang kaku: jika di masa mendatang terjadi pembaruan icon library, penyesuaian stroke width bawaan, atau optimasi bundle, perubahan harus dilakukan secara manual di ratusan file.

#### Solusi Arsitektur: Reusable Icon Abstraction (`src/components/ui/icon.tsx`):

Membangun abstraction component tunggal `Icon` di `src/components/ui/icon.tsx` yang membungkus komponen resmi `HugeiconsIcon`:

```tsx
import { HugeiconsIcon } from '@hugeicons/react';
import type { IconSvgObject } from '@hugeicons/react';

export interface IconProps {
  icon: IconSvgObject;
  size?: number;
  strokeWidth?: number;
  color?: string;
  className?: string;
  altIcon?: IconSvgObject;
  showAlt?: boolean;
}

/**
 * Standard Icon Component for everythings-vibe.
 * Enforces crisp hairline stroke (default 1.5px) and standard size (18px)
 * per .agents/rules/anti-ai-slop.md.
 */
export function Icon({
  icon,
  size = 18,
  strokeWidth = 1.5,
  color = 'currentColor',
  className,
  ...props
}: IconProps) {
  return (
    <HugeiconsIcon
      icon={icon}
      size={size}
      strokeWidth={strokeWidth}
      color={color}
      className={className}
      {...props}
    />
  );
}
```

**Keuntungan Arsitektural:**

- Standarisasi stroke width default (1.5px) dan ukuran (18px) secara global sesuai aturan [.agents/rules/anti-ai-slop.md](file:///C:/Coding/Web%20Development/Tanstack-start/everythings-vibe/.agents/rules/anti-ai-slop.md).
- Dukungan seamless pewarisan warna font (`currentColor`) dan utility classes Tailwind (`className="text-snow hover:text-white"`).
- Memudahkan mocking pada Vitest suite dan integrasi Storybook / visual regression test.

---

### 10.3. Tabel Pemetaan Ikon Populer (Lucide $\rightarrow$ Hugeicons Mapping Matrix)

Berikut panduan referensi pemetaan ikon Lucide React yang paling sering dipakai ke glif padanannya di `@hugeicons/core-free-icons`:


| Kategori / Makna UI            | Ikon Lucide React Eksisting                               | Ikon Hugeicons Padanan (`@hugeicons/core-free-icons`)                     |
| :------------------------------ | :--------------------------------------------------------- | :------------------------------------------------------------------------- |
| **Checklist &amp; Selesai**    | `Check`, `CheckCheck`                                     | `Tick01Icon`, `CheckmarkCircle01Icon`                                     |
| **Navigasi Panah**             | `ChevronDown`, `ChevronUp`, `ChevronLeft`, `ChevronRight` | `ArrowDown01Icon`, `ArrowUp01Icon`, `ArrowLeft01Icon`, `ArrowRight01Icon` |
| **Pencarian &amp; Filter**     | `Search`, `Filter`                                        | `Search01Icon`, `FilterIcon`                                              |
| **Pengaturan &amp; Identitas** | `Settings`, `User`, `Users`                               | `Settings01Icon`, `UserIcon`, `UserGroupIcon`                             |
| **Operasi CRUD**               | `Plus`, `Trash2`, `Trash`, `Edit`, `Copy`                 | `Add01Icon`, `Delete01Icon`, `PencilEdit01Icon`, `Copy01Icon`             |
| **Loading &amp; Refresh**      | `Loader2`, `RefreshCw`, `RotateCcw`                       | `Loading01Icon`, `RefreshIcon`, `RotateLeft01Icon`                        |
| **Peringatan &amp; Batal**     | `AlertCircle`, `AlertTriangle`, `X`, `XCircle`            | `AlertCircleIcon`, `Alert01Icon`, `Cancel01Icon`, `CancelCircleIcon`      |
| **File &amp; Dokumen**         | `Folder`, `FolderGit2`, `FileText`, `Code`                | `Folder01Icon`, `FolderGitIcon`, `FileDocumentIcon`, `Code01Icon`         |
| **Terminal &amp; Tooling**     | `Terminal`, `ExternalLink`, `Share2`                      | `TerminalIcon`, `LinkSquare01Icon`, `Share01Icon`                         |
| **Tema &amp; Visibilitas**     | `Sun`, `Moon`, `Eye`, `EyeOff`                            | `Sun01Icon`, `Moon01Icon`, `ViewIcon`, `ViewOffSlashIcon`                 |
| **Keamanan &amp; Finansial**   | `Shield`, `CreditCard`, `Lock`                            | `ShieldSecurityIcon`, `CreditCardIcon`, `LockKeyIcon`                     |
| **Chat &amp; AI Workspace**    | `MessageSquare`, `Send`, `Bot`, `Sparkles`                | `Message01Icon`, `SentIcon`, `CpuIcon`, `MagicWand01Icon`                 |
| **Zoom &amp; Canvas**          | `ZoomIn`, `ZoomOut`, `Maximize2`, `Minimize2`             | `ZoomInIcon`, `ZoomOutIcon`, `Maximize01Icon`, `Minimize01Icon`           |


---

### 10.4. Strategi Migrasi Bertahap (Phased Non-Breaking Rollout)

Karena migrasi ini menyentuh ~100+ file, pekerjaan tidak boleh dilakukan secara "big-bang rewrite" yang rawan memicu regresi UI atau test breaking. Migrasi dibagi menjadi 6 gelombang (*waves*):

#### Gelombang 1 — Setup Dependensi &amp; Wrapper Icon Primitive

- Install paket resmi: `pnpm add @hugeicons/react @hugeicons/core-free-icons`.
- Buat komponen wrapper `src/components/ui/icon.tsx`.
- Migrasi komponen UI shared di `src/components/ui/`:
  - `src/components/ui/dialog.tsx` (`X` $\rightarrow$ `Cancel01Icon`)
  - `src/components/ui/dropdown-menu.tsx` (`Check`, `ChevronRight` $\rightarrow$ `Tick01Icon`, `ArrowRight01Icon`)
  - `src/components/ui/theme-toggle.tsx` (`Sun`, `Moon` $\rightarrow$ `Sun01Icon`, `Moon01Icon`)
  - `src/components/ui/pricing-card.tsx` (`Check` $\rightarrow$ `Tick01Icon`)
  - `src/components/ui/agent-thinking.tsx` (`Loader2`, `Brain` $\rightarrow$ `Loading01Icon`, `CpuIcon`)

#### Gelombang 2 — Shell Aplikasi &amp; Navigasi Global

- `src/components/layout/navbar.tsx` (Logo icon, User dropdown, Nav links).
- `src/components/home/bento-hub.tsx` &amp; `hub-breadcrumb.tsx`.
- `src/components/layout/history-drawer.tsx` &amp; `subscription-banner.tsx`.
- `src/components/layout/not-found.tsx` &amp; `src/components/ui/forbidden-page.tsx`.

#### Gelombang 3 — Domain Greenfield (VibePlan)

- `src/app/ask/ask-flow.tsx`, `question-card.tsx`, `stack-dropdown.tsx`.
- `src/components/fitur/fitur-detail.tsx`.
- `src/components/prd/prd-detail.tsx`, `delete-project-modal.tsx`.
- `src/components/ac/ac-detail.tsx`.
- `src/components/task/task-detail.tsx`, `whiteboard-canvas.tsx`, `zoom-controls.tsx`.
- `src/components/kanban/kanban-board.tsx`, `kanban-card.tsx`, `kanban-banner.tsx`.

#### Gelombang 4 — Domain Existing Codebase &amp; CLI

- `src/components/codebase/codebase-explorer-sidebar.tsx`.
- `src/components/codebase/codebase-chat-workspace.tsx`.
- `src/components/codebase/codebase-kanban-board.tsx`.
- `src/components/codebase/codebase-resync-drawer.tsx`.
- `src/components/codebase/codebase-plan-switcher.tsx`.
- `src/components/codebase/sync-stage-list.tsx`, `screen-connect.tsx`.

#### Gelombang 5 — Domain VibeScrape &amp; VibeDesign Studio

- `src/components/design/scrape-workspace-form.tsx`, `html-scraper-panel.tsx`, `scrape-progress.tsx`, `scrape-detail.tsx`.
- `src/components/design/studio-canvas.tsx`, `studio-frame.tsx`, `studio-header.tsx`, `studio-sidebar.tsx`, `studio-design-picker.tsx`.
- `src/components/templates/template-catalog.tsx`.

#### Gelombang 6 — Settings, Admin, Bantuan &amp; Pembersihan Total

- `src/components/settings/settings-client.tsx`, `api-keys-client.tsx`, `credit-usage.tsx`, `feedback-form.tsx`.
- `src/components/admin/admin-client.tsx`, `trend-line-chart.tsx`.
- `src/components/bantuan/workflow-guides.tsx`, `faq-accordion.tsx`.
- Eksekusi pembersihan: `pnpm remove lucide-react`.
- Audit verifikasi: `git grep "lucide-react"` harus bernilai 0 di seluruh repositori.

---

### 10.5. Pertimbangan Tree-Shaking &amp; Bundle Size

- **Ukuran Paket `@hugeicons/core-free-icons`:**  
Paket ini memuat ribuan ikon. Jika developer atau agent mengimpor secara wildcard (`import * as Icons from ...`), bundle produksi akan meledak puluhan megabyte.
- **Aturan Wajib Named Import:**  
Setiap komponen **WAJIB** menggunakan named import spesifik:
  ```tsx
  // BENAR (Tree-shakeable, hanya memuat beberapa KB)
  import { Search01Icon, Settings01Icon } from '@hugeicons/core-free-icons';
  
  // DILARANG KERAS (Memecahkan tree-shaking & merusak bundle size)
  import * as Hugeicons from '@hugeicons/core-free-icons';
  ```
- **Verifikasi Build:**  
Setelah migrasi selesai, jalankan `pnpm build` dan periksa chunk report di `dist/` untuk memastikan ukuran vendor bundle tetap ramping dan optimal.

---

### 10.6. Checklist Eksekusi Migrasi Icon

- [ ] **Fase 1 — Instalasi &amp; Primitive Setup:**
  - [ ] `pnpm add @hugeicons/react @hugeicons/core-free-icons`.
  - [ ] Buat file wrapper `src/components/ui/icon.tsx`.
  - [ ] Buat unit test wrapper `src/components/ui/icon.test.tsx`.
- [ ] **Fase 2 — Migrasi UI Primitives &amp; Layout Shell:**
  - [ ] Migrasi ikon di `src/components/ui/` (`dialog.tsx`, `dropdown-menu.tsx`, `theme-toggle.tsx`, `agent-thinking.tsx`).
  - [ ] Migrasi ikon di `src/components/layout/` (`navbar.tsx`, `history-drawer.tsx`, `chat-input.tsx`).
- [ ] **Fase 3 — Migrasi Domain Greenfield &amp; VibePlan:**
  - [ ] Migrasi `Ask`, `Fitur`, `PRD`, `AC`, `Task Whiteboard`, dan `Kanban Board`.
  - [ ] Verifikasi interaksi checklist `Check` $\rightarrow$ `Tick01Icon` tetap berfungsi mulus.
- [ ] **Fase 4 — Migrasi Domain Codebase Workspace:**
  - [ ] Migrasi `CodebaseExplorerSidebar`, `CodebaseChatWorkspace`, `SyncStageList`, `CodebaseResyncDrawer`.
- [ ] **Fase 5 — Migrasi Domain VibeScrape &amp; VibeDesign Studio:**
  - [ ] Migrasi komponen scraper (`scrape-workspace-form.tsx`, `scrape-progress.tsx`, `scrape-detail.tsx`).
  - [ ] Migrasi komponen studio canvas (`studio-canvas.tsx`, `studio-header.tsx`, `studio-sidebar.tsx`).
- [ ] **Fase 6 — Migrasi Settings, Admin &amp; Bantuan:**
  - [ ] Migrasi `settings/*`, `admin/*`, `bantuan.tsx`, `template-catalog.tsx`.
- [ ] **Fase 7 — Pembersihan Dependensi Lucide:**
  - [ ] Jalankan `pnpm remove lucide-react`.
  - [ ] Jalankan `git grep "lucide-react"` dan pastikan 0 referensi tersisa di `package.json` dan `src/`.
- [ ] **Fase 8 — Verifikasi Kualitas Akhir:**
  - [ ] Jalankan `pnpm check` (Biome linting &amp; formatting).
  - [ ] Jalankan `pnpm test` (Pastikan seluruh suite test lulus tanpa error icon missing).
  - [ ] Jalankan `pnpm build` (Pastikan tree-shaking berjalan optimal dan bundle size tetap ringan).

---

## 📋 Ringkasan Prioritas Eksekusi Mendatang


| Prioritas | Backlog Item                                                        | Tingkat Dampak                                          | Kompleksitas                                    |
| :--------- | :------------------------------------------------------------------- | :------------------------------------------------------- | :----------------------------------------------- |
| **P1**    | **Pembuatan Rules Agent (`architecture-folder-structure.md`)**      | Kritis (Mencegah Sampah Baru Sejak Hari Ini)            | Rendah (Dokumentasi &amp; Regulasi)             |
| **P1**    | **Standarisasi Responsivitas Mobile &amp; Tablet**                  | Sangat Tinggi (UX Pengguna Mobile)                      | Sedang - Luas                                   |
| **P1**    | **Dead Code Elimination &amp; Pembersihan File `-` di Routes**      | Tinggi (Mengurangi Bundle &amp; Menghapus Kerumitan)    | Sedang                                          |
| **P2**    | **Pemisahan Domain VibeScrape dari VibeDesign**                     | Tinggi (Pemisahan Domain Bersih &amp; Worker Isolation) | Sedang - Luas                                   |
| **P2**    | **Migrasi Lucide React ke Hugeicons (Iconography Overhaul)**        | Sedang - Tinggi (Estetika Visual &amp; Tree-Shaking)    | Sedang - Luas (100+ File UI)                    |
| **P2**    | **Migrasi Node.js ke Bun — Runtime &amp; Performance Optimization** | Potensial Tinggi (Performance &amp; Runtime Efficiency) | Tinggi                                          |
| **P2**    | **Rebranding VibeEverything** $\rightarrow$ **everythings-vibe**    | Tinggi (Konsistensi Merek &amp; CLI)                    | Sedang (Banyak File &amp; Test Update)          |
| **P2**    | **Refactoring File Monster (\~2.000 Baris)**                        | Sangat Tinggi (Maintainability &amp; Clean Code)        | Tinggi (Arsitektural &amp; Butuh Kehati-hatian) |
| **P2**    | **Migrasi ke Feature-Driven Architecture (`src/features/`)**        | Sangat Tinggi (Kerapihan Struktur Jangka Panjang)       | Tinggi (Pindai &amp; Pindahkan File Bertahap)   |
| **P3**    | **Greenfield Workspace Routing Refactor**                           | Strategis (Pengalaman Workspace Single Shell)           | Tinggi                                          |
