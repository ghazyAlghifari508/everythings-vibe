# Architecture, Folder Structure & Code Hygiene Rules (MANDATORY)

> **Status: MANDATORY EXECUTION CONTRACT**  
> Repositori: **everythings-vibe**  
> Seluruh agen AI dan pengembang yang memodifikasi, menambah, atau me-refactor kode di repositori ini WAJIB mematuhi aturan arsitektur, organisasi folder, batas ukuran file, dan eliminasi kode mati (*dead code*) di bawah ini tanpa pengecualian.

---

## 1. Prinsip Utama: Arsitektur Berbasis Fitur (*Feature-Driven Colocation*)

Repositori **everythings-vibe** menggunakan pendekatan **Feature-Driven Architecture**. Kode dikelompokkan berdasarkan domain bisnis/fitur, BUKAN berdasarkan jenis file teknis semata (*layer-based* umum).

### Direktori Target: `src/features/<feature-name>/`
Setiap fitur mandiri memiliki direktori sendiri di bawah `src/features/`. Seluruh komponen, hooks, services, tipe, dan pengujian yang berkaitan erat dengan fitur tersebut wajib diletakkan bersama (*colocated*):

```
src/features/<feature-name>/
├── components/    # Komponen UI spesifik untuk fitur ini
├── hooks/         # Custom React hooks untuk stateful/headless logic fitur ini
├── services/      # Logika bisnis, server functions, external API call, orkestrator
├── types/         # Definisi tipe TypeScript & Zod schemas domain fitur ini
└── tests/         # Unit & integration test khusus untuk fitur ini
```

### Domain Fitur Resmi di everythings-vibe:
1. `src/features/greenfield/` (atau `vibeplan/`): Ask flow, Feature tree map, 8-section PRD, Acceptance criteria, Task whiteboard canvas, Interactive Kanban board.
2. `src/features/codebase/`: Codebase analysis, CLI sync session handling, Codebase explorer sidebar, Codebase chat workspace.
3. `src/features/studio/`: VibeDesign scraping, Studio editor, Blueprint synthesis, Canvas preview, Frame inspection.
4. `src/features/templates/`: VibeTemplate catalog, prompt shortcuts, boilerplate blueprints.
5. `src/features/billing/`: Midtrans Snap integration, credit ledger, atomic balance deduction, top-up packages, invoices.
6. `src/features/auth-settings/`: Better Auth integration, user sessions, user profile, API keys, notifications, feedback.
7. `src/features/admin/`: Admin metrics dashboard, user management, project oversight, transaction audit.

### Aturan Penempatan Kode:
* **DILARANG KERAS** melempar komponen baru ke root `src/components/` atau helper baru ke `src/lib/` jika file tersebut hanya dikonsumsi oleh satu domain fitur.
* **`src/components/ui/` (Shared UI Primitives):** Hanya diperuntukkan bagi komponen UI murni tanpa logika bisnis (shadcn/Radix primitives, Button, Input, Dialog, Dropdown, Tabs, dsb.).
* **`src/lib/` (Shared Infrastructure):** Hanya untuk modul infrastruktur yang digunakan oleh $\ge$ 3 fitur berbeda (database client `src/db/`, auth client/session `src/lib/session.ts`, base constants `src/lib/constants.ts`, base utilities).

---

## 2. Batas Ukuran File (*Anti-Monster File Ceiling*)

Kualitas kode ditentukan oleh modularitas dan keterbacaan (*readability*). Dilarang keras membuat atau membiarkan file membengkak menjadi file monster ribuan baris.

1. **Batas Ideal:** $\le$ 200 – 300 baris kode per file.
2. **Batas Keras (*Hard Ceiling*):** **Maksimal 400 baris kode per file.**
3. **Kewajiban Dekonstruksi:**
   - Jika sebuah file mendekati 350 baris, agent **WAJIB** mengekstraknya:
     - Logika state/side-effects $\rightarrow$ pindahkan ke Custom Hook (`src/features/<fitur>/hooks/use-<name>.ts`).
     - Bagian JSX/UI kompleks $\rightarrow$ pecah menjadi Sub-Komponen (`src/features/<fitur>/components/<sub-name>.tsx`).
     - Fungsi kalkulasi murni / parser $\rightarrow$ pindahkan ke Utility / Service terpisah.
4. **Pelanggaran Kritis:** Membuat file baru dengan panjang > 400 baris atau menambah ratusan baris ke file yang sudah monster adalah pelanggaran langsung terhadap standar kualitas *everythings-vibe*.

---

## 3. Thin Routes Layer di `src/routes/`

Folder `src/routes/` di TanStack Start/Router berfungsi murni sebagai **deklarasi endpoint URL dan routing entry point**, BUKAN tempat menumpuk implementasi UI atau bisnis logika yang berat.

### Aturan Folder `src/routes/`:
1. **Maksimal 100 – 150 baris per file route.**
2. Tanggung jawab file route hanya mencakup:
   - Mendefinisikan schema search params (Zod).
   - Menjalankan `loader` / server function data prefetching tipis.
   - Mengambil parameter URL dan merender komponen Container/View dari `src/features/`.
3. **LARANGAN FILE TEST BERTANDA MINUS (`-`) DI `src/routes/`:**
   - Di TanStack Router, tanda `-` digunakan sebagai ignore prefix agar generator rute tidak membuat URL. Namun, menaruh puluhan file test `-*.test.tsx` di dalam `src/routes/` mengotori struktur rute dan merupakan *bad practice*.
   - **Seluruh unit test dan integration test WAJIB dipindahkan ke folder `tests/` di domain fitur masing-masing** (misal `src/features/codebase/tests/` atau `tests/routes/`).
   - Folder `src/routes/` harus 100% bersih, hanya berisi file rute resmi (`index.tsx`, `$id.tsx`, `__root.tsx`).

---

## 4. Zero Dead Code & Zero Garbage Policy (*Anti-Deathcode*)

Kode mati memperberat bundle size, memperlambat proses build, memicu kebingungan, dan menurunkan kredibilitas repositori.

### Kontrak Anti-Deathcode:
1. **Tidak Ada File Yatim (*No Orphan Files*):** Setiap file, fungsi yang diekspor, atau komponen yang dibuat WAJIB memiliki pemanggil aktif (*active consumer*) di dalam alur aplikasi atau test suite resmi.
2. **Bersihkan Spike & Prototipe Usang:** File rute eksperimen lama (seperti `src/routes/demo/`), file scrap usang, atau mock fixtures yang sudah digantikan oleh integrasi riil **WAJIB DIHAPUS SELESAI TASK**.
3. **Pembersihan Unused Packages:** Setiap dependensi di root `package.json` atau `packages/cli/package.json` yang sudah tidak diimpor lagi wajib dihapus (`pnpm remove <package>`).
4. **Verifikasi Audit Dead Code:**
   Sebelum menyatakan pekerjaan selesai (*Done*), jalankan verifikasi unused export / dead code (misal via `npx knip` atau static search) untuk menjamin tidak ada sampah baru yang tertinggal.

---

## 5. Protokol Stop-on-Violation

Jika agen mendapati:
- File yang sedang dikerjakan sudah melampaui 400 baris dan terus membengkak tanpa dipecah;
- Ada dorongan untuk menaruh helper/komponen baru di folder sembarangan demi kemudahan singkat;
- Ada kode mati atau file sisa testing yang tidak dibersihkan;

**STOP.**  
Perbaiki arsitekturnya terlebih dahulu, lakukan refactoring modular, pisahkan concern ke folder fitur yang tepat, baru lanjutkan implementasi.
