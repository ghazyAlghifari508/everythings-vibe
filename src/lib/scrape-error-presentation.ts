export interface ScrapeErrorPresentationInput {
	code: string;
	// Persisted message, used only when the code is unknown to future-proof
	// rows. Known codes resolve purely from the code, never from this text.
	message?: string | null;
	retryAfterSeconds?: number | null;
}

export interface ScrapeErrorPresentation {
	title: string;
	guidance: string;
	retryable: boolean;
	retryHint: string | null;
	technicalDetail: string;
}

function retryAfterSecondsOf(value: number | null | undefined): number | null {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
		return null;
	return Math.ceil(value);
}

function retryAfterText(value: number | null | undefined): string | null {
	const seconds = retryAfterSecondsOf(value);
	if (seconds === null) return null;
	return `Tunggu sekitar ${seconds} detik sebelum mencoba lagi.`;
}

export function resolveScrapeErrorPresentation(
	input: ScrapeErrorPresentationInput,
): ScrapeErrorPresentation {
	const retryHint = retryAfterText(input.retryAfterSeconds);
	const retryAfterSeconds = retryAfterSecondsOf(input.retryAfterSeconds);
	switch (input.code) {
		case "WEBSITE_RATE_LIMITED":
			return {
				title: "Website membatasi akses",
				guidance:
					"Website tujuan membatasi permintaan otomatis. Hasil belum dapat diambil. Tunggu sebelum mencoba lagi, atau gunakan website lain yang mengizinkan scraping.",
				retryable: true,
				retryHint,
				technicalDetail:
					retryAfterSeconds === null
						? "Detail teknis: HTTP 429"
						: `Detail teknis: HTTP 429 · Retry-After: ${retryAfterSeconds} dtk`,
			};
		case "RATE_LIMITED":
			return {
				title: "Batas request tercapai",
				guidance:
					"Permintaan terlalu sering dalam waktu singkat. Tunggu sebentar sebelum mencoba lagi.",
				retryable: true,
				retryHint,
				technicalDetail: "Detail teknis: HTTP 429 (batas aplikasi)",
			};
		case "QUEUE_CAPACITY":
			return {
				title: "Antrean sedang penuh",
				guidance: "Tunggu proses aktif selesai sebelum memulai ekstraksi baru.",
				retryable: true,
				retryHint,
				technicalDetail: "Detail teknis: kapasitas antrean",
			};
		case "INVALID_URL":
			return {
				title: "URL tidak valid",
				guidance:
					"Masukkan URL website publik yang benar, lalu mulai dari link yang baru.",
				retryable: false,
				retryHint: null,
				technicalDetail: "Detail teknis: URL tidak valid",
			};
		case "PRIVATE_URL_BLOCKED":
			return {
				title: "URL tidak dapat diproses",
				guidance:
					"URL ini tidak dapat diproses karena alasan keamanan. Gunakan URL website publik yang lain.",
				retryable: false,
				retryHint: null,
				technicalDetail: "Detail teknis: URL privat diblokir",
			};
		case "WEBSITE_ACCESS_DENIED":
			return {
				title: "Website menolak akses otomatis",
				guidance:
					"Situs ini tidak dapat di-capture tanpa akses resmi. Gunakan website lain yang mengizinkan scraping.",
				retryable: false,
				retryHint: null,
				technicalDetail: "Detail teknis: HTTP 401/403",
			};
		case "WEBSITE_NOT_FOUND":
			return {
				title: "Halaman tidak ditemukan",
				guidance:
					"Website membalas halaman tidak ditemukan. Periksa kembali URL-nya atau gunakan URL lain.",
				retryable: false,
				retryHint: null,
				technicalDetail: "Detail teknis: HTTP 404/410",
			};
		case "WEBSITE_SERVER_ERROR":
			return {
				title: "Website mengalami gangguan",
				guidance:
					"Website mengalami gangguan di sisinya. Coba lagi setelah beberapa saat.",
				retryable: true,
				retryHint,
				technicalDetail: "Detail teknis: HTTP 5xx",
			};
		case "WEBSITE_BLOCKED":
			return {
				title: "Website tidak dapat diakses",
				guidance:
					"Website tidak dapat diakses oleh sistem. Coba lagi, atau gunakan website lain.",
				retryable: true,
				retryHint,
				technicalDetail: "Detail teknis: akses diblokir",
			};
		case "FETCH_TIMEOUT":
			return {
				title: "Website terlalu lama merespons",
				guidance: "Website terlalu lama merespons. Coba lagi nanti.",
				retryable: true,
				retryHint,
				technicalDetail: "Detail teknis: timeout",
			};
		case "NO_ANALYZABLE_CONTENT":
			return {
				title: "Konten tidak cukup untuk dianalisis",
				guidance:
					"Sistem tidak menemukan konten yang cukup untuk dianalisis. Coba lagi, atau gunakan halaman dengan konten yang dapat dibaca.",
				retryable: true,
				retryHint,
				technicalDetail: "Detail teknis: konten kosong",
			};
		case "AI_GENERATION_FAILED":
			return {
				title: "Hasil belum bisa dibuat",
				guidance: "Coba ulangi dari link yang sama.",
				retryable: true,
				retryHint,
				technicalDetail: "Detail teknis: generasi AI gagal",
			};
		case "STORAGE_FAILED":
			return {
				title: "Kendala saat menyimpan hasil",
				guidance: "Terjadi kendala saat menyimpan hasil. Coba lagi.",
				retryable: true,
				retryHint,
				technicalDetail: "Detail teknis: penyimpanan gagal",
			};
		default: {
			const fallbackMessage =
				typeof input.message === "string" && input.message.trim().length > 0
					? input.message
					: null;
			return {
				title: "Pemrosesan berhenti",
				guidance:
					fallbackMessage ??
					"Pemrosesan berhenti karena kendala teknis yang tidak terduga. Coba lagi.",
				retryable: true,
				retryHint,
				technicalDetail: `Detail teknis: ${input.code}`,
			};
		}
	}
}
