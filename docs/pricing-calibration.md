# Kalibrasi Tarif Kredit Studio dan Scrape (TASK 09)

Status: Kebijakan trial disetujui. Kalibrasi tarif produksi masih menunggu benchmark terverifikasi; owner memilih billing legacy tetap berlaku.
Charging Studio dan Scrape: NONAKTIF.
Tanggal penyusunan: 2026-11-23.

Kesimpulan awal: tarif produksi belum dapat ditetapkan. Instrumen shadow metering sudah ada, tetapi seluruh skenario benchmark masih berstatus "prosedur siap, pengukuran nyata pending" (`docs/shadow-usage-benchmark.md`). Tidak ada sample biaya terverifikasi untuk menghitung tarif yang defensibel. Sesuai gate persetujuan, angka tarif sengaja dikosongkan, charging tidak diaktifkan, dan item kalibrasi tetap pending.

## 1. Basis bukti yang diverifikasi

| Fakta | Nilai | Sumber |
| :-- | :-- | :-- |
| Paket Free | Rp0, 2 kredit, siklus 30 hari | `src/features/billing/data/pricing-data.ts`, `BILLING_PERIOD_DAYS` |
| Paket Pro | Rp49.000, 30 kredit per 30 hari | `src/features/billing/data/pricing-data.ts` |
| Paket Hengker | Rp149.000, 105 kredit per 30 hari | `src/features/billing/data/pricing-data.ts` |
| Kunci operasi Studio | `studio.generate`, `studio.add_frame`, `studio.revise`, `studio.regenerate` | `src/features/billing/services/credit-operation-registry.ts` |
| Kunci operasi Scrape | `scrape.crawl`, `scrape.html`, `scrape.images`, `scrape.design_md` | registry yang sama |
| Status tarif Studio dan Scrape | `unconfigured`, `requireConfiguredPricing` melempar error | registry yang sama, `docs/universal-credit-ledger.md` |
| Batas Scrape terverifikasi | 50 halaman, depth 5, 10 frame, 4 design view, 200 kandidat gambar, 50 MB transfer, 16.000 byte per request, 15 menit per job, 2 job aktif | `SCRAPE_LIMITS` di `src/features/scrape/types/scrape-contract.ts` |
| Skenario benchmark | 1/3/5 frame, revisi sederhana dan kompleks, add frame, regenerate, partial success, crawl 1/10/50 halaman, HTML, gambar, DESIGN.md, retry, failure, cancellation | `docs/shadow-usage-benchmark.md` |
| Instrumentasi | `shadow_usage_records`, dedupe per attempt, retensi 90 hari, p95 minimal 20 sample | `src/db/schema/usage-metering.ts`, `src/features/usage-metering/` |

Paket tetap dipertahankan apa adanya. Belum ada persetujuan untuk mengubah harga atau alokasi.

## 2. Data terukur versus asumsi

| Input kalibrasi | Status | Keterangan |
| :-- | :-- | :-- |
| Provider usage dan biaya | Tidak terukur | Tidak ada sample tarif terverifikasi. Akses provider saat ini bersifat promosi atau gratis, sehingga tidak boleh disimpulkan sebagai biaya jangka panjang. |
| Browser execution | Tidak terukur | Belum ada ringkasan durasi browser per skenario. |
| Worker CPU dan RAM | Tidak terukur | `processCpuMs` dan `processRssBytes` sengaja null. Proses worker menjalankan banyak job bersamaan, jadi CPU/RSS proses tidak boleh diklaim sebagai biaya satu job. |
| Storage dan bandwidth | Tidak terukur | Downloaded bytes null sampai ada pengukuran per-request. Ukuran artifact hanya diisi bila nilainya nyata. |
| Success rate | Tidak terukur | Dibutuhkan minimal 20 attempt per skenario agar p95 valid. Di bawah itu p95 bernilai null. |
| Retry overhead | Tidak terukur | Belum ada sample attempt gagal yang diukur biayanya. |
| Failed-operation overhead | Tidak terukur | Attempt gagal tercatat sebagai `completedUnits = 0`, belum ada agregat biaya. |
| Partial completion | Tidak terukur | Belum ada sample partial success yang dianalisis. |
| Expected job frequency | Tidak terukur | Belum ada agregat frekuensi bulanan per operasi. |
| Subscription revenue | Sebagian terukur | Harga paket dan alokasi terverifikasi dari kode. Komposisi pelanggan, churn, refund, dan biaya layanan belum tersedia. |
| Model nilai kredit | Belum disetujui | Satu kredit tidak pernah disamakan dengan nilai Rupiah tetap tanpa model keuangan yang disetujui owner. |

Skenario berbayar apa pun harus diberi label simulasi dengan `priceSource` dan `effectiveDate`, dan tidak boleh diklaim sebagai pengeluaran yang benar-benar terjadi.

## 3. Pemetaan operasi ke model harga

| Operasi | Kunci registry aktual | Sumber baris | Model disepakati | Unit billable usulan | Status |
| :-- | :-- | :-- | :-- | :-- | :-- |
| Studio Generate | `studio.generate` | `studio_jobs.job_type = initial` | Adaptive | frame | unconfigured |
| Studio Add Frame | `studio.add_frame` | `studio_jobs.job_type = add` | Fixed atau adaptive menurut ukuran | frame | unconfigured |
| Studio AI Revision | `studio.revise` | `studio_jobs.job_type = revise` | Adaptive | frame | unconfigured |
| Studio Regenerate | `studio.regenerate` | `studio_jobs.job_type = retry` | Adaptive | frame | unconfigured |
| Scrape Crawl | `scrape.crawl` | `scrapes.mode = crawl` | Adaptive menurut halaman selesai | page | unconfigured |
| Scrape HTML | `scrape.html` | `scrapes.mode = html` | Fixed dalam batas terverifikasi | request dan bytes | unconfigured |
| Scrape Images | `scrape.images` | `scrapes.mode = images` | Fixed dalam batas terverifikasi | image dan bytes | unconfigured |
| Generate DESIGN.md | `scrape.design_md` | `scrapes.mode = design` | Adaptive | design_view, maksimal 4 | unconfigured |

Tidak ada tarif untuk fitur yang tidak ada. Revisi manual, melihat hasil, VibeTemplate, dan revisi PRD via patch seksi tetap gratis. Tidak ada operasi baru yang ditambahkan hanya untuk membuat tarif.

## 4. Registry versi dan kontrak quote

```
Operation + input metrics
          |
          v
Versioned pricing policy
          |
          +--> Estimate
          +--> Maximum charge
          +--> Settlement calculation
```

Implementasi yang disiapkan: `src/features/billing/services/pricing-policy.ts`. Modul ini murni, tidak menyimpan angka tarif, dan belum diimpor oleh jalur charging produksi mana pun.

Aturan yang ditegakkan kode:

- Registry harus memiliki id dan setiap operasi bersetarif wajib pinning versi aktif. Registri tanpa pinning ditolak.
- Quote dapat meminta versi eksplisit. Tanpa versi eksplisit, quote memakai versi aktif. Hasil quote selalu mengembalikan versi yang dipakai.
- Settlement wajib menerima versi hasil quote. Versi yang sudah tidak ada menghasilkan `TariffVersionNotFoundError`, bukan jatuh ke versi baru. Operasi lama tidak pernah dihitung ulang memakai tarif baru.
- Operasi adaptif mendefinisikan unit billable, `creditsPerUnit`, minimum, maksimum, rounding, dan kebijakan per outcome. Minimum diterapkan hanya bila unit lebih dari nol. Rounding yang didukung: `ceil`, `floor`, `round`.
- Partial success menyelesaikan berdasarkan unit selesai yang terukur. Failed dan cancelled tidak dikenakan biaya. Final charge dibatasi oleh maksimum tarif dan maksimum yang otorisasi saat reservasi.
- Operasi fixed wajib mendeklarasikan `verifiedLimits`. Quote dan settlement menolak bila limit tidak terukur atau terlampaui, sehingga tidak ada pemakaian sumber daya tak terbatas pada harga nominal tetap.

## 5. Proposal nilai tarif

Nilai produksi sengaja kosong sampai benchmark selesai dan owner menyetujui. Rumus yang akan dipakai setelah data tersedia:

```
creditsPerUnit = ceil((measuredCostPerUnit + retryOverhead + failedOverhead) / approvedCostPerCredit)
```

`approvedCostPerCredit` bukan konstanta kode. Owner harus menetapkan model keuangan yang menghubungkan biaya operasional dan nilai kredit terlebih dahulu. Batas exposure per operasi mengikuti batas terverifikasi: 50 halaman untuk crawl, 4 view untuk DESIGN.md, 200 kandidat gambar dan 50 MB untuk images, 16.000 byte per request HTML.

Bentuk tarif yang diusulkan untuk persetujuan, tanpa angka:

| Operasi | Mode | Unit | Minimum | Maksimum | Rounding | Partial settlement |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| `studio.generate` | adaptive | frame | 1 frame | batas dukungan Studio, menunggu verifikasi | ceil | unit selesai |
| `studio.add_frame` | fixed bila tepat 1 frame, adaptive di atasnya | frame | 1 frame | batas dukungan Studio | ceil | unit selesai |
| `studio.revise` | adaptive | frame | 1 frame | batas dukungan Studio | ceil | unit selesai |
| `studio.regenerate` | adaptive | frame | 1 frame | batas dukungan Studio | ceil | unit selesai |
| `scrape.crawl` | adaptive | page selesai | 1 halaman | 50 halaman | ceil | halaman selesai |
| `scrape.html` | fixed | request terverifikasi | tidak ada | 1 request, 16.000 byte | tidak ada | fixed dalam limit |
| `scrape.images` | fixed | request terverifikasi | tidak ada | 200 gambar, 50 MB | tidak ada | fixed dalam limit |
| `scrape.design_md` | adaptive | design_view | 1 view | 4 view | ceil | view selesai |

## 6. Skenario finansial A, B, dan C

Semua angka pada bagian ini memakai TARIF SINTETIK hanya untuk membuktikan aritmetika dan kapasitas paket. Tarif ini bukan harga produksi, bukan rekomendasi harga, dan tidak dipasang di registry produksi.

Tarif sintetik S:

| Operasi | Tarif sintetik |
| :-- | :-- |
| `studio.generate` | 2 kredit per frame, min 2, max 10 |
| `studio.revise` | 1 kredit per frame, min 1, max 6 |
| `scrape.crawl` | 1 kredit per halaman, min 1, max 20 |
| `scrape.html` | 2 kredit, batas 1 request dan 16.000 byte |
| `scrape.images` | 2 kredit, batas 200 gambar dan 50 MB |
| `scrape.design_md` | 4 kredit per view, min 4, max 16 |

Definisi operasi biasa: generate 3 frame = 6 kredit, crawl 10 halaman = 10 kredit, HTML = 2 kredit, images = 2 kredit, DESIGN.md 2 view = 8 kredit, revisi 1 frame = 1 kredit.

### Skenario A: alokasi existing, tarif S

| Operasi biasa | Effective credit | Pro 30 | Hengker 105 |
| :-- | --: | --: | --: |
| Generate 3 frame | 6 | 5 kali | 17 kali |
| Crawl 10 halaman | 10 | 3 kali | 10 kali |
| HTML | 2 | 15 kali | 52 kali |
| Images | 2 | 15 kali | 52 kali |
| DESIGN.md 2 view | 8 | 3 kali | 13 kali |

High usage: crawl 50 halaman dikenakan 20 kredit karena cap, generate 10 frame dikenakan 10 kredit, DESIGN.md 4 view dikenakan 16 kredit. Satu alokasi Pro habis untuk satu crawl 50 halaman ditambah satu generate 10 frame. Satu alokasi Hengker habis untuk lima crawl 50 halaman. Eksposur trial: satu frame Studio setara 2 kredit sintetik dan crawl 3 halaman setara 3 kredit sintetik, total 5 kredit sintetik pekerjaan per akun Free. Trial bukan saldo kredit dan tidak memotong 2 kredit Free.

Asumsi dan ketidakpastian: tidak ada data seberapa sering operasi dijalankan, tidak ada biaya riil per kredit, tidak ada data churn. Tidak ada klaim margin.

### Skenario B: alokasi dinaikkan, tarif S

Usulan hipotetik, belum disetujui, harga langganan diasumsikan tetap: Pro 60 kredit dan Hengker 210 kredit.

| Operasi biasa | Pro 60 | Hengker 210 |
| :-- | --: | --: |
| Generate 3 frame | 10 kali | 35 kali |
| Crawl 10 halaman | 6 kali | 21 kali |
| HTML | 30 kali | 105 kali |
| DESIGN.md 2 view | 7 kali | 26 kali |

High usage: Pro 30 kredit tersisa untuk satu crawl maksimal, Hengker mampu sepuluh crawl 50 halaman dari alokasi 210. Trial tetap 5 kredit sintetik pekerjaan.

Asumsi dan ketidakpastian: kenaikan alokasi tanpa kenaikan harga berarti biaya per kredit turun, tetapi tidak ada data frekuensi dan biaya untuk membuktikan keberlanjutannya. Tidak ada klaim margin.

### Skenario C: harga bounded, alokasi existing

Opsi alternatif bila tarif awal terlalu mahal bagi user. Masih sintetik dan belum disetujui: generate 1 kredit per 2 frame, min 1, max 5; crawl 1 kredit per 5 halaman, min 1, max 6; DESIGN.md 2 kredit per view, min 2, max 8; HTML dan images tetap 2 kredit.

| Operasi biasa | Effective credit | Pro 30 | Hengker 105 |
| :-- | --: | --: | --: |
| Generate 3 frame | 2 | 15 kali | 52 kali |
| Crawl 10 halaman | 2 | 15 kali | 52 kali |
| DESIGN.md 2 view | 4 | 7 kali | 26 kali |
| HTML | 2 | 15 kali | 52 kali |

High usage: crawl 50 halaman kena 6 kredit, generate 10 frame kena 5 kredit, DESIGN.md 4 view kena 8 kredit. Pro mampu lima crawl maksimal, Hengker tujuh belas crawl maksimal. Trial turun menjadi 2 kredit sintetik pekerjaan.

Asumsi dan ketidakpastian: tarif lebih rendah berpotensi menaikkan frekuensi job sehingga total biaya belum tentu turun. Tanpa data frekuensi dan biaya, opsi ini tidak dapat dinyatakan lebih aman secara finansial.

Eksposur biaya dalam Rupiah tidak dihitung pada ketiga skenario. Biaya per operasi belum terukur dan model nilai kredit belum disetujui, sehingga konversi kredit ke uang akan bersifat rekaan.

## 7. Kalibrasi kebijakan trial

Kesepakatan sebelumnya dipertahankan: satu Studio trial dan satu Scrape trial per akun Free, tanpa reset bulanan. Kebutuhan trial bukan saldo kredit tambahan.

| Aspek | Batas dan kebijakan yang disetujui | Dasar |
| :-- | :-- | :-- |
| Studio trial | 1 akun generate, tepat 1 frame, mode `studio.generate` saja | Target trial satu frame yang dihasilkan |
| Studio non-trial | Add frame, revise, regenerate tidak tersedia dalam trial | Mencegah satu trial dipakai untuk beberapa operasi |
| Scrape trial | 1 job ekstraksi per akun Free | Target trial satu job bounded |
| Mode Scrape | `html`, `images`, `crawl`, `design` | Mode yang benar-benar ada di `scrapes.mode` |
| Halaman | Maksimal 3 halaman diminta, completed tidak boleh melebihi yang diminta | Batas uji aman di bawah `maxPages = 50` |
| Gambar dan byte | Maksimal 200 kandidat gambar, 50 MB transfer, 16.000 byte per request | `SCRAPE_LIMITS` terverifikasi |
| Browser | Wait maksimal 10.000 ms per halaman, runtime job maksimal 15 menit | `SCRAPE_LIMITS` terverifikasi |
| DESIGN.md | Maksimal 2 view dari konfigurasi `viewport`, `theme`, `depth`, `focus`, `codeReference` yang didukung | `designViews = 4` terverifikasi, trial dibatasi setengahnya |
| Retry | Retry memakai `logicalJobId` yang sama, attempt dicatat terpisah | Idempotensi shadow metering |
| Partial success | Trial terpakai sekali saat minimal satu unit selesai | Mencegah trial dipakai berulang |
| System failure | entitlements dikembalikan bila tidak ada unit selesai | Trial tidak hangus karena kegagalan sistem |
| Cancellation | Tidak mengonsumsi trial jika belum ada unit selesai; mengonsumsi trial jika minimal satu unit sudah selesai | Konsumsi mengikuti hasil yang benar-benar tersedia |
| Deletion dan subscription change | Status trial tetap terminal, tidak direset atau diberikan ulang | Satu trial per akun, bukan per periode |

Konsumsi trial harus dikekunci pada pasangan `user_id` dan product family, bukan pada subscription epoch, sehingga retry, penghapasan resource, atau perubahan paket tidak dapat mengonsumsi trial dua kali. Penegakan aturan ini menjadi tanggung jawab TASK 10. Resource yang sudah ditagih wajib di-tombstone di TASK 11 dan 12.

## 8. Keputusan UX

Estimasi dan maksimum charge ditampilkan inline dari `quoteTariff`. Tidak ada popup izin baru untuk konsumsi kredit normal.

Bila kredit atau trial mencukupi, user menekan tombol operasi yang sudah ada, backend memvalidasi dan reservasi, lalu pekerjaan langsung dimulai. Bila kredit tidak cukup, dipakai Credit Exhausted Modal yang sudah ada. Untuk job besar, UI menampilkan maksimum charge inline tanpa konfirmasi tambahan. Tidak ada perubahan UI pada TASK 09.

## 9. Gate persetujuan owner

Status: Trial disetujui. Tarif produksi tetap nonaktif sesuai keputusan owner untuk mempertahankan billing legacy.

- [ ] Nilai tarif pasti per operasi beserta versi registry yang disetujui.
- [x] Batas trial Studio dan Scrape pada bagian 7.
- [ ] Perubahan alokasi paket, bila ada.
- [x] Partial success dan cancellation untuk trial pada bagian 7.
  - [ ] Settlement produksi untuk tarif paid baru.
- [ ] Strategi deploy dan rollout, termasuk kapan tarif dipasang ke `CREDIT_OPERATION_REGISTRY`.

Pengukuran yang masih kurang dan tindakan lanjutan:

| Kekurangan | Tindakan berikutnya |
| :-- | :-- |
| Sample biaya provider dan paid-provider scenario | Jalankan minimal 20 attempt per skenario di environment terisolasi dengan `priceSource` dan `effectiveDate` resmi, beri label simulasi |
| Durasi browser, retry, failure, partial | Kumpulkan shadow records per attempt lewat skenario yang sudah didefinisikan, lalu ringkas dengan `getShadowUsageBenchmark` atau `buildBenchmarkReport` |
| CPU, RAM, bandwidth | Tambahkan pengukuran per-job yang andal sebelum mengklaim biaya infrastruktur per operasi |
| Frekuensi job dan revenue | Agregasi jumlah job per periode dan data pelanggan dari sumber yang sah |
| Model nilai kredit | Owner menetapkan hubungan biaya operasional dan nilai kredit sebelum angka tarif dihitung |

Sampai semua pengukuran di atas tersedia, kredit tidak boleh dikurangi untuk Studio dan Scrape, dan item kalibrasi tetap ditandai pending.

## 10. Verifikasi

Tarif sintetik diberi label `synthetic-v1` dan `synthetic-v2` di `src/features/billing/tests/pricing-policy.test.ts`. Test mencakup quote deterministik, batas rounding dengan nilai pecahan, penerapan minimum, partial settlement, failed dan cancelled tanpa biaya, version pinning, penolakan versi yang dicabut, operasi tanpa tarif aktif, limit fixed yang hilang atau terlampaui, cap pada settlement fixed, dan penolakan registry tanpa active version.

Perintah yang dijalankan:

```
pnpm vitest run src/features/billing/tests/pricing-policy.test.ts
pnpm biome check src/features/billing/services/pricing-policy.ts src/features/billing/tests/pricing-policy.test.ts docs/pricing-calibration.md
pnpm exec tsc --noEmit
```

Tidak ada browser QA sesuai instruksi. Test membuktikan mekanika kebijakan, bukan kebenaran biaya produksi.

## 11. Keputusan yang belum selesai

Tarif riil, nilai kredit finansial, dan rollout charging baru tetap menunggu benchmark serta persetujuan owner. Harga dan alokasi paket tidak berubah. Persetujuan trial hanya mencakup aturan pada bagian 7, bukan tarif produksi.
