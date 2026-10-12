export interface ScrapeErrorPresentationInput {
	code: string;
	message?: string | null;
	retryAfterSeconds?: number | null;
	retryAfterExpiresAt?: string | null;
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

export function resolveScrapeErrorPresentation(
	input: ScrapeErrorPresentationInput,
): ScrapeErrorPresentation {
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
		case "FETCH_TIMEOUT":
			return {
				title: "Website terlalu lama merespons",
				guidance: "Website terlalu lama merespons. Coba lagi nanti.",
				retryable: true,
				retryHint,
				technicalDetail: "Detail teknis: timeout",
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
				...base,
			};
		}
	}
}
