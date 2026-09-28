export const DESIGN_ERROR_CODES = {
	INVALID_URL: "URL tidak valid. Masukkan URL website yang benar.",
	PRIVATE_URL_BLOCKED: "URL tidak dapat diproses karena alasan keamanan.",
	FETCH_TIMEOUT: "Website terlalu lama merespons. Coba lagi nanti.",
	WEBSITE_BLOCKED: "Website tidak dapat diakses oleh sistem.",
	NO_ANALYZABLE_CONTENT:
		"Sistem tidak menemukan konten yang cukup untuk dianalisis.",
	AI_GENERATION_FAILED: "Generate DESIGN.md gagal. Coba ulangi proses.",
	STORAGE_FAILED: "Terjadi kendala saat menyimpan hasil.",
} as const;

export type DesignErrorCode = keyof typeof DESIGN_ERROR_CODES;

export class ScrapeError extends Error {
	constructor(
		public code: DesignErrorCode,
		message?: string,
		options?: ErrorOptions,
	) {
		super(message ?? DESIGN_ERROR_CODES[code], options);
		this.name = "ScrapeError";
	}
}
