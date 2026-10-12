# TASK: Perbaikan Menyeluruh VibeDesign Scrape — Reliability, Design System Fidelity &amp; Professional UI/UX

Repository: `ghazyAlghifari508/everythings-vibe`  
Target branch: `feature/vibedesign-scrape`

## 0. Instruksi Utama — Wajib Dipatuhi

Lakukan perbaikan menyeluruh terhadap fitur VibeDesign Scrape berdasarkan masalah, temuan source code, screenshot, dan referensi [DESIGN.md](http://DESIGN.md) yang diberikan user.

**Ini adalah implementation task, bukan sekadar analisis atau membuat rencana.** Setelah memahami repository, implementasikan seluruh perbaikan yang relevan hingga selesai.

Sebelum coding:

1. Pastikan berada di branch yang benar dan periksa HEAD, working tree, serta perubahan yang sudah ada. Jangan menganggap commit pada audit sebelumnya masih merupakan HEAD terbaru.
2. Baca [`AGENTS.md`](http://AGENTS.md) dan seluruh rules yang berlaku sampai selesai. Pahami lalu terapkan, bukan sekadar membaca atau menyebutkan rules.
3. Pelajari arsitektur fitur Scrape yang sudah ada, termasuk mode Crawl Website, Generate [DESIGN.md](http://DESIGN.md), Scrape HTML, Scrape Images, job worker, persistence, API, polling, preview, dan UI hasil.
4. Audit alur data aktual dari browser capture sampai hasil muncul di frontend. Jangan membuat asumsi berdasarkan nama fungsi.
5. Identifikasi implementasi yang dapat digunakan kembali agar tidak terjadi duplikasi atau regresi.
6. Susun implementation checklist berdasarkan masalah dan akar penyebabnya. Kerjakan sampai seluruh kriteria penerimaan terpenuhi.

**Jangan mengubah fitur di luar scope, jangan melakukan redesign seluruh aplikasi, dan jangan merusak mode scraping yang saat ini sudah bekerja.**

---

# 1. ATURAN UI/UX PALING PENTING: COMPONENT-FIRST, BUKAN GENERATE UI DARI NOL

Saya sangat tidak puas dengan kebiasaan AI coding agent menghasilkan UI generik, seadanya, dan terlihat seperti hasil AI template.

Mulai task ini, terapkan pendekatan **mandatory component discovery and reuse**.

## Sumber komponen yang WAJIB dieksplorasi

- ReactBits: [https://reactbits.dev/](https://reactbits.dev/)
- shadcn/ui: [https://ui.shadcn.com/](https://ui.shadcn.com/)
- Magic UI: [https://magicui.design/](https://magicui.design/)
- HeroUI: [https://www.heroui.com/](https://www.heroui.com/)
- Thinking Orbs: [https://www.thinkingorbs.com/#orbs](https://www.thinkingorbs.com/#orbs)
- Komponen existing di repository.
- Library komponen berkualitas lain jika pilihan di atas belum memenuhi kebutuhan.

**WAJIB mencari komponen existing atau siap pakai sebelum memutuskan implementasi visual untuk setiap area yang membutuhkan perbaikan.**

Ketentuan:

1. Audit komponen lokal terlebih dahulu, lalu eksplorasi library eksternal yang relevan.
2. Untuk setiap area UI, tentukan komponen konkret yang sesuai, bukan sekadar mengambil inspirasi visualnya.
3. **Jika tersedia komponen yang kompatibel dan sesuai kebutuhan, WAJIB gunakan komponen tersebut.**
4. Jangan membuat spinner, thinking animation, accordion, progress indicator, card pattern, atau visual interaction custom apabila sudah tersedia komponen yang tepat.
5. Jika komponen tidak tersedia atau tidak kompatibel, jelaskan alasan teknisnya sebelum membuat implementasi sendiri.
6. Custom component hanya boleh menjadi pilihan terakhir. Hasilnya harus mengikuti kualitas design system existing, bukan fallback generik.
7. Periksa dokumentasi, dependencies, kompatibilitas React/Tailwind, accessibility, lisensi, serta dampak bundle sebelum integrasi.
8. Jangan memaksakan komponen eksternal yang ternyata tidak cocok hanya untuk memenuhi nama library. Pilih yang benar-benar relevan.
9. Jangan hanya memasang dependency atau mengimpor komponen lalu tetap mempertahankan UI custom yang sama. **Komponen yang dipilih harus benar-benar digunakan.**
10. Jangan mengubah komponen berkualitas yang sudah benar menjadi implementasi lebih sederhana hanya demi menghemat waktu coding.

Sebelum implementasi UI, buat **component selection audit** singkat di catatan kerja berisi area UI, komponen existing/eksternal yang diperiksa, komponen terpilih, dan alasan pemilihannya.

Tidak perlu menunggu persetujuan user untuk melanjutkan implementasi.

### Standar kualitas UI

Target adalah kualitas SaaS profesional seperti Linear, Vercel, Notion, dan tools developer yang matang.

Hindari:

- Generic AI gradients dan penggunaan warna dekoratif yang tidak relevan.
- Card berlapis-lapis tanpa tujuan.
- Excessive borders, badges, shadows, spinner, dan animasi.
- Layout dengan whitespace yang tidak proporsional.
- Teks sangat kecil dalam container besar.
- Tombol dengan visual hierarchy buruk.
- Elemen dengan tinggi atau lebar yang tidak mengikuti konten.
- Placeholder content atau komponen visual palsu.
- Warna hardcoded yang mengabaikan theme tokens.
- Hasil UI yang hanya bagus pada satu ukuran layar.
- Implementasi yang terlihat selesai secara teknis tetapi secara visual masih mentah.

Pastikan light mode, dark mode, responsive behavior, keyboard interaction, focus states, contrast, dan reduced-motion didukung.

---

# 2. Pulihkan UI Progress Scraping

File awal yang perlu diperiksa:

- `src/components/design/scrape-progress.tsx`
- `src/components/ui/thought-line.tsx`
- `src/app/globals.css`
- `src/hooks/use-scrape-status.ts`
- Source worker dan metadata aktivitas terkait

## 2.1. Kembalikan progress bar yang benar-benar terlihat

Audit sebelumnya menemukan bahwa segmen bar menggunakan elemen `span` dengan child absolute-positioned, tetapi tidak mempunyai tinggi eksplisit.

Periksa penyebab sebenarnya dan perbaiki.

Target:

- Progress bar horizontal terlihat jelas.
- Tahapan selesai memiliki status visual yang jelas.
- Tahapan aktif menggunakan **continuous indeterminate animation**.
- Animasi bergerak halus selama tahap tersebut benar-benar aktif.
- Animasi berhenti atau berpindah ketika status backend berubah.
- Segmen berikutnya tetap netral sampai tahapnya dimulai.
- Jangan menampilkan persentase yang tidak benar-benar diukur.
- Jangan menggunakan artificial delay atau fake timer agar proses tampak lebih lama.
- Dukung `prefers-reduced-motion`.

Progress bar harus mencerminkan **real persisted server stages**, bukan progress simulasi.

## 2.2. Hilangkan spinner yang berlebihan

Pada UI sekarang terdapat spinner di panel kiri, kanan atas panel progres, dan tahapan proses.

Perbaiki menjadi:

- **Panel kiri:** gunakan `ThoughtLine`.
- **Panel kanan atas:** hapus spinner.
- **Daftar tahapan:** gunakan status indicator yang sederhana, dengan check untuk selesai dan penanda aktif yang tidak berlebihan.
- **Progress bar:** menjadi indikator utama bahwa tahap sedang berjalan.

Jangan menambahkan spinner baru untuk menggantikan spinner yang dihapus.

## 2.3. Gunakan ReactBits ThoughtLine yang benar

Referensi resmi:

[https://reactbits.dev/micro/thought-line](https://reactbits.dev/micro/thought-line)

User menginginkan komponen `ThoughtLine` ReactBits, **bukan custom thinking UI buatan agent**.

Audit implementation `src/components/ui/thought-line.tsx` terlebih dahulu. Periksa apakah implementasinya masih mengikuti komponen asli atau sudah dimodifikasi sehingga perilaku/visual utamanya berubah.

Gunakan komponen ReactBits asli atau integrasi existing yang setia terhadap perilaku aslinya.

Konfigurasi acuannya:

- `working` mengikuti status proses nyata.
- `label` sesuai aktivitas.
- `doneLabel` sesuai aktivitas yang telah selesai.
- `glyph="sparkle"` jika didukung implementasi resmi.
- `breathPeriod={1.6}`
- `breathDepth={0.45}`
- `settleDuration={350}`
- `settleBlur={2}`
- `collapsible`
- `collapseOnSettle`
- `showTimer`

Pertahankan gaya visual yang sesuai theme VibeEverything.

**Dilarang membuat fake thinking loop.**

Detail aturan:

- Jangan merotasi daftar aktivitas fiktif setiap beberapa detik.
- Jangan membuat step yang seolah-olah sudah dikerjakan padahal belum.
- Jangan menampilkan AI sedang reasoning ketika backend hanya menjalankan browser capture.
- Jangan menggunakan spinner sebagai pengganti glyph Thinking.
- Gunakan activity/stage updates aktual dari server/worker.
- Activity berubah hanya ketika terdapat event atau perubahan tahap yang relevan.
- Jika tidak ada detail aktivitas baru, pertahankan aktivitas valid terakhir.
- Timer menunjukkan elapsed time yang benar, bukan perkiraan durasi.
- Pada status queued, tampilkan bahwa job menunggu worker, bukan AI sedang bekerja.
- Setelah selesai, tampilkan keadaan settle/done sesuai kontrak komponen.

Bedakan aktivitas AI generation dengan operasi scraping non-AI agar informasi tetap jujur.

## 2.4. Hindari duplikasi informasi

Saat ini activity yang sama dapat muncul pada panel kiri dan di bawah tahap aktif di panel kanan.

Rancang ulang hierarchy informasi:

- Kiri: aktivitas terbaru, identitas website, statistik nyata jika tersedia.
- Kanan: stage progression dan progress bar.
- Jangan mengulang kalimat identik berkali-kali.

Pertahankan layout dua kolom pada desktop serta susunan mobile yang rapi.

---

# 3. Perbaiki Bug Preview Pertama Scrape HTML Kosong

Masalah user:

Scrape HTML selesai, tetapi preview pertama sering langsung menampilkan:

**“Preview tidak berisi konten.”**

User harus mencoba ulang untuk melihat hasil, padahal scrape sudah selesai.

Periksa end-to-end:

- `src/lib/render-page.ts`
- `src/lib/fetch-html.ts`
- `src/lib/preview-html.ts`
- `src/lib/preview-capabilities.ts`
- `src/lib/scrape-preview-document.ts`
- `src/hooks/use-scrape-preview.ts`
- `src/components/design/scrape-detail.tsx`
- `src/routes/api/scrape.preview.ts`
- Loader/polling pada `src/routes/design/scrap.$id.tsx`

Audit seluruh jalur:

**Playwright capture → serialized HTML → persistence → preview transformation → API → iframe → readiness detection → UI state.**

## Perbaikan yang diwajibkan

### Capture

- Pastikan DOM hasil render sudah cukup stabil sebelum diambil.
- Bedakan dokumen HTML yang valid secara sintaks dengan dokumen yang benar-benar memiliki konten bermakna.
- Jangan menganggap HTML shell kosong sebagai capture visual yang berhasil.
- Hindari mengandalkan panjang string HTML sebagai satu-satunya indikator keberhasilan.
- Periksa penanganan script-rendered content, lazy loading, iframe, CSS, serta resource penting.
- Jangan menghapus konten yang valid hanya karena proses sanitasi/serialization keliru.

### Preview readiness

Audit khusus mekanisme `previewLoadReporter()` dan polling readiness iframe.

Dari audit awal, laporan `empty` bisa menyebabkan pemeriksaan berhenti.

Pastikan:

- `empty` tidak dijadikan hasil final terlalu dini.
- State `preparing`, `ready`, `degraded`, `empty`, dan `failed` memiliki transisi yang benar.
- Tidak ada race condition antara iframe mount, `srcDoc`, message listener, load event, dan readiness report.
- Re-render/polling tidak memunculkan false-empty state.
- Preview tidak gagal hanya karena resource lambat dimuat.
- Retry benar-benar memulai mekanisme pemulihan yang sesuai, bukan menyembunyikan error.
- Jangan melakukan retry tanpa batas atau refresh paksa sebagai workaround.

### Error classification

Pisahkan:

- Capture tidak berhasil.
- HTML hasil capture memang tidak memiliki konten yang dapat ditampilkan.
- Preview belum siap.
- Asset tertentu gagal dimuat.
- Iframe gagal melakukan rendering.
- Hasil parsial masih dapat ditampilkan.

Jangan menampilkan pesan “tidak berisi konten” kalau sistem belum membuktikan kontennya memang kosong.

### Keamanan — tidak boleh dikorbankan

Pertahankan seluruh pembatasan keamanan yang relevan:

- SSRF protection.
- Private-network / localhost restrictions.
- DNS rebinding dan redirect checks.
- Signed asset capabilities.
- CSP.
- Sandbox iframe.
- Sanitization.
- Batas request, ukuran resource, dan timeout.
- Larangan mengeksekusi script sumber yang tidak dipercaya di origin aplikasi.

**Jangan menyelesaikan bug preview dengan menonaktifkan keamanan.**

---

# 4. Perbaiki Advanced Parameters UI/UX

File utama: `src/components/design/scrape-workspace-form.tsx`.

Masalah:

- Native details/summary terlihat kurang rapi.
- Form controls tampak mentah.
- Label terlalu teknis.
- Hirarki informasi kurang jelas.
- Spacing dan alignment belum profesional.

## Target

Gunakan komponen accordion/collapsible dan form controls siap pakai dari library yang telah diaudit.

Kriteria:

1. Advanced Parameters tetap collapsed secara default.
2. Header mempunyai affordance expand/collapse yang jelas.
3. Tampilkan setting sesuai scrape mode saja.
4. Hindari membuat seluruh pengaturan tampak sama penting.
5. Kelompokkan numerical settings dan toggles secara logis.
6. Gunakan label bahasa Indonesia yang mudah dipahami, dengan terminology teknis secukupnya.
7. Tampilkan satuan dan helper text yang benar-benar membantu.
8. Validasi nilai min/max, invalid number, dan input kosong.
9. Reset parameters harus mengembalikan default mode yang benar.
10. Jangan mengubah semantik settings atau default backend tanpa alasan teknis yang terbukti.

Contoh istilah yang lebih mudah dipahami:

- `Wait for (ms)` → **Waktu tunggu tambahan**.
- `Measure resolution` → **Ukur resolusi gambar**.
- `Classify type` → **Identifikasi jenis gambar**.
- `Max Pages` → **Maksimum halaman**.
- `Max Depth` → **Kedalaman penelusuran**.

Label dapat disesuaikan setelah memastikan fungsi aktual.

Jangan mengubah Advanced Parameters menjadi panel raksasa yang justru menambah clutter.

---

# 5. Rework Generator [DESIGN.md](http://DESIGN.md) — PRIORITAS SANGAT TINGGI

Ini bukan sekadar styling task.

Masalah utamanya adalah hasil [DESIGN.md](http://DESIGN.md) sekarang terlalu mirip laporan raw computed CSS, bukan dokumen design system berkualitas.

File penting:

- `src/lib/design-visual-evidence.ts`
- `src/lib/design-evidence-contract.ts`
- `src/lib/design-extraction.ts`
- `src/lib/prompts-design-md.ts`
- `src/lib/design-md-inspector.ts`
- `src/components/design/design-result.tsx`
- `src/components/design/design-system-inspector.tsx`
- Service generation dan persistence terkait

Bandingkan dua file [DESIGN.md](http://DESIGN.md) user yang tersedia di konteks tugas:

1. Output sekarang dari VibeEverything.
2. Referensi output yang lebih detail, terstruktur, dan profesional.

Referensi kedua menjadi target untuk **kedalaman, struktur, dan kualitas dokumentasi**, bukan sumber nilai CSS yang boleh disalin mentah.

Jangan hardcode warna, font, radius, token, atau karakteristik Framer ke generator.

## 5.1. Ubah paradigma generator

Current approach:

Browser evidence → tabel CSS deterministik → AI menambahkan referensi evidence sederhana.

Desired approach:

**Browser evidence → normalization → structured design tokens → evidence-grounded AI synthesis → validation → final [DESIGN.md](http://DESIGN.md) + Inspector.**

Tetapkan model data terstruktur yang menjadi **single source of truth** bagi dokumen dan inspector.

Pisahkan secara eksplisit:

- `observed`: nilai pengukuran browser.
- `inferred`: kesimpulan semantik berdasarkan evidence dengan rationale.
- `unknown`: tidak ada evidence memadai.

Jangan mengubah inferred menjadi observed.

Setiap inferensi penting harus bisa ditelusuri ke observation/evidence yang digunakan.

AI tidak boleh memberikan angka, warna, font, interaksi, responsive behavior, atau klaim brand yang tidak memiliki dasar.

## 5.2. Tingkatkan kualitas AI generation

Saat ini model hanya diminta mengembalikan referensi observasi dalam JSON.

Audit dan revisi prompt serta output contract agar AI bisa menyusun analisis design system yang benar-benar berguna:

- Identitas dan visual essence website.
- Character of visual language.
- Semantic color roles.
- Typography hierarchy.
- Font usage.
- Spacing and geometry.
- Component patterns.
- Surface and elevation hierarchy.
- Layout principles.
- Imagery and iconography bila ada evidence.
- Practical Do's and Don'ts.
- Actionable implementation guidance.

Gunakan **structured AI output** dengan schema validation, evidence references, dan consistency checks.

Jangan meminta AI menulis Markdown arbitrer lalu berusaha memperbaikinya menggunakan regex sebagai solusi utama.

Markdown final sebaiknya dirender dari structured validated data.

Hindari quota panjang dokumen yang tidak masuk akal. Tetapi hasil juga tidak boleh menjadi terlalu dangkal ketika evidence sebenarnya kaya.

AI harus melakukan sintesis, bukan sekadar mengulang seluruh data mentah.

## 5.3. Preserve evidence dan handle failure dengan benar

Simpan raw measurements untuk kebutuhan audit.

Tampilkan curated design system sebagai hasil utama.

Jika AI enrichment gagal:

- Jangan hilangkan raw evidence yang sudah valid.
- Jangan menghasilkan analisis naratif palsu.
- Simpan hasil terukur yang tersedia.
- Tampilkan status/keterbatasan secara transparan.
- Berikan retry hanya untuk tahap yang memang memungkinkan diulang dengan aman.

Kegagalan enrichment tidak otomatis harus menggagalkan semua hasil, tetapi output parsial tidak boleh diberi label seolah-olah dokumen analisis final telah lengkap.

Pastikan mekanisme validasi baru tidak merusak arsip [DESIGN.md](http://DESIGN.md) lama. Jika perlu, gunakan schema/versioning dan compatibility layer yang eksplisit.

---

# 6. Palet Warna Harus Akurat, Bukan Daftar Computed CSS

Masalah:

Current color extraction mengumpulkan `background-color`, `color`, dan border colors, lalu memberinya role dasar seperti text/surface.

Ini menghasilkan daftar warna yang belum tentu merupakan palet desain utama website.

## Perbaikan

Lakukan color normalization:

- Normalize representasi warna yang ekuivalen.
- Deduplicate nilai warna secara konsisten.
- Bedakan alpha/transparency dari opaque colors.
- Jangan memasukkan transparent/no-op paint sebagai warna utama.
- Audit warna default browser/user-agent agar tidak salah diklaim sebagai warna brand.
- Pertimbangkan computed CSS variables, frekuensi, jenis elemen, dan konteks pemakaian.
- Prioritaskan warna yang secara nyata membentuk identitas halaman.
- Jangan menentukan primary brand color hanya karena sebuah warna muncul sekali.
- Jelaskan penggunaan warna berdasarkan evidence.
- Klasifikasi brand/accent/neutral/semantic harus dapat dipertanggungjawabkan.

Color labels dan token names boleh diturunkan secara semantik, tetapi jangan mengarang nilai warna.

Tambahkan identitas/role yang lebih berguna dibanding nama generik `text`, `surface`, `text`, `surface` berkali-kali.

Pertahankan raw color measurements secara terpisah untuk audit.

Palet yang terlihat di Style Inspector harus berasal dari model warna terkurasi, bukan daftar computed CSS mentah.

---

# 7. Redesign Typography — Type Scale Profesional

Target visual mengikuti screenshot referensi Typography yang diberikan user.

**Jangan mempertahankan tampilan panjang** `body, body, body, body` **seperti saat ini.**

## Root issue yang harus diselesaikan

Audit sebelumnya menunjukkan banyak kombinasi font property dari elemen paragraf disimpan sebagai typography entries terpisah dan diberi role `body`.

Akibatnya, UI hanya menampilkan daftar variasi CSS.

Lakukan semantic grouping:

- Display.
- Large heading.
- Heading.
- Subheading.
- Body large.
- Body.
- Body small.
- Caption.
- UI label / monospace jika evidence mendukung.

Nama peran adalah klasifikasi hasil analisis, bukan fakta pengukuran kecuali memang berasal dari sumber.

Pertimbangkan font-size, line-height, weight, tracking, element role, frequency, dan semantic context.

Pilih representatif typography specimens, bukan semua variasi elemen.

## Target UI

Gunakan pola **Type Scale gallery**:

- Full-width specimen rows.
- Label role.
- Size / weight / line-height metadata.
- Contoh teks dengan ukuran yang benar.
- Divider dan hierarchy yang konsisten.
- Font family diterapkan jika tersedia dan aman.
- Fallback jika font asli tidak tersedia.
- Informasi keterbatasan font preview jika relevan.

Audit `TypePreview` karena saat ini ukuran besar dibatasi dengan `min(..., 2.5rem)` dan teks dipotong menggunakan `truncate`.

Jangan membuat display heading 68px terlihat seperti font body karena dipaksa mengecil.

Pada layar kecil boleh adaptif, tetapi skala aktual harus tetap dapat dipahami.

---

# 8. Redesign Font — Typeface Inspector

Target mengikuti screenshot referensi font yang diberikan.

Current font UI terlalu sederhana: hanya family, weight, sizes, dan teks preview kecil.

Perbaiki menjadi **Typeface Inspector** dengan informasi:

- Canonical font family.
- Peran: Display, Body, UI, Monospace, dll jika evidence mendukung.
- Weight yang terukur.
- Size range / variasi ukuran.
- Line-height.
- Letter-spacing.
- CSS font stack/fallback.
- Font loading evidence.
- Deskripsi penggunaan bila dapat didukung data.
- Clear uncertainty jika font aktual tidak dapat diverifikasi.

Normalisasi font family:

- Jangan memperlakukan placeholder font sebagai typeface utama tersendiri.
- Jangan mengasumsikan font yang dideklarasikan pasti font yang dirender.
- Pisahkan declared font, loaded font, dan observed computed stack.

Gunakan card composition profesional dan reusable components.

Jangan sekadar memperbesar font list lama tanpa meningkatkan struktur datanya.

---

# 9. Rework Spacing &amp; Shapes

Target UI mengikuti screenshot referensi Spacing &amp; Shape.

## Masalah sekarang

`groupMeasurements()` sudah melakukan deduplikasi kombinasi property/value, tetapi penyajian masih terlalu mentah.

Contoh buruk:

- `padding · 1 elemen`
- `gap · 1 elemen`
- `border-radius · 243 elemen`

Ini adalah data audit, bukan representasi semantic design tokens.

## Desired output

### Spacing

Tampilkan peran yang dapat dibuktikan seperti:

- Section gap.
- Container max-width.
- Card padding.
- Element gap.
- Navigation spacing.
- Repeated spacing scale.

Gunakan tabel Purpose / Value / Preview dan bar proportional visualization yang rapi.

Jangan mengarang semantic labels jika evidence tidak cukup.

### Border Radius

Kelompokkan radius berdasarkan konteks elemen:

- Buttons.
- Inputs.
- Navigation.
- Cards.
- Large cards.
- Icons/tags bila terbukti.

Tampilkan rounded-corner preview yang benar.

Jangan mempromosikan `0px` dari ratusan elemen biasa menjadi token radius utama.

### Elevation

Jika evidence tersedia, tampilkan:

- Named shadow patterns.
- Actual CSS shadow.
- Visual preview.
- Relevan component usage.

Jangan membuat preset shadow yang tidak terukur.

### Data separation

Raw measurements tetap tersedia di layer audit, tidak memenuhi seluruh layar utama inspector.

Curated tokens adalah tampilan utama.

---

# 10. Perbaiki Do's &amp; Don'ts

Current generator menghasilkan terlalu sedikit aturan dan sebagian berasal dari template kalimat sederhana berbahasa Indonesia.

Target adalah panduan yang relevan, spesifik, dan actionable seperti dokumen design system profesional.

Contoh area yang dianalisis:

- Typography consistency.
- Color usage.
- Spacing rhythm.
- Border radius.
- Surface hierarchy.
- CTA styling.
- Component consistency.
- Layout composition.
- Imagery jika tersedia.
- Motion jika benar-benar memiliki evidence.

Gunakan **bahasa Inggris sebagai bahasa isi [DESIGN.md](http://DESIGN.md)**, agar konsisten dengan format referensi.

UI aplikasi boleh tetap menggunakan bahasa Indonesia.

Persyaratan:

1. Setiap Do/Don't harus dapat ditelusuri ke evidence.
2. Jangan menghasilkan nasihat generik yang berlaku pada semua website.
3. Hindari kalimat template yang diulang.
4. Jangan membuat klaim “never” jika sebenarnya website memiliki beberapa variasi sah.
5. Jangan memaksakan jumlah tertentu dengan cara mengarang aturan.
6. Jika evidence kaya, lakukan sintesis lintas komponen sehingga panduan juga kaya.
7. Jika evidence terbatas, nyatakan limitations secara transparan.

Tujuan utama adalah meningkatkan **kualitas analisis**, bukan sekadar menambah jumlah bullet.

---

# 11. Standarisasi Format [DESIGN.md](http://DESIGN.md)

Gunakan file referensi user sebagai acuan information architecture.

Target section:

1. Website Identity &amp; Visual Essence.
2. Theme &amp; Overview.
3. Tokens — Colors.
4. Tokens — Typography.
5. Fonts &amp; Type Scale.
6. Tokens — Spacing &amp; Shapes.
7. Components.
8. Do's and Don'ts.
9. Surfaces.
10. Elevation.
11. Imagery &amp; Iconography.
12. Layout.
13. Agent Prompt Guide.
14. CSS Custom Properties.
15. Tailwind v4.
16. Limitations &amp; Confidence Notes.
17. Measurement Provenance / Audit Appendix jika dibutuhkan.

Section boleh disesuaikan secara terbatas berdasarkan evidence yang benar-benar tersedia.

**Jangan mengisi section dengan fabricated values hanya supaya terlihat lengkap.**

Untuk CSS Custom Properties dan Tailwind v4:

- Hanya hasilkan token yang lolos validasi.
- Pastikan CSS syntax benar.
- Jangan keluarkan invalid hex colors.
- Jangan keluarkan kombinasi data yang saling bertentangan.
- Jangan mengklaim token hasil sintesis sebagai CSS variable asli website.
- Bedakan source variables dengan generated implementation aliases.
- Jika suatu fitur memerlukan interpretasi, beri label yang tepat.

Pastikan tabel Markdown, code fences, escaping, heading nesting, dan urutan section benar.

Audit bug penempatan **Font loading evidence** yang sebelumnya muncul setelah heading **Agent Prompt Guide**.

Tambahkan automated contract tests untuk format output.

---

# 12. Style Inspector Harus Menggunakan Data [DESIGN.md](http://DESIGN.md) yang Sama

Jangan membuat dua proses analisis terpisah yang menghasilkan informasi berbeda.

Alur ideal:

**Validated structured design model → [DESIGN.md](http://DESIGN.md) renderer + Style Inspector renderer.**

Pastikan:

- Colors inspector konsisten dengan Colors [DESIGN.md](http://DESIGN.md).
- Type Scale konsisten dengan font metrics dalam dokumen.
- Font data konsisten.
- Spacing and radius konsisten.
- Do's &amp; Don'ts konsisten.
- Surface dan Elevation tidak mengarang sendiri.
- Verification state terlihat dengan benar.

Audit `inspectorFromEvidence()` dan fallback `parseDesignMd()`.

Jangan menampilkan hasil parsing arsip lama sebagai `verified` jika underlying evidence tidak tersedia atau tidak cocok.

## Kualitas layout inspector

Pertahankan konsep workspace dua kolom yang sudah ada:

- Kiri: Style Inspector.
- Kanan: satu panel canonical [DESIGN.md](http://DESIGN.md).
- Kanan tetap mendukung copy, download, dan Implement ke AI Agent.
- Scroll behavior jelas dan independen jika sesuai layout.
- Full-width workspace, bukan dua panel kecil yang terjepit di tengah.
- Tidak ada horizontal overflow.
- Mobile layout tetap berguna.
- Sticky panel tidak menutupi navbar.
- Tidak ada heading atau informasi website duplikat.

Gunakan komponen UI existing dan external libraries yang telah diaudit.

**Jangan redesign ulang seluruh product shell, navbar, atau navigation flows.**

---

# 13. Ketentuan AI Fidelity dan Keamanan Data

Prinsip utama fitur ini adalah:

**Evidence-first, interpretation-second.**

Jangan:

- Hardcode hasil Framer, Notion, Insforge, atau website tertentu.
- Menggunakan contoh data referensi sebagai hasil nyata.
- Menghasilkan angka yang tidak terukur.
- Mengklaim responsive behavior dari single desktop viewport.
- Mengklaim hover/focus/animation behavior yang tidak diamati.
- Mengklaim font berhasil dimuat hanya karena terdaftar pada CSS.
- Menghasilkan brand palette berdasarkan tebakan model.
- Menghapus validasi hanya karena model sulit mengikuti schema.
- Membiarkan model menghasilkan Markdown panjang yang tidak diverifikasi.
- Mengubah data observed menjadi inferred secara diam-diam.
- Mengabaikan rate limits, timeout, sanitization, dan pembatasan keamanan.

Jika informasi tidak cukup, tampilkan uncertainty/limitations. Kualitas produk tidak ditentukan oleh seberapa percaya diri AI menulis, melainkan seberapa tepat dan berguna hasilnya.

---

# 14. Testing dan Regression Prevention

**SKIP BROWSER QA UNTUK TASK INI.**

Jangan menginstruksikan atau menjalankan browser QA, browser navigation, screenshot comparison, ataupun manual browser testing.

Fokus validasi menggunakan kode dan automated non-browser tests.

Tambahkan/perbarui unit dan integration tests yang relevan untuk:

- Progress stage mapping.
- Continuous bar animation class/structure.
- Segmen bar memiliki dimensi yang benar.
- Spinner redundancy tidak muncul kembali.
- ThoughtLine menggunakan real activity dan tidak fake-loop.
- Queued, active, completed, dan failed state.
- Preview state machine.
- Preview readiness race condition.
- Empty vs preparing vs degraded.
- HTML capture validity.
- SSRF/CSP/sandbox regression.
- Advanced parameter validation dan reset.
- Color normalization dan semantic grouping.
- Typography deduplication/type-scale grouping.
- Font normalization.
- Spacing/radius classification.
- Evidence-backed guideline generation.
- Structured AI output validation.
- [DESIGN.md](http://DESIGN.md) section ordering.
- CSS/Tailwind output validity.
- Konsistensi Style Inspector dan [DESIGN.md](http://DESIGN.md).
- Compatibility dengan data hasil lama.

Gunakan fixtures realistis dan minimal. Jangan menjadikan hardcoded reference output sebagai solusi produksi.

Jalankan relevant tests, TypeScript typecheck, lint, dan build sesuai package manager/scripts repository.

Jangan menjalankan browser-based test suites sebagai bagian task ini.

Tidak boleh ada `any` workaround, `@ts-ignore`, fake stubs, atau test assertions yang dilemahkan hanya agar check lulus.

---

# 15. Urutan Implementasi

Lakukan dalam workstreams yang jelas.

**Workstream A — Restore Scrape Progress**

- Perbaiki progress bar.
- Integrasikan ReactBits ThoughtLine sesuai kebutuhan.
- Hilangkan redundant spinner.
- Hubungkan real activity/status.
- Tambahkan regression tests.

**Workstream B — Fix Scrape HTML Preview**

- Audit capture sampai iframe readiness.
- Perbaiki false-empty state dan potensi race condition.
- Perbaiki error classification.
- Pastikan keamanan tidak berkurang.
- Tambahkan regression tests.

**Workstream C — Advanced Parameters UI**

- Component discovery.
- Integrasikan reusable accordion/form controls.
- Perbaiki label dan hierarchy.
- Pertahankan seluruh behavior.
- Tambahkan tests.

**Workstream D — [DESIGN.md](http://DESIGN.md) Data &amp; AI Pipeline**

- Evidence normalization.
- Structured design model.
- AI synthesis with references.
- Validation dan fallback.
- Versioning/compatibility.
- Markdown renderer.
- Tests.

**Workstream E — Style Inspector**

- Palette.
- Type Scale.
- Fonts.
- Spacing &amp; Shapes.
- Surface/Elevation.
- Do &amp; Don'ts.
- Single-source consistency.
- Responsive styling.
- Tests.

Jangan menganggap satu workstream selesai hanya karena JSX sudah berubah. Pastikan data, behavior, dan tests terkait sudah sesuai.

---

# 16. Kriteria Penerimaan Final

Task baru dianggap selesai jika:

- Progress bar kembali terlihat dan mempunyai animasi kontinu pada stage aktif.
- Progress tidak menghasilkan fake percentage atau fake delay.
- Tidak ada spinner kanan atas.
- Panel aktivitas menggunakan ReactBits ThoughtLine yang benar.
- Tidak ada fake thinking/activity looping.
- Tahap scraping benar-benar berdasarkan server/worker.
- Preview HTML pertama tidak salah ditandai empty karena readiness race.
- Preview errors diklasifikasikan dengan benar.
- Capture dan preview security tetap utuh.
- Advanced Parameters lebih rapi, mudah dipahami, dan tetap fungsional.
- Colors tidak lagi sebatas dump computed values.
- Typography menggunakan curated Type Scale, bukan deretan `body`.
- Typeface Inspector memiliki struktur dan informasi profesional.
- Spacing &amp; Shapes menampilkan semantic usage dan preview yang berguna.
- Do's &amp; Don'ts lebih kontekstual serta evidence-grounded.
- [DESIGN.md](http://DESIGN.md) mendekati kedalaman dan struktur referensi user tanpa mengarang data.
- CSS dan Tailwind examples valid.
- Inspector dan [DESIGN.md](http://DESIGN.md) konsisten.
- Data lama tidak otomatis kehilangan akses.
- UI memakai library components yang benar-benar telah dieksplorasi dan dipilih.
- Tidak ada redesign di luar scope.
- Relevant automated tests, typecheck, lint, dan build selesai sesuai konfigurasi project.
- Browser QA tidak dijalankan.

---

# 17. Git Discipline dan Handoff

Ikuti aturan Git di [`AGENTS.md`](http://AGENTS.md).

- Jangan menimpa perubahan user atau bekerja di branch yang salah.
- Lakukan commit yang koheren/atomic berdasarkan workstream.
- Push commit ke branch yang benar sesuai aturan repository.
- Pastikan working tree bersih dan branch tersinkron dengan upstream jika diwajibkan rules.
- Jangan berhenti setelah coding tetapi sebelum commit/push.

Pada final handoff, laporkan secara ringkas namun jelas:

1. Root causes yang benar-benar terkonfirmasi.
2. Perbaikan yang diimplementasikan per workstream.
3. **Component Discovery Report**: library/komponen yang diperiksa, yang dipilih, dan file tempat komponen digunakan. Jelaskan jika ada area yang terpaksa membutuhkan custom implementation.
4. Perubahan kontrak [DESIGN.md](http://DESIGN.md) dan kompatibilitas data lama.
5. Tests/checks yang dijalankan beserta hasilnya.
6. Hal yang masih belum dapat diverifikasi tanpa runtime evidence, jika ada.
7. Commit hashes dan status push.

**Dilarang mengklaim browser QA sudah dilakukan.**

## Final Reminder

Saya tidak menginginkan implementasi yang hanya technically working tetapi visually mediocre.

**Jangan menyederhanakan task, jangan berhenti pada perubahan kosmetik, dan jangan menciptakan UI custom dari nol jika ada komponen berkualitas yang sudah siap digunakan.**

Prioritaskan correctness, evidence fidelity, component reuse, visual quality, maintainability, accessibility, dan konsistensi dengan arsitektur project.

Implementasikan dengan standar production-quality engineering, bukan sekadar memenuhi checklist secara dangkal.