# P11 Fix 04 — Penjelasan Desain Bermakna dan Kartu Hasil Frame

## Akar masalah templat sebelumnya

- `studio-conversation.ts` menulis ulang `content` pesan asisten pada **setiap** sinkronisasi job. Isinya dirakit di `studio-conversation-content.ts` dari `progress.screenNames` dan fase job, sehingga teks berubah antara "Rencana layar: …", "N halaman selesai diproses", dan "Revisi diterapkan" mengikuti status worker. Penjelasan dan status adalah string yang sama; transisi berikutnya menimpa yang sebelumnya dengan templat lebih pendek.
- `progress` hanya menyimpan `screenNames` dan hitungan. Tidak ada identitas frame, platform, revisi, maupun apa yang ada di HTML, sehingga kartu hasil hanya bisa menampilkan daftar nama (`ResultCard` + `describeStudioResult`).
- Baris asisten awal berisi templat statis "Permintaan diterima. Menunggu giliran." yang ikut tersimpan sebagai isi pesan.

## Sumber kebenaran baru

Penjelasan dirakit tanpa model dari tiga fakta yang sudah tersimpan:

1. **Blueprint** hasil perencanaan yang sudah ada (`productIdentity`, `screenPlan[].composition.primaryTask`/`role`, `navigationRole`, `initialScope`). Tidak ada perubahan skema perencanaan.
2. **Hasil job** per operasi (`jobIds` pesan), bukan seluruh canvas.
3. **HTML committed** frame: `services/studio-frame-facts.ts` membaca teks yang benar-benar ada (heading, navigasi, isian, tombol, jumlah form/tabel). Untuk revisi, `compareStudioFrameHtml` membandingkan teks tampil dua revisi committed (`studio_revisions`), dengan hasil `text` / `markup` / `identical`.

Setiap klaim tentang isi layar berasal dari fakta ini. Catatan keterbatasan prototipe hanya muncul bila layar memang memuat form/isian/tombol. Tidak ada klaim riset, kompetitor, publikasi, pembayaran, transfer, atau email; teks dari user/plan/HTML dinetralkan (`studio-conversation-text.ts`: tanpa Markdown, tautan, HTML, karakter kontrol).

## Pemisahan tiga lapisan

| Lapisan | Sumber | Tempat |
|---|---|---|
| Status operasional | `describeStudioStatus(message)` dari fase + hitungan job | satu baris `<output>` di bawah kartu |
| Penjelasan desain | `composeStudioAssistantContent` | Markdown di `message.content` |
| Hasil frame | `progress.frames` | `StudioChatResult` |

Konten **kosong** selama belum ada layar siap, sehingga transisi queued → planning → generating tidak menghasilkan paragraf. Konten yang sudah dibuat tidak ditimpa templat lebih pendek: bila komposisi baru kosong tetapi turn sudah punya frame siap, isi lama dipertahankan. Frame yang sudah siap **dibekukan** (revisi, fakta, perubahan) di `progress.frames`; edit Pencil atau operasi lain sesudahnya tidak menulis ulang laporan turn tersebut, dan sinkronisasi ulang tidak mengubah `updatedAt`.

## Perubahan skema progres

`studioMessageProgressSchema` mendapat `frames?` (frameId, name, viewport, status `ready|failed|pending`, revision, `facts?`, `changes?`). Opsional: baris lama tetap valid dan dirender lewat fallback berbasis nama. Tidak ada migrasi DB (kolom `progress` sudah `jsonb`).

## Arsitektur kartu hasil

- `utils/studio-chat-message.ts`: `describeStudioResult(progress, frames)` → judul ("N layar dibuat" / "N dari M layar dibuat" / "diperbarui") dan baris; id divalidasi terhadap frame project ini; penanda "Sudah diubah lagi" bila canvas sudah melewati revisi yang dilaporkan.
- `components/workspace/studio-chat-result.tsx` (komponen baru, menggantikan `ResultCard`/Disclosure HeroUI): header collapse/expand (`aria-expanded`/`aria-controls`), baris `button` native (Enter/Space), nama dipotong dengan `title` dan `aria-label` penuh, platform "Web UI"/"Mobile UI", status Sedang dibuat/Belum berhasil, "Tidak ada di canvas" bila frame sudah dihapus.
- `hooks/use-studio-thumbnail.ts` + `GET /api/studio/frame?thumbnail=1` (`services/studio-thumbnail-http.ts`): dokumen HTML committed yang diisolasi (`isolateStudioDocument`, CSP `script-src 'none'`), hanya milik user, hanya frame `ready`, dirender di iframe `sandbox=""` terskala. Konkurensi 3, cache 24 entri per `project:frame:revision`, dokumen milik project/frame lain ditolak. Gagal/memuat → metadata jujur (tanpa gambar karangan). Thumbnail tidak menentukan frame "ready" dan tidak memakai screenshot.
- Fokus: `onOpenFrame` → `StudioWorkspace.handleOpenResultFrame` (memeriksa frame ada, `selectFrame`, tutup drawer mobile) → `focusRequest {frameId, nonce}` → `StudioCanvas` meneruskannya ke `useStudioCanvasView`, yang menerapkan `focusFrame` hanya saat `nonce` berubah (perubahan bounds/device/seleksi tidak menggeser kamera sendiri). `studio-canvas.tsx` tetap 399 baris (batas keras ≤400).
- `studio-chat-markdown.tsx`: `hr` dibuang, blockquote disederhanakan; HTML mentah tetap di-skip dan gambar tetap ditolak.

## Dampak performa dan panggilan model

- **Nol panggilan model baru**: komposisi murni fungsi dari data tersimpan (diuji: jumlah generasi tetap 1 setelah tiga kali baca).
- Baca `studio_revisions` hanya untuk turn revisi yang belum dibekukan; turn lain tidak menambah query.
- Ekstraksi fakta berbatas (500 KB sumber, ≤6–8 entri, total) dan hanya sekali per frame saat menjadi siap.
- Thumbnail: satu request ringan per baris yang terlihat, tanpa job/kredit/revisi; kesiapan frame pertama tidak bergantung padanya.
- Tidak ada pemotongan kredit untuk menampilkan penjelasan.

## Pengujian

Tes baru (semuanya lulus): `studio-frame-facts-p11-fix04` (7), `studio-conversation-grounding-p11-fix04` (17), `studio-chat-result-p11-fix04` (11), `studio-chat-focus-p11-fix04` (3), `studio-conversation-p11-fix04.integration` (9). Tes lama `studio-chat-message` dan `studio-chat-panel-p4` disesuaikan ke kontrak baru.

Cakupan: tanpa templat "Rencana layar"/"selesai diproses"; status terpisah dari penjelasan; nama dan jumlah dari frame nyata; tanpa klaim riset/publikasi/pembayaran; satu vs banyak layar; add-screen; revisi (teks berubah / hanya markup / identik / tanpa pembanding); gagal dan parsial; baris hasil dari metadata; fallback thumbnail; fokus frame yang benar; judul panjang; Markdown aman; persistensi dan reload; operasi bersamaan tanpa duplikasi; stale update tidak menimpa; tenant isolation thumbnail.

Verifikasi: Biome 36 file bersih; `tsc --noEmit` hanya menyisakan enam diagnostik lama (`studio-design-blueprint.ts:110`, `tmp-ai-debug.ts`).

## Pertanyaan QA tersisa (tidak dijalankan: tanpa Browser QA di fase ini)

- Tampilan visual thumbnail pada dokumen desktop 1440 px yang sangat panjang dan pada dokumen berfont web (render nyata lintas browser).
- Kepadatan kartu hasil pada panel 320 px dengan banyak layar (>8).
- Apakah teks "Terlihat di layar" perlu dipersingkat bila heading panjang berulang.
- Turn lama (sebelum fix ini) tetap memakai isi tersimpan; mereka tidak dihitung ulang.

Tidak ada commit, push, merge, atau deploy.
