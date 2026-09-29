# PRDFY / VibeEverything — Backlog & Roadmap (TODO)

## 📌 Architectural Backlog: Greenfield Workspace Routing Architecture Refactor

### 1. Ringkasan Ide & Kebutuhan
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

### 2. Evaluasi Opsi Solusi

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

### 3. Lingkup Perubahan & Dampak (Impact Assessment)
Jika refactor ini dieksekusi di masa mendatang, area berikut wajib diperbarui:
1. **Routing Files:** Penataan ulang file di `src/routes/`.
2. **Step Mapping Helper:** Penyesuaian `stepToRoute` & `stepToRouteTarget` di `src/lib/flow-step.ts`.
3. **Card History & Deep Linking:** Link resume di `src/components/history/history-card.tsx`.
4. **Auth & Redirection:** Callback login / onboarding redirect targets.
5. **Test Suites:** Penyesuaian assertions rute di 140+ file unit test dan E2E test.

---

### 4. Milestone Eksekusi (Ketika Siap Diimplementasikan)
- [ ] **Fase 1 — Desain Spesifikasi:** Putuskan antara Opsi 1 (Search-Param) atau Opsi 2 (Nested Layout Routes).
- [ ] **Fase 2 — Layout Shell Prototype:** Buat layout parent `/vibeplan/$id` dengan shared Navbar & breadcrumb.
- [ ] **Fase 3 — Migrasi View Anak:** Pindahkan implementasi Ask, Fitur, PRD, AC, Task, dan Kanban ke dalam outlet/switcher baru.
- [ ] **Fase 4 — Router Redirects:** Tambahkan backward-compatibility redirect dari `/ask/:id`, `/prd/:id`, dll. ke route baru agar link lama tidak 404.
- [ ] **Fase 5 — Verifikasi & Test Suite:** Update dan jalankan seluruh suite `pnpm check`, `pnpm test`, dan QA DevTools.
