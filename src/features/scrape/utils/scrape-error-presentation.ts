export type ScrapePartialResultKind = "pages" | "images" | "documents";

export interface ScrapePartialResult {
	title: string;
	availableLabel: string;
	failedLabel: string | null;
	actionLabel: string;
}

export interface ScrapeErrorPresentationInput {
	code: string;
	message?: string | null;
	retryAfterSeconds?: number | null;
	retryAfterExpiresAt?: string | null;
	partialResults?: number | null;
	partialFailed?: number | null;
	partialKind?: ScrapePartialResultKind | null;
	now?: number;
}

export interface ScrapeErrorPresentation {
	title: string;
	guidance: string;
	retryable: boolean;
	retryHint: string | null;
	technicalDetail: string;
	retryAfterExpiresAt: string | null;
	retryAfterRemaining: number | null;
	partial: ScrapePartialResult | null;
}

const PARTIAL_UNIT: Record<ScrapePartialResultKind, { available: string }> = {
	pages: { available: "halaman" },
	images: { available: "gambar" },
	documents: { available: "dokumen" },
};

// A saved-result count is only shown when something was actually saved, and a
// failure count is only paired with it, so the card never implies partial
// results that do not exist on disk.
export function resolveScrapePartialResult(input: {
	partialResults?: number | null;
	partialFailed?: number | null;
	partialKind?: ScrapePartialResultKind | null;
}): ScrapePartialResult | null {
	const saved = input.partialResults;
	if (typeof saved !== "number" || !Number.isFinite(saved) || saved <= 0)
		return null;
	const kind: ScrapePartialResultKind = input.partialKind ?? "images";
	const unit = PARTIAL_UNIT[kind].available;
	const failed = input.partialFailed;
	const failedLabel =
		typeof failed === "number" && Number.isFinite(failed) && failed > 0
			? kind === "images"
				? `${failed} gambar tidak berhasil diambil`
				: `${failed} ${unit} gagal diambil`
			: null;
	return {
		title: "Sebagian proses tidak selesai",
		availableLabel: `${saved} ${unit} tersedia`,
		failedLabel,
		actionLabel: "Lihat hasil tersedia",
	};
}

const STACK_TRACE_MARKERS = [
	/\n\s*at\s+\S/,
	/\bECONNREFUSED\b/,
	/\bETIMEDOUT\b/,
	/\bstack\b/i,
	/\/[^\s]*\.(?:ts|js):\d+:\d+/,
	/\b(?:Error|TypeError|RangeError):\s/,
];

// Public failure copy must never expose a raw server exception. A message is
// only reused when it reads as authored guidance: single line, bounded length,
// and free of stack-trace or driver-error markers.
export function sanitizePublicScrapeMessage(
	message: string | null | undefined,
): string | null {
	if (typeof message !== "string") return null;
	const trimmed = message.trim();
	if (trimmed.length === 0 || trimmed.length > 240) return null;
	if (trimmed.includes("\n") || trimmed.includes("\r")) return null;
	for (const marker of STACK_TRACE_MARKERS)
		if (marker.test(trimmed)) return null;
	return trimmed;
}

function retryAfterSecondsOf(value: number | null | undefined): number | null {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
		return null;
	return Math.ceil(value);
}

function remainingFromDeadline(
	expiresAt: string | null | undefined,
	fallbackSeconds: number | null | undefined,
	now: number,
): number | null {
	if (typeof expiresAt === "string" && expiresAt.trim().length > 0) {
		const target = Date.parse(expiresAt);
		if (Number.isFinite(target))
			return Math.max(0, Math.ceil((target - now) / 1000));
	}
	return retryAfterSecondsOf(fallbackSeconds);
}

function retryAfterText(value: number | null | undefined): string | null {
	const seconds = retryAfterSecondsOf(value);
	if (seconds === null) return null;
	return `Tunggu sekitar ${seconds} detik sebelum mencoba lagi.`;
}

function deadlineHint(remaining: number | null): string | null {
	if (remaining === null) return null;
	if (remaining <= 0) return "Waktu tunggu berakhir. Coba lagi.";
	return `Permintaan berikutnya dapat dicoba setelah waktu tunggu dari website berakhir. Sisa waktu: ${remaining} detik.`;
}

function resolveScrapeErrorBase(
	input: ScrapeErrorPresentationInput,
): Omit<ScrapeErrorPresentation, "partial"> {
	const now = typeof input.now === "number" ? input.now : Date.now();
	const expiresAt =
		typeof input.retryAfterExpiresAt === "string" &&
		input.retryAfterExpiresAt.trim().length > 0
			? input.retryAfterExpiresAt
			: null;
	const remaining = remainingFromDeadline(
		expiresAt,
		input.retryAfterSeconds,
		now,
	);
	const retryHint =
		remaining !== null && expiresAt !== null
			? deadlineHint(remaining)
			: retryAfterText(input.retryAfterSeconds);
	const base = {
		retryAfterExpiresAt: expiresAt,
		retryAfterRemaining: remaining,
	};

	switch (input.code) {
		case "WEBSITE_RATE_LIMITED": {
			if (remaining === null)
				return {
					title: "Website membatasi akses",
					guidance:
						"Website tujuan sedang membatasi permintaan otomatis. Karena itu, gambar belum berhasil diambil. Website tidak memberi informasi kapan pembatasan berakhir. Gunakan URL lain yang mengizinkan pengambilan konten.",
					retryable: false,
					retryHint: null,
					technicalDetail: "Detail teknis: HTTP 429",
					...base,
					retryAfterRemaining: null,
				};
			return {
				title: "Website membatasi akses",
				guidance:
					"Website tujuan sedang membatasi permintaan otomatis. Karena itu, gambar belum berhasil diambil. Permintaan berikutnya dapat dicoba setelah waktu tunggu dari website berakhir.",
				retryable: true,
				retryHint,
				technicalDetail: `Detail teknis: HTTP 429 · Retry-After: ${remaining} dtk`,
				...base,
			};
		}
		case "RATE_LIMITED":
			return {
				title: "Batas request tercapai",
				guidance:
					"Permintaan terlalu sering dalam waktu singkat. Tunggu sebentar sebelum mencoba lagi.",
				retryable: true,
				retryHint,
				technicalDetail: "Detail teknis: HTTP 429 (batas aplikasi)",
				...base,
			};
		case "QUEUE_CAPACITY":
			return {
				title: "Antrean sedang penuh",
				guidance: "Tunggu proses aktif selesai sebelum memulai ekstraksi baru.",
				retryable: true,
				retryHint,
				technicalDetail: "Detail teknis: kapasitas antrean",
				...base,
			};
		case "INVALID_URL":
			return {
				title: "URL tidak valid",
				guidance:
					"Masukkan URL website publik yang benar, lalu mulai dari link yang baru.",
				retryable: false,
				retryHint: null,
				technicalDetail: "Detail teknis: URL tidak valid",
				...base,
			};
		case "PRIVATE_URL_BLOCKED":
			return {
				title: "URL tidak dapat diproses",
				guidance:
					"URL ini tidak dapat diproses karena alasan keamanan. Gunakan URL website publik yang lain.",
				retryable: false,
				retryHint: null,
				technicalDetail: "Detail teknis: URL privat diblokir",
				...base,
			};
		case "WEBSITE_ACCESS_DENIED":
			return {
				title: "Website menolak akses otomatis",
				guidance:
					"Situs ini tidak dapat di-capture tanpa akses resmi. Gunakan website lain yang mengizinkan scraping.",
				retryable: false,
				retryHint: null,
				technicalDetail: "Detail teknis: HTTP 401/403",
				...base,
			};
		case "WEBSITE_NOT_FOUND":
			return {
				title: "Halaman tidak ditemukan",
				guidance:
					"Website membalas halaman tidak ditemukan. Periksa kembali URL-nya atau gunakan URL lain.",
				retryable: false,
				retryHint: null,
				technicalDetail: "Detail teknis: HTTP 404/410",
				...base,
			};
		case "WEBSITE_SERVER_ERROR":
			return {
				title: "Website mengalami gangguan",
				guidance:
					"Website mengalami gangguan di sisinya. Coba lagi setelah beberapa saat.",
				retryable: true,
				retryHint,
				technicalDetail: "Detail teknis: HTTP 5xx",
				...base,
			};
		case "WEBSITE_BLOCKED":
			return {
				title: "Website tidak dapat diakses",
				guidance:
					"Website tidak dapat diakses oleh sistem. Coba lagi, atau gunakan website lain.",
				retryable: true,
				retryHint,
				technicalDetail: "Detail teknis: akses diblokir",
				...base,
			};
		case "WEBSITE_NAVIGATION_TIMEOUT":
			return {
				title: "Halaman belum berhasil diambil",
				guidance:
					"Proses terhenti saat membuka halaman website. Website tidak menyelesaikan pemuatan dalam batas waktu sistem, dan tidak ada respons HTTP yang dapat diverifikasi. Coba lagi nanti atau gunakan halaman lain.",
				retryable: true,
				retryHint,
				technicalDetail:
					"Detail teknis: navigation timeout (tanpa respons HTTP)",
				...base,
			};
		case "JOB_TIMEOUT":
			return {
				title: "Proses dihentikan batas waktu sistem",
				guidance:
					"Sistem menghentikan pemrosesan karena melewati batas waktu job. Ini kendala di sisi sistem, bukan respons dari website. Coba lagi; hasil yang sudah tersimpan tetap tersedia.",
				retryable: true,
				retryHint,
				technicalDetail: "Detail teknis: job timeout (sisi sistem)",
				...base,
			};
		case "CAPTURE_FAILED":
			return {
				title: "Halaman gagal ditangkap sistem",
				guidance:
					"Sistem gagal menyiapkan atau membaca hasil render halaman. Ini kendala di sisi sistem, bukan penolakan dari website. Coba lagi sebentar lagi.",
				retryable: true,
				retryHint,
				technicalDetail: "Detail teknis: capture gagal (sisi sistem)",
				...base,
			};
		case "ASSET_FETCH_FAILED":
			return {
				title: "Resource halaman gagal diambil",
				guidance:
					"Resource yang dibutuhkan halaman tidak berhasil diambil, sehingga hasilnya belum bisa dianalisis. Coba lagi, atau gunakan halaman lain.",
				retryable: true,
				retryHint,
				technicalDetail: "Detail teknis: pengambilan resource gagal",
				...base,
			};
		case "WORKER_INTERRUPTED":
			return {
				title: "Pemrosesan terhenti di worker",
				guidance:
					"Proses tidak selesai karena worker berhenti sebelum job tuntas. Ini kendala di sisi sistem, bukan respons dari website. Coba lagi untuk memproses ulang.",
				retryable: true,
				retryHint,
				technicalDetail: "Detail teknis: worker interrupted",
				...base,
			};
		case "FETCH_TIMEOUT":
			return {
				title: "Website terlalu lama merespons",
				guidance:
					"Website terlalu lama merespons permintaan resource. Coba lagi nanti.",
				retryable: true,
				retryHint,
				technicalDetail: "Detail teknis: transport timeout",
				...base,
			};
		case "NO_ANALYZABLE_CONTENT":
			return {
				title: "Konten tidak cukup untuk dianalisis",
				guidance:
					"Sistem tidak menemukan konten yang cukup untuk dianalisis. Coba lagi, atau gunakan halaman dengan konten yang dapat dibaca.",
				retryable: true,
				retryHint,
				technicalDetail: "Detail teknis: konten kosong",
				...base,
			};
		case "AI_GENERATION_FAILED":
			return {
				title: "Hasil belum bisa dibuat",
				guidance: "Coba ulangi dari link yang sama.",
				retryable: true,
				retryHint,
				technicalDetail: "Detail teknis: generasi AI gagal",
				...base,
			};
		case "STORAGE_FAILED":
			return {
				title: "Kendala saat menyimpan hasil",
				guidance: "Terjadi kendala saat menyimpan hasil. Coba lagi.",
				retryable: true,
				retryHint,
				technicalDetail: "Detail teknis: penyimpanan gagal",
				...base,
			};
		default: {
			const fallbackMessage = sanitizePublicScrapeMessage(input.message);
			return {
				title: "Pemrosesan berhenti",
				guidance:
					fallbackMessage ??
					"Pemrosesan berhenti karena kendala teknis yang tidak terduga. Coba lagi.",
				retryable: true,
				retryHint,
				technicalDetail: `Detail teknis: ${input.code}`,
				...base,
			};
		}
	}
}

export function resolveScrapeErrorPresentation(
	input: ScrapeErrorPresentationInput,
): ScrapeErrorPresentation {
	return {
		...resolveScrapeErrorBase(input),
		partial: resolveScrapePartialResult(input),
	};
}
