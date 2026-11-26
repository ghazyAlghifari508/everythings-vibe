# Shadow Usage Metering dan Benchmark Operasional

Dokumen ini menjelaskan cara mengumpulkan bukti biaya operasional Studio dan Scrape tanpa mengubah tariff kredit produksi.

## Prinsip

Shadow metering bersifat observasional. Alurnya: user menjalankan operasi seperti biasa, worker menyelesaikan pekerjaan, lalu mencatat usage ke tabel `shadow_usage_records`. Metering tidak memotong kredit, tidak menyentuh entitlement trial, dan tidak membuat catatan charge finansial. Greenfield dan Codebase Existing tetap memakai billing nyata mereka.

## Identitas dan idempotensi

Satu baris mewakili satu attempt, bukan satu operasi logis:

- `logicalJobId`: ID job Studio atau ID scrape, stabil untuk seluruh retry.
- `attemptId`: pasangan `logicalJobId:attemptIndex`, unik per attempt.
- `dedupeKey`: `productFamily:logicalJobId:attemptIndex:operationKind`.
- Unique index `(user_id, dedupe_key)` dengan `onConflictDoNothing` menjamin pengiriman ulang tidak menambah baris.

Attempt gagal tetap dicatat dengan `completedUnits = 0`. Biayanya tidak hilang dari analisis. Total biaya dibagi total unit sukses, sehingga kegagalan tidak disembunyikan.

## Matrix skenario

Batas nyata diverifikasi dari kode: `SCRAPE_LIMITS.maxPages = 50`, `maxDepth = 5`, `maxFrames = 10`, `maxActiveJobs = 2`, dan `designViews = 4`. Studio hanya menjalankan jumlah frame yang diminta user selama masih dalam batas dukungan.

| Produk | Skenario | Status |
| :-- | :-- | :-- |
| Studio | Generate 1, 3, 5 frame | Prosedur siap, pengukuran nyata pending |
| Studio | Revisi sederhana dan kompleks | Prosedur siap, pengukuran nyata pending |
| Studio | Tambah frame | Prosedur siap, pengukuran nyata pending |
| Studio | Regenerate | Prosedur siap, pengukuran nyata pending |
| Studio | Partial success | Prosedur siap, pengukuran nyata pending |
| Scrape | Crawl 1, 10, 50 halaman | Prosedur siap, pengukuran nyata pending |
| Scrape | Ekstraksi HTML sederhana dan kompleks | Prosedur siap, pengukuran nyata pending |
| Scrape | Ekstraksi gambar pada berbagai ukuran halaman | Prosedur siap, pengukuran nyata pending |
| Scrape | DESIGN.md dengan kombinasi `viewport`, `theme`, `depth`, `focus`, `codeReference` yang didukung | Prosedur siap, pengukuran nyata pending |
| Keduanya | Retry, failure, cancellation | Prosedur siap, pengukuran nyata pending |

## Prosedur reproduce

1. Siapkan environment terisolasi dengan database migrate penuh (termasuk `0046_damp_archangel.sql`) dan fixture HTML lokal milik sendiri. Jangan crawl situs pihak ketiga tanpa izin.
2. Pastikan mode provider yang dipakai adalah mode yang sama dengan produksi yang ingin diukur. Jika penyedia bersifat promosi atau gratis, catat sebagai kondisi nyata, jadi bukan sebagai biaya produksi.
3. Jalankan tiap skenario minimal 20 attempt agar p95 dapat dihitung. Di bawah 20 sample, `p95DurationMs` bernilai `null` dan `p95UnavailableReason` diisi. Ini mencegah p95 palsu.
4. Untuk skenario retry, gagalkan attempt pertama secara sengaja lalu biarkan worker retry. `retryCount` mencakup `jobAttempts - 1` dan retry internal provider.
5. Untuk cancellation, batalkan lewat sinyal worker yang sama dengan produksi. Record tetap ditulis dengan outcome `cancelled`.
6. Ambil ringkasan lewat server function admin `getShadowUsageBenchmark`, atau panggil `buildBenchmarkReport` langsung atas baris yang sudah divalidasi Zod.
7. Simpan hasil beserta tanggal pengambilan, versi skema, dan versi model provider. Jangan campur sample dari kondisi berbeda dalam satu grup.

Server function admin hanya mengembalikan kolom numerik dan status. Prompt, URL lengkap, header, konten halaman, dan artifact tidak dikirim ke UI monitoring.

## Akurasi biaya

Tiga kategori biaya disimpan terpisah dan boleh bernilai `null`:

- `measuredProviderMinor`: angka nyata dari penyedia bila tersedia.
- `estimatedProviderMinor`: estimasi dengan asumsi yang harus dicantumkan.
- `estimatedInfrastructureMinor`: estimasi infrastruktur.

`status: "unknown"` berarti tidak ada harga terverifikasi. `null` bukan nol. Field `unmeasuredComponents` menyebut komponen yang belum terukur, misalnya `provider_pricing`, `infrastructure`, dan `bandwidth`.

Skenario berbayar yang dihitung dari harga resmi harus memakai `priceSource` dan `effectiveDate` pada `paidScenario`, serta diberi label jelas sebagai simulasi. Skenario tersebut bukan pengeluaran yang benar-benar terjadi. Satu kredit tidak pernah disamakan dengan nilai mata uang tetap tanpa model keuangan yang disetujui.

## Resource dan atribusi

Metering menyimpan `measurementScope: "operation"` untuk metrik yang benar-benar milik satu operasi, seperti token provider, halaman yang diproses, dan durasi browser. Field `processCpuMs` dan `processRssBytes` disediakan untuk pengukuran shared resource, tetapi sengaja dibiarkan `null` sampai ada pengukuran per-job yang andal. Worker dapat menjalankan beberapa job bersamaan, sehingga CPU dan RSS seluruh proses tidak boleh diklaim sebagai konsumsi satu job.

Downloaded bytes juga dibiarkan `null` sampai ada pengukuran transfer per-request. Output bytes dan artifact size diisi hanya bila nilai nyata tersedia.

## Retensi

`expiresAt = recordedAt + SHADOW_USAGE_RETENTION_DAYS` dengan nilai 90 hari. Baris lama dibersihkan lewat index `shadow_usage_records_expires_at_idx`. Retensi ini cukup untuk membandingkan siklus bulanan tanpa menyimpan telemetry tanpa batas.

## Pengukuran yang masih pending

Lingkungan ini tidak memiliki kredensial provider berbayar, anggaran spending, atau fixture skala penuh untuk crawl 50 halaman. Karena itu semua skenario pada matrix masih berstatus prosedur siap dengan pengukuran nyata pending. Mock test hanya membuktikan instrumentasi bekerja, bukan menentukan biaya produksi. Kumpulkan sample nyata di environment terkontrol sebelum menetapkan tariff.
