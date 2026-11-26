# P8 — Browser QA Greenfield: full workflow, visual regression, acceptance

Status: **selesai dengan temuan yang diperbaiki**. Skrip B1–B8 dijalankan pada browser nyata terhadap dev server lokal. Ringkasan: happy path nyata dari pembuatan proyek → Ask → Fitur → PRD → revisi → AC → Task → Kanban berjalan tanpa regresi yang memblokir. Tujuh temuan diperbaiki akar masalahnya; sebagian skenario tetap **Not Verified** dan dicatat jujur di bawah.

## 1. Environment dan batas akses

| Item | Nilai |
| --- | --- |
| Branch / HEAD awal | `feature/vibeplan-greenfield` · `7340d1a8` |
| Server | `http://localhost:3000` (dev server sudah berjalan, tidak dinyalakan ulang) |
| AI gateway | 9Router `http://localhost:20128` (aktif) |
| Database | PostgreSQL lokal (`novap lan_local`), hanya dibaca untuk verifikasi |
| Browser tool | Chromium headless via omp `browser` contract + Chrome DevTools MCP |
| Akun test | akun pemilik proyek (email di-redact), role user, plan `hengker`, `active_paid` |
| Kredit | 195 total; `credits_used` 98 → 108 selama sesi (+10: PRD 1, revisi PRD 1, AC 3, Task 5) |
| Project test | `cde6031a-…` — ide inventori/POS UMKM; produk "StockLite POS & Inventory UMKM" |
| Project kedua | `659961d3-…` — hanya untuk menangkap visual skeleton PRD pre-token; generasinya dibatalkan (Stop) sehingga `prd_versions` tetap 0 dan kredit tidak bertambah |
| Viewport | 1440×900, 1365×768, 1024×768, 768×1024, 430, 390×844, 360 |
| Tema | dark (default) dan light |
| Metode | login lewat cookie session Better Auth yang ditandatangani (akun test). Tidak ada mutasi DB, tidak ada intercept/response palsu, tidak ada suntikan artifact. |

Tidak ada deploy, publish, merge, pembayaran, atau pembelian paket. Tidak ada kredensial/session token yang ditulis di laporan ini.

## 2. Hasil skenario

| ID | Scenario | Expected | Actual | Result | Evidence |
| --- | --- | --- | --- | --- | --- |
| B1 | Entry + Ask | Satu project, `/vibeplan/<id>/ask`, 5 tahap, jawaban pulih setelah refresh, Skip jalan, CTA ke Fitur | Project dibuat dari `/plan/new` (Web), redirect ke `/vibeplan/<id>/ask`; navbar tepat Ask/Fitur/PRD/AC/Task (tanpa Kanban, tanpa bar "VibePlan <nama>"); 6 jawaban sesi 1 (satu di-Skip) + 5 pilihan stack sesi 2; reload memulihkan 6/6 dan status "Dilewati"; "Lihat Fitur" → `/vibeplan/<id>/fitur` (ID sama) | Passed | snapshot 6/6 setelah reload; URL kanonik; hitungan tahap `aria-current` |
| B2 | Feature Tree | Judul statis, satu status, skeleton bertitik, CTA nonaktif tanpa duplikasi, tree tersimpan, refresh tidak generate ulang | `Feature Tree` statis + satu `<output>` "Menyusun daftar fitur..." + kanvas `aria-busy`; CTA `Generate PRD` disabled dengan hint tunggal (klik tidak interaktif); **tepat 1** `POST /api/features/generate`; tree nyata (10 fitur + subfitur, fase 1–3) tersimpan; reload menampilkan tree tanpa request generate | Passed | log network (1 POST), screenshot skeleton & tree |
| B3 | PRD live | Pre-token: checklist kanan + kanvas skeleton tanpa copy; streaming: Markdown bertambah sebelum `done`; selesai: tersimpan, no toolbar v1 | Pre-token: checklist 8 seksi + spinner seksi aktif, kanvas **text skeleton 15 blok tanpa satu pun teks** (`data-testid="prd-skeleton"`, `textContent === ""`, label hanya `aria-label="Menyusun PRD"`, `role=status` di kanvas = 0), tanpa kartu "Menganalisis/Menulis", tanpa typing dots, tanpa bar judul; saat token masuk Markdown bertambah nyata sebelum selesai (heading/TOC live) sementara checklist belum semua hijau; selesai: `PRD SELESAI`, dokumen utuh, CTA `Generate AC`, satu `POST /api/chat`, tidak ada toolbar Pratinjau | Passed | screenshot pre-token (skeleton) / streaming / persisted; log 1 POST |
| B4a | Chat toggle | Panel tertutup → dokumen melebar, TOC tetap; tanpa ghost/overlay; dibuka kembali dengan riwayat | Animasi geser dari/ke dinding kanan terbukti: menutup 498→334→191→102→46→14→1 px dalam ~300 ms; membuka 1→95→267→371→437→484→498 px dalam ~327 ms; `visibility:hidden` saat tertutup (tanpa tab stop/hitbox), riwayat chat utuh | Passed (setelah fix F1/F2/F3) | sampel lebar per frame dari pointer nyata |
| B4b | Composer focus | Klik padding kosong composer → textarea fokus; ketik → draft; kirim sekali | Klik area padding (bukan textarea) memfokuskan `TEXTAREA` (`document.activeElement`), ketikan masuk draft dan tombol kirim aktif | Passed | `activeElement` + nilai textarea |
| B4c | Stop hit-test | Klik Stop nyata saat request aktif membatalkan sekali | Tombol `Hentikan proses` 32×32 di kanan bawah, hit-target milik tombol (bukan overlay); klik nyata membatalkan revisi: dokumen tetap 44.440 char, composer aktif lagi, **tidak ada** baris `prd_versions` baru, kredit tidak bertambah | Passed | DB `prd_versions` = 1 baris sebelum/sesudah; label tombol berubah |
| B5 | Versi + Diff | v1 tanpa toolbar; v2 satu kontrol `Versi 2 ▾`; pilih versi lama; compare arah lama→baru; keluar tanpa ubah step/versi | Revisi nyata lewat composer selesai dan tersimpan sebagai v2 (`+1` kredit, `change_summary` terisi). v1: tanpa kontrol. Setelah v2: **satu** kontrol `Versi 2` (menu: Versi 2 `(Terbaru)` checked, Versi 1, Bandingkan perubahan). Pilih Versi 1 → dokumen kehilangan kolom khusus v2, label `Versi 1`; pilih Versi 2 kembali. Compare menampilkan `Versi 1 → Versi 2`, kontrol versi disembunyikan, "Kembali ke dokumen" mengembalikan fokus ke trigger; URL/step tidak berubah | Passed | DB `prd_versions` v1/v2; menu `menuitemradio`; fokus aktif setelah kembali |
| B6 | Generate AC | URL `/ac` ID sama, satu loader pre-token, TOC dari heading nyata, tersimpan, CTA Task | `/vibeplan/<id>/ac`; satu `Menyusun Acceptance Criteria...`; TOC terisi heading nyata (Glossary/feat-1/feat-2/feat-3); dokumen tumbuh; tersimpan `ac_versions` v1 (47.226 char) `+3` kredit; CTA `Generate Task` aktif; tanpa bar proyek/step 6 | Passed | DB `ac_versions`, `projects.ac_status=completed` |
| B7 | Task + Kanban | Judul statis, satu status, skeleton, task nyata, kontrol Kanban, 5 tahap, status persist | `Task Breakdown` statis + satu `Menyusun task...` + skeleton memakai node fitur; hasil: 42 task hierarkis (fitur → task → subtask) tersimpan, `+5` kredit, `Pilih Implementasi` aktif; kontrol `Kanban` → `/kanban`; stepper tetap 5, Task `(Tahap saat ini)`, tanpa langkah Kanban; reload board mempertahankan 0/42 | Passed (dengan catatan B7c) | screenshot tree & board; DB `tasks` = 42 |
| B7c | Ubah status task via UI | Ubah status lewat UI, refresh, persist | Greenfield Kanban bersifat proyeksi read-only: tidak ada kontrol mutasi status di UI; `/api/kanban/update-status` hanya dipakai CLI (tidak ada pemanggil frontend), dan header memang mengarahkan ke CLI. Perubahan status tidak dapat dipicu lewat UI tanpa menambah fitur baru | **Not Applicable / Not Verified** | audit komponen kanban + pemanggil endpoint |
| B8ai | History | Resume dari halaman & drawer, artifact utuh | `/history?workspace=greenfield` menampilkan proyek dengan badge Task, resume ke `/vibeplan/<id>/kanban` tanpa generate; drawer (hamburger di Home) memuat 17 item dan resume ke route terakhir | Passed (setelah fix F5) | daftar item + navigasi |
| B8b | Deep link + Back/Forward | Tiap child memuat artifact tersimpan tanpa generate; back/forward tidak mundurkan step | 6/6 child (`ask/fitur/prd/ac/task/kanban`) load penuh tanpa satu pun request `features/prd/ac/task generate`; Back → `/history`, Forward → kanban dengan step Task tetap | Passed | hitung request setelah `clearRequests` |
| B8c | Legacy URL | Redirect 307 ke child kanonik, tanpa loop | `/ask /fitur /prd /ac /task /kanban` + id → 307 masing-masing ke `/vibeplan/<id>/<tahap>` | Passed | 6/6 URL final |
| B8d | Responsive | Tidak ada clipping/overflow; komposisi tetap konsisten | 360/390/430/640/768/900/1024/1100/1280/1440: `nav.scrollWidth == nav.clientWidth`, `documentElement` overflow 0; label tahap tampil ≥1024, titik di bawahnya; TOC + tab Dokumen/Chat mobile; sheet tablet 60vh. Satu temuan clipping navbar diperbaiki (F6) | Passed (setelah fix F6) | pengukuran lebar per viewport |
| B8e | Light/Dark | Identitas visual tetap, kontras terbaca | Light dan dark merender struktur 3-pane identik (TOC, dokumen, versi, chat), tanpa overflow; `data-theme`/`class` sinkron | Passed | screenshot light & dark |
| B8f | Public PRD share | Share sah terpisah, tanpa kebocoran | Tidak ada token share valid pada sesi ini; route `/prd/share/<token>` tidak diuji | **Not Verified** | — |
| B8g | Tenant isolation | Proyek pihak lain ditolak | `/codebases/<id milik user lain>` → "Codebase tidak dapat dimuat" | Passed | halaman error, bukan data |

### Baseline error/warning yang bukan regresi

- Tiga warning `[tanstack-router] … will not be code-split` (`bantuan.tsx`, `templates.tsx`, `plan/index.tsx`) — sudah ada sebelum P8.
- `net::ERR_ABORTED` pada `POST /api/chat`/`GET /api/kanban/stream` hanya muncul saat request memang dibatalkan (uji Stop) atau saat navigasi meninggalkan halaman.
- Tidak ada console error pada halaman workspace setelah reload bersih.

## 3. Temuan dan perbaikan

| ID | Severity | Temuan | Akar masalah | Fix | Status |
| --- | --- | --- | --- | --- | --- |
| F1 | Medium (UX) | Tombol Chat membuka/menutup side panel secara instan | Panel memakai `md:hidden` saat tertutup (`display:none`) sehingga tidak bisa dianimasikan | Panel tetap ter-layout; tinggi mengikuti kolom, lebar dianimasikan `0 ↔ var(--chat-width)` dengan tepi kanan menempel dinding (geser dari/ke kanan), sheet tablet naik dari bawah; `visibility` diskret menjaga tanpa tab stop | Fixed, diverifikasi via sampel lebar per frame |
| F2 | Medium | Resize manual side panel terasa delay | Transisi toggle (`transition-[width]`) juga berlaku saat drag | Transisi hanya aktif saat tidak drag (`isDraggingRight`); saat drag `transition-property: all`/`0s` (tanpa animasi), lebar mengikuti pointer | Fixed, terukur |
| F3 | High (layout) | Isi panel chat tidak mengisi tinggi panel; composer melayang di tengah | `xl:flex-none` pada wrapper kolom mematikan `flex-1` (sumbu utama vertikal) | `flex-none` dihapus; lebar tetap dipatok `xl:w-[var(--chat-width)]` | Fixed (ditemukan saat QA) |
| F4 | Medium | Pre-token PRD menampilkan spinner/copy "Menyusun PRD..." di kanvas | Fallback `GenerationProgress` dirender di tengah | Fallback dihapus; kanvas menampilkan **text skeleton** tanpa teks (label hanya untuk assistive tech) sampai token pertama | Fixed + tes regresi |
| F5 | High (fungsional) | History drawer gagal memuat: "Gagal memuat riwayat dari server" | Drawer memanggil `loadHistory()` tanpa payload; validator Zod menolak `undefined` (`expected object`) sehingga server function error (HTTP 200 + error terserialisasi) | `historyFilterSchema` diberi `.default({})` sehingga payload kosong = "semua" | Fixed + tes regresi; drawer memuat 17 item |
| F6 | Medium (responsive) | Navbar overflow: CTA terpotong di 390 px; stepper berlabel meluap di 768 px | Wordmark logo + stepper berlabel muncul terlalu dini | Wordmark disembunyikan `<sm`; stepper penuh + label tahap pindah ke `lg` (≥1024); stepper ringkas untuk <1024 | Fixed; semua viewport 360–1440 fit |
| F7 | Low (copy) | Kontrol menuju Kanban berlabel "Task" di halaman Task | Label lama menyamai nama tahap | Sempat diubah ke `Kanban`, lalu **dikembalikan ke `Task`** atas keputusan user (lihat gambar referensi user) | Reverted |
| F8 | Low (test) | Tes lama `-home-mode.test.ts` mematok rute legacy `/ask/$id` | Sisa migrasi nested route (P1) | Asersi diperbarui ke `/vibeplan/$id/ask` (kontrak kanonik) | Fixed |

Catatan yang **tidak** diubah (dilaporkan apa adanya):

- **Dev-only overlay**: tombol melayang TanStack Devtools (hanya ada di `pnpm dev`) menempati pojok kanan bawah dan bisa menutupi tombol kirim/Stop composer. Saat QA launcher disembunyikan lewat preferensi devtools sendiri. Build produksi tidak membawa devtools, jadi bukan bug produk.
- **Flash CTA**: setelah reload, pengguna berbayar sempat melihat `Upgrade ke Pro` <1 detik sebelum query plan selesai. Transien.
- **Kanban read-only**: Greenfield Kanban tidak punya UI mutasi status (status dimiliki CLI sync) — lihat B7c.
- **Diff** menampilkan penanda internal `<!-- SECTION: … -->` pada mode compare. Kosmetik.
- `aria-busy` kanvas Task `false` saat generasi berjalan karena node fitur sudah menjadi konten kanvas; status tunggal tetap benar.

## 4. Verifikasi non-browser (exit code aktual)

| Perintah | Hasil |
| --- | --- |
| `npx biome check <9 file tersentuh>` | exit 0, "No fixes applied" |
| `npx vitest run src/lib/history.test.ts src/features/greenfield/tests/{prd-viewer,p5-view-generation,prd-chat-toggle,kanban-board}.test.tsx src/components/layout/history-drawer.test.tsx` | exit 0 — 6 file, 71 tes lulus |
| `npx vitest run src/components/layout` | exit 0 — 8 file, 100 tes lulus |
| `npx vitest run src/features/greenfield` | exit 0 — 87 file, 735 tes lulus |
| `npx tsc --noEmit` | hanya error lama `studio-composer.test.tsx:241` (`Promise.withResolvers`, ES2022) — di luar cakupan |
| `pnpm build` | exit 0 — `built in 20.87s`, `.output/nitro.json` dihasilkan |

## 5. Sisa blocker / Not Verified

1. **B7c** — mutasi status task lewat UI tidak tersedia untuk Greenfield (by design: proyeksi CLI). Tidak diuji, bukan klaim lulus.
2. **B8f** — public PRD share tidak diuji karena tidak ada token share sah.
3. Composer mobile (target 44 px, Stop di viewport sempit) tidak dapat diuji ulang setelah PRD terkunci read-only; hanya terverifikasi di desktop.
4. Layar AC/Task/Kanban hanya diperiksa di desktop + 768/390 untuk overflow; kombinasi penuh tema × perangkat tidak dieksplorasi menyeluruh.