# P11 Fix 03 — Pencil Editing and Undo

## Akar masalah

- **Frame:** observer sebelumnya menghitung zona prewarm 160 px sebagai viewport. Pool maksimum 12 bisa penuh sebelum frame yang benar-benar terlihat mendapat iframe. Frame yang sedang diinspeksi juga harus tetap hidup ketika bergeser keluar viewport. Fix 01 sudah menjadikan HTML terisolasi sebagai sumber tampilan, bukan screenshot; Fix 02 sudah memprioritaskan frame yang dipilih, tetapi belum memisahkan viewport dari prewarm.
- **Elemen:** bridge memilih marker terdalam, sementara host hanya menerapkan kebijakan elemen bermakna pada hover. Outline bisa mengikuti bounds anak padahal target yang ditafsirkan adalah leluhur. ID HTML duplikat juga bisa menghasilkan selector ambigu. Dokumen pengganti yang belum siap tidak boleh menerima aksi Pencil.
- **Edit dan sinkronisasi:** menu membuat `textarea` terpisah dan patch teks bekerja pada seluruh isi elemen leaf. Respons mutasi semula hanya diikuti pembacaan status; pembacaan yang lambat atau tampilan revisi sebelumnya dapat membuat edit belum terlihat di kanvas.
- **Undo:** keberadaan row riwayat langsung memunculkan feedback di sudut bawah kanvas, area yang juga digunakan kontrol zoom.

## Seleksi dan Edit Text

`use-studio-live-pool.ts` memprioritaskan viewport nyata di atas prewarm. Dalam Pencil, semua frame layak yang terlihat dan frame yang sedang diinspeksi mendapat slot, sekalipun melewati batas 12; batas normal dan pelepasan iframe offscreen tetap berlaku. Pemilihan elemen juga memilih frame induknya sebagai pilihan kanvas, sehingga frame tidak kehilangan slot ketika Pencil ditutup. Tombol Delete atau commit teks membersihkan target aktif.

Server menandai elemen bermakna saja dan menggunakan path struktural unik untuk ID HTML yang duplikat. Hit testing hover dan klik memakai marker DOM yang sama. Bounds dari `getBoundingClientRect()` iframe sudah memperhitungkan scroll internal, dipotong di artboard, lalu mengikuti transform pan/zoom kanvas. Resize dan scroll memperbarui bounds tanpa mengubah identity. Outline hover 1 px dan outline seleksi 2 px dalam screen space; animasi reveal dihapus. Menu memakai `DropdownMenu` bersama (Radix): portal dengan collision boundary kanvas, tombol pemicu berukuran screen space, dan kontrol tutup. Aksinya hanya Edit Text (bila didukung), Edit with AI, dan Delete; tidak ada Pilih induk.

Edit Text membuka `contenteditable="plaintext-only"` pada rentang teks tunggal di posisi aslinya, bukan textarea host. Tidak ada entry lewat double-click. Enter menyimpan, Shift+Enter menyisipkan newline teks, Tab menyimpan dan melanjutkan fokus, blur menyimpan kecuali saat IME masih aktif, Escape membatalkan, dan Ctrl/Cmd+A terbatas pada teks yang sedang diedit. Paste mengambil `text/plain`; Undo native berlaku selama edit, dan Undo revisi digunakan setelah penyimpanan. Sesi edit diakhiri saat mode atau dokumen berubah. Bridge memeriksa window pengirim, origin, project/frame, revisi, hash, channel dan UUID sesi; respons terlambat tidak boleh mengubah target baru.

## Persistensi, scope, dan renderer

- **Edit Text/Delete:** patch mengubah source range tunggal dan memvalidasi parse HTML sambil mempertahankan HTML di luar scope. Edit Text mempertahankan icon, emphasis, link, sibling, class, dan parent. No-op tidak menulis row atau pesan. Perubahan dan history dipublikasikan dalam satu transaksi berotorisasi tanpa LLM, kredit, job generasi, atau shimmer generasi. Draft di iframe bukan sumber kebenaran dan dipulihkan saat editor ditutup; gagal simpan tidak memublikasikan HTML draft. Saat respons jaringan hilang, klien membaca kembali status/riwayat tanpa otomatis mengulang mutasi.
- **Edit with AI:** pilihan masuk ke composer hanya lewat tindakan eksplisit. `evvibe-design` tetap memberikan guidance revisi elemen yang ringkas; output baru melewati batas schema, scope, keamanan HTML, dan revision/hash sebelum Auto Apply. Tidak ada browser komponen, tahap Apply tambahan untuk output baru, atau perubahan aturan generasi halaman. Kandidat lama hanya dapat diterapkan secara eksplisit. Undo terhadap basis yang sudah diganti ditolak.
- **Renderer:** respons mutasi menerbitkan revision dan HTML terkonfirmasi langsung ke status workspace; respons status yang kedaluwarsa tidak dapat mengembalikan artboard ke revisi lebih lama. Renderer menyimpan predecessor sampai iframe untuk revisi berikutnya siap, tetapi menonaktifkan inspeksi pada predecessor. Pencil, mode normal, pergantian device, dan reload memakai HTML tersimpan yang sama. Prototype mengambil manifest dari HTML committed; setelah Delete, trigger tab yang tidak lagi memiliki panel tidak lagi dipakai runtime, tanpa menulis ulang markup lain atau skema DB.

## Feedback dan durable Undo

`ToastNotice` bersama ditampilkan di lane header, di luar kotak layout kanvas dan chat. Feedback operasi baru memakai label status, Undo, dan tombol tutup tanpa badge sukses. Timeout 6 detik berhenti ketika toast di-hover atau difokuskan; UI mendukung reduced motion. Memuat riwayat tidak memicu ulang feedback. Undo tetap tersedia di **Menu project → Riwayat revisi** untuk revisi yang kompatibel. Error ditampilkan sebagai alert terpisah, bukan sebagai sukses.

## Verifikasi

| Pemeriksaan | Hasil |
|---|---|
| Vitest terarah: selector/bridge, React, persistensi, AI, prototype, dan feedback | 282 tes lulus dalam 26 file |
| Vitest setelah pemisahan transport mutasi dan metadata prototype | 76 tes lulus dalam 8 file (subset, tidak ditambahkan ke total di atas) |
| Biome pada file TS/TSX yang disentuh | 50 file lulus |
| `pnpm exec tsc --noEmit` | Exit 2: enam diagnostik lama di `studio-design-blueprint.ts:110` dan `tmp-ai-debug.ts:9–11`; tidak ada diagnostik di file P11 Fix 03 |

Regresi mencakup seleksi frame pertama/tengah/terakhir sesudah lazy mount, geometri pada zoom 0,35–2, daftar aksi menu, sesi inline dan pesan terlambat, preservasi mixed content, paste teks, Escape/IME, revision no-op, kegagalan jaringan, tenant mismatch, AI scoped/Auto Apply, kandidat lama, dan Undo untuk edit tekstual, Delete, serta AI. Tes renderer memeriksa HTML committed yang sama saat Pencil, mode normal, pergantian device, Refresh, dan remount. Tes workspace dan feedback memeriksa bahwa lane header terpisah dari kanvas/chat, countdown berhenti saat diinteraksikan, dan Undo riwayat tetap tersedia setelah toast ditutup.

## Batasan

- Edit Text hanya ditawarkan bila ada tepat satu node teks langsung yang dapat dipetakan kembali ke source. Untuk beberapa rentang langsung yang terpisah markup, pilih node anak yang memang dapat diedit atau gunakan Edit with AI; aplikasi tidak akan mengganti isi parent secara destruktif. Tampilan newline setelah commit mengikuti aturan `white-space` dari desain asli.
- Drawer chat mobile yang modal tetap menutupi header ketika terbuka. Undo persisten dapat digunakan setelah drawer ditutup.
- Verifikasi menggunakan unit, komponen React/JSDOM, dan integrasi database; tidak ada Browser QA, Playwright, atau pemeriksaan rendering native lintas browser pada tahap ini.

Tidak ada commit, push, merge, atau deploy.
