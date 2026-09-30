# everythings-vibe — Application Context (WAJIB DIBACA SEBELUM KERJA)

> **Status: MANDATORY SOURCE OF TRUTH**  
> File ini merangkum arsitektur, seluruh fitur aktif, aliran pengguna (user flows), skema basis data, dan aturan eksekusi untuk platform **everythings-vibe** (sebelumnya PRDFY).  
> Wajib dipahami secara mendalam sebelum melakukan eksplorasi kode, perubahan logika, refaktor, maupun pengujian.

---

## 1. Apa itu everythings-vibe?

**everythings-vibe** adalah platform pengembangan produk dan perencanaan cerdas bertenaga AI (*AI-powered product development & planning ecosystem*).  

Platform ini menjembatani ide mentah menjadi rencana implementasi siap-eksekusi bagi pengembang dan tim perangkat lunak:
- **Greenfield Planning:** Mengubah ide produk menjadi *Feature Tree*, PRD (*Product Requirements Document*) 8-seksi, kriteria penerimaan terstruktur (*Acceptance Criteria* / AC), diagram tugas ber-checklist (*Task Diagram Canvas*), hingga papan Kanban interaktif.
- **Existing Codebase Planning:** Menghubungkan repositori kode yang sudah ada (melalui sinkronisasi CLI) untuk menganalisis arsitektur eksisting dan merencanakan fitur baru secara kontekstual di atas fondasi kode tersebut.
- **Vibe Design Studio & Web Scraping:** Mengekstrak struktur UI dan aset dari situs web publik menjadi dokumen panduan token `DESIGN.md`, serta menyediakan studio prototipe HTML interaktif dengan live-preview dan revisi AI berbasis versi.
- **CLI Companion (`packages/cli`):** Utility command-line untuk sinkronisasi snapshot codebase lokal, inspeksi tugas/Kanban, dan ekspor spesifikasi proyek ke aturan agen AI (`AGENTS.md`, `.cursorrules`, `.claude/rules/project-spec.md`).

**Bahasa:** Seluruh antarmuka (UI copy), label, pesan error, dan prompt bawaan menggunakan **Bahasa Indonesia**. Istilah teknis pemrograman (misal: *server function*, *polling*, *routing*, *hook*, *mutation*, *caching*, *drag-and-drop*) tetap dipertahankan dalam Bahasa Inggris aslinya.

---

## 2. Tech Stack Terkini

| Layer | Teknologi | Peran & Catatan Implementasi |
| :--- | :--- | :--- |
| **Framework** | TanStack Start + TanStack Router | File-based routing di `src/routes/`, SSR selektif, hydration, dan server functions. |
| **UI & Styling** | React 19, Radix UI, shadcn/ui, Tailwind CSS 4, Framer Motion | Token visual di `@tailwindcss/vite`, komposisi CVA (`class-variance-authority`), ikon Lucide React. |
| **State Management** | Zustand (`src/store/index.ts`), TanStack Query v5 | Zustand murni in-memory di client; TanStack Query untuk caching, mutasi, dan sinkronisasi server state. |
| **Auth** | Better Auth 1.6 | Google + GitHub OAuth (`/api/auth/*`), penanganan sesi aman, tanpa email/password legacy. |
| **Database & ORM** | PostgreSQL 17 lokal, Drizzle ORM | Skema di `src/db/schema.ts`, migrasi via `drizzle-kit`, zero RLS (app-level tenancy `WHERE user_id = ?`). |
| **AI Gateway** | Vercel AI SDK v7 (`ai`, `@ai-sdk/openai`) via local 9router | Endpoint OpenAI-compatible, multi-tier model fallback, streaming SSE, depth directives. |
| **Validation** | Zod v4 | Validasi skema runtime, parameter API, dan payload formulir. |
| **Payment & Billing** | Midtrans Snap API + Webhook | Integrasi Snap token, verifikasi signature SHA512, settlement idempotency, reminder cron (`/api/cron/billing`). |
| **Email Service** | Resend | Pengiriman email transaksional dan notifikasi tagihan/kuota akun. |
| **Rendering & Parsing** | react-markdown, remark-gfm, rehype-highlight, Mermaid, DOMPurify | Rendering PRD markdown, diagram alur Mermaid interaktif, dan sanitasi HTML. |
| **Export & Bundling** | jszip, jsPDF | Unduhan bundel arsip ZIP, ekspor PDF, dan dokumen markdown mentah. |
| **Code Hygiene & QA** | Biome, Vitest, Playwright, `chrome-devtools` | Lint/format via Biome, 140+ unit test suite via Vitest, dan live browser QA via `chrome-devtools` MCP. |
| **Runtime & Build** | Vite 8, TypeScript 6, Node.js (pnpm) | Modul ESM ketat, path alias `#/*` dan `@/*`. |

---

## 3. Fitur Utama & Alur Pengguna (User Flows)

### A. Greenfield Planning Pipeline (Alur Produk Baru)

Alur linier dan monoton untuk mematangkan konsep baru dari nol:

```
[1. Landing / New] ──► [2. Guided Ask] ──► [3. Fitur Tree Map] ──► [4. PRD Generation]
  / atau /plan/new        /ask/$id              /fitur/$id               /prd/$id
                                                                            │
[7. Public Share & Export] ◄── [6. Kanban Board] ◄── [5. Task Whiteboard] ◄┘
  /prd/share/$token               /kanban/$id             /task/$id          /ac/$id (AC Gen)
```

1. **Inisiasi Proyek (`/`, `/plan/new`):**
   Pengguna memasukkan ide/deskripsi produk. Sistem membuat baris baru di `projects` (`step = 'question'`, `project_mode = 'greenfield'`).
2. **Klarifikasi Terpandu (`/ask/$id`):**
   - Sesi 1: Pertanyaan non-teknis seputar target audiens, model bisnis, dan domain produk.
   - Sesi 2: Pilihan preferensi stack teknologi dan arsitektur teknis.
   - Hasil dikompilasi menjadi prompt terstruktur dan disimpan di `codebase_ask_handoffs` untuk ketahanan terhadap refresh.
3. **Diagram Pohon Fitur (`/fitur/$id`):**
   - AI menghasilkan hierarki terstruktur: **Phases (Fase) -> Features (Fitur Utama) -> Subfeatures (Sub-fitur)**.
   - Ditampilkan pada kanvas interaktif (`feature-map-canvas.tsx`) yang mendukung zoom, pan, dan inspeksi detail node. Status tersimpan di `projects.featureTree`.
4. **Pembuatan & Streaming Dokumen PRD (`/prd/$id`):**
   - Menghasilkan PRD 8 seksi standar industri via server-sent events (`SSE`: `started` -> `thinking` -> `delta` -> `done`).
   - Dilengkapi *typewriter reveal animation* untuk meratakan respon model reasoning yang meledak sekaligus (*burst output*).
   - Dokumen disimpan secara *append-only* di `prd_versions`.
   - **Revisi Tanpa Batas (Gratis):** Panel obrolan menggunakan protokol patch presisi `:::UPDATE_SECTION[NamaSeksi]:::`, mengganti seksi tertentu tanpa merombak keseluruhan dokumen dan tanpa memotong kredit.
5. **Kriteria Penerimaan Terstruktur (`/ac/$id`):**
   - Menghasilkan Acceptance Criteria per fitur dengan format formal (Given/When/Then, skenario negatif, validasi batas, dan aspek keamanan). Disimpan di `ac_versions`.
6. **Papan Tugas & Diagram Interaktif (`/task/$id`):**
   - AI menyusun rincian tugas teknis berdasarkan pohon fitur dan AC.
   - Kanvas whiteboard menyajikan diagram alur implementasi dengan **antarmuka checklist** (`[ ]` / `[✓]` berikon `Check`).
   - Mendukung pemuatan bertahap (*task skeleton loading*) yang mempertahankan visual pohon fitur selagi tugas dikompilasi.
7. **Papan Kerja Kanban (`/kanban/$id`):**
   - Pelacakan eksekusi tugas (kolom: To Do, In Progress, Done) dengan dukungan drag-and-drop.
   - Filter fase dilengkapi ikon domain kontekstual (bukan sekadar teks datar).
   - Sinkronisasi polling periodik (10 detik) untuk menjaga konsistensi multi-klien.
8. **Ekspor & Pembagian Publik:**
   - URL publik hanya-baca ber-token aman (`/prd/share/$token`).
   - Ekspor instan ke Markdown, dokumen PDF, dan bundel arsip ZIP.

---

### B. Existing Codebase Mode (Alur Repositori Eksisting)

Memungkinkan tim merencanakan fitur baru pada basis kode yang sedang berjalan:
1. **Pendaftaran Codebase (`/codebases`, `/plan/codebase`):**
   Pengguna mendaftarkan repositori (`codebases`).
2. **Sinkronisasi via CLI (`packages/cli`):**
   - Menjalankan otentikasi sesi singkat (`codebase_sync_sessions`).
   - CLI memindai file, menyaring file biner/rahasia, memecah kode menjadi chunk terenkode base64 (`codebase_snapshot_files`), dan mencatat manifest di `codebase_snapshots`.
3. **Analisis Kontekstual AI:**
   - Server menjalankan ekstraksi dependensi, arsitektur, dan konvensi kode ke dalam `codebase_analyses`.
4. **Perencanaan Berbasis Konteks:**
   - Proyek baru dibuat dengan `project_mode = 'existing_codebase'` dan terikat ke `codebase_id`.
   - Seluruh prompt PRD, AC, dan Task memanfaatkan analisis kode eksisting agar solusi yang dihasilkan selaras dengan arsitektur saat ini tanpa reinvensi.

---

### C. Vibe Design Studio & Web Scraping (`/design/*`)

Sub-ekosistem desain visual dan ekstraksi antarmuka:
1. **Web Scraper Antarmuka (`/design/scrap`):**
   - Mengambil markup dari URL referensi pengguna (`scrapes`).
   - Membersihkan HTML, mengekstrak stylesheet/aset, dan menyusun dokumen pedoman token desain `DESIGN.md` (`scrape_documents`).
2. **Vibe Design Studio (`/design/studio`):**
   - Lingkungan pembuatan prototipe antarmuka interaktif berbasis web.
   - Pengguna memasukkan instruksi styling/komponen -> AI menghasilkan markup HTML/Tailwind siap pakai dengan live preview di browser.
   - Mendukung riwayat revisi berbasis versi (`studio_projects`, `studio_revisions`).

---

### D. Portal Manajemen Admin (`/admin/*`)

Dasbor khusus untuk pemantauan sistem dan operasional:
- **Ikhtisar Metrik:** Statistik proyek aktif, konsumsi kredit, dan pertumbuhan pengguna.
- **Manajemen Pengguna (`/admin/users`):** Daftar akun, status langganan, dan hak akses.
- **Pengawasan Proyek (`/admin/projects`):** Audit alur proyek dan status kesehatan pipeline.
- **Log Finansial & Kredit (`/admin/transactions`):** Rekonsiliasi transaksi Midtrans dan histori ledger kredit.
- **Pusat Umpan Balik (`/admin/feedback`):** Monitoring masukan dan laporan kendala dari pengguna.

---

## 4. Sistem Kredit Adaptif, Paket & Penagihan

### Skema Paket
| Paket | Biaya | Kredit Awal | Batas Fitur | Versi Dokumen |
| :--- | :--- | :--- | :--- | :--- |
| **Free** | Rp 0 | 2 kredit | PRD dasar (tanpa AC/Task/Kanban penuh) | Versi dasar |
| **Pro** | Rp 49.000 | 30 kredit | Akses penuh seluruh pipeline, ekspor ZIP/PDF | Hingga 30 versi |
| **Hengker** | Rp 149.000 | 105 kredit | Akses penuh prioritas, model flagship | Riwayat versi tanpa batas |

### Prinsip Operasional Kredit:
1. **1 Kredit = 1 Aksi Generate Baru:** Pembuatan awal PRD, AC, dan Task mengonsumsi kredit.
2. **Revisi Selalu GRATIS:** Seluruh perbaikan PRD via chat panel menggunakan protokol patch seksi dan tidak memotong kredit sepeser pun di semua tingkatan paket.
3. **Siklus Kredit Adaptif (*Adaptive Credit Lifecycle*):**
   - Operasi kredit melalui tahapan: `quoted` -> `reserved` -> `settled` (atau `released` bila operasi gagal/dibatalkan).
   - Seluruh mutasi dicatat secara mutlak dalam `credit_ledger_entries` (append-only ledger).
4. **Pencegahan Race Condition (*Atomic Burn*):**
   Pemotongan saldo menggunakan klausa SQL kondisional:  
   `WHERE credits_used + :charge <= credits`  
   Memastikan saldo tidak akan pernah menjadi negatif akibat pemanggilan paralel.

---

## 5. Ringkasan Skema Database Utama (`src/db/schema.ts`)

| Kategori | Tabel | Fungsi & Deskripsi |
| :--- | :--- | :--- |
| **Autentikasi & Sesi** | `users`, `sessions`, `accounts`, `verifications` | Akun pengguna Better Auth, profil tambahan (nama, peran, isAdmin), dan sesi login. |
| **Billing & Kredit** | `subscriptions`, `credit_operations`, `credit_ledger_entries`, `quotas`, `payments` | Model langganan bulanan/legacy, reservasi kredit adaptif, buku besar transaksi, kuota, dan status order Midtrans. |
| **Inti Proyek** | `projects` | Entitas induk produk: nama, deskripsi, mode (`greenfield` / `existing_codebase`), `step`, `featureTree`, dan soft-delete tombstone (`deletedAt`). |
| **Artefak Perencanaan**| `prd_versions`, `ac_versions` | Riwayat konten dokumen PRD dan kriteria penerimaan berbasis append-only versioning. |
| **Interaksi AI** | `conversations`, `messages`, `codebase_ask_handoffs` | Utas percakapan, pesan streaming, dan persistensi jawaban sesi Ask di server. |
| **Tugas & Kanban** | `tasks` | Tabel tugas terdenormalisasi (grup fitur, subtask jsonb, koordinat kanban, tracking status & referensi seksi). |
| **Existing Codebase** | `codebases`, `codebase_sync_sessions`, `codebase_snapshots`, `codebase_snapshot_files`, `codebase_analyses`, `codebase_generation_contexts` | Manajemen repositori, chunk file kode lokal, snapshot commit, ekstraksi manifest, dan analisis arsitektur AI. |
| **Vibe Design Studio** | `scrapes`, `scrape_documents`, `studio_projects`, `studio_revisions` | Scraping web, ekstraksi file `DESIGN.md`, dan proyek revisi prototipe visual interaktif. |
| **Utilitas & Sistem** | `api_keys`, `feedback`, `error_reports`, `rate_limits`, `notification_preferences` | Kunci REST API eksternal (SHA-256 hash), laporan bug, pembatasan laju (*rate limiting*), dan preferensi email. |

---

## 6. Model AI & Konfigurasi Engine (`src/lib/model-config.ts`)

- **Routing Gateway (9router):** Permintaan dikirim ke gateway internal OpenAI-compatible dengan penanganan *depth directive* dan seleksi model berbasis tier.
- **Tingkatan Model AI:**
  - *Free Tier:* Model cepat dan ringan untuk penyusunan ide awal.
  - *Pro Tier:* Model penalaran seimbang untuk sintesis PRD dan dekomposisi teknis.
  - *Hengker Tier:* Model kapabilitas tinggi untuk analisis codebase kompleks dan penyusunan dependensi rumit.
- **Rantai Cadangan (*Fallback Chain*):** Jika provider model utama mengalami timeout atau rate-limit, orchestrator secara otomatis mengalihkan streaming ke model cadangan dalam rantai tier yang sama tanpa memutuskan sesi pengguna.
- **Typewriter Reveal (`src/lib/typewriter-reveal.ts`):** Mengakomodasi model penalaran yang tidak memancarkan delta selama fase kalkulasi internal (~15-60 detik) kemudian memuntahkan seluruh teks seketika, memberikan pengalaman membaca bertahap yang mulus bagi pengguna.

---

## 7. Aturan Wajib Sebelum Mengubah Kode (Mandatory Execution Rules)

1. **Pahami Aliran Data Penuh:**
   Sebelum mengedit komponen atau rute, telusuri alirannya: `Route` -> `Component` -> `Server Action / Handler` -> `Drizzle Query` -> `Database`. Dilarang menebak arsitektur.
2. **Server-Only Isolation:**
   Modul server (`@/db`, Better Auth, driver `pg`) **wajib** diimpor secara dinamis di dalam fungsi handler (`const { db } = await import("@/db")`). Jangan pernah mengimpor modul server di top-level file komponen klien.
3. **Isolasi Tenant Tanpa RLS:**
   Karena Postgres tidak mengaktifkan RLS, **setiap query mutasi dan seleksi WAJIB menyertakan klausul `WHERE user_id = ?`**.
4. **Append-Only & Kemajuan Monoton:**
   - Dokumen PRD dan AC tidak boleh di-*overwrite*; selalu buat versi baru (`version + 1`).
   - `projects.step` hanya bergerak maju (`question` -> `fitur` -> `prd` -> `ac` -> `task`), tidak pernah mundur.
5. **Zero DB Tampering & Disiplin Live QA:**
   - Saat menjalankan pengujian langsung (*live testing*) menggunakan MCP `chrome-devtools`, **DILARANG KERAS memanipulasi kolom basis data secara manual** (misal mengubah `projects.step` atau status task langsung via SQL) demi melompati tahap yang gagal.
   - Bila ditemukan bug, perbaiki sumber kode aslinya, lalu **ulang pengetesan dari Flow 1 (titik awal perjalanan pengguna)**.
6. **Disiplin Atomic Commit (`atomic-commit.md`):**
   - Buat commit git yang terisolasi dan bermakna per perubahan logis.
   - Wajib lakukan `git push origin main` setelah seluruh pengujian selesai dan sebelum sesi diselesaikan.
7. **Patuhi Standar Visual & Bahasa:**
   - Gunakan Bahasa Indonesia untuk salinan teks antarmuka tanpa menerjemahkan istilah baku teknologi.
   - Tolak semua estetika AI slop (gradien murahan, *neon glow*, bayangan berlebihan, teks filler tak bermakna).
