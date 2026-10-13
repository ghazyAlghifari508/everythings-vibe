export const DESIGN_ERROR_CODES = {
	QUEUE_CAPACITY: "Tunggu proses aktif selesai sebelum memulai ekstraksi baru.",
	RATE_LIMITED: "Batas request tercapai. Coba lagi setelah satu menit.",
	INVALID_URL: "URL tidak valid. Masukkan URL website yang benar.",
	PRIVATE_URL_BLOCKED: "URL tidak dapat diproses karena alasan keamanan.",
	FETCH_TIMEOUT: "Website terlalu lama merespons. Coba lagi nanti.",
	WEBSITE_BLOCKED: "Website tidak dapat diakses oleh sistem.",
	WEBSITE_RATE_LIMITED:
		"Website membatasi jumlah permintaan. Tunggu beberapa saat lalu coba lagi.",
	WEBSITE_ACCESS_DENIED:
		"Website menolak akses otomatis. Situs ini tidak dapat di-capture tanpa akses resmi.",
	WEBSITE_NOT_FOUND:
		"Website membalas halaman tidak ditemukan. Periksa kembali URL-nya.",
	WEBSITE_SERVER_ERROR:
		"Website mengalami gangguan di sisinya. Coba lagi setelah beberapa saat.",
	NO_ANALYZABLE_CONTENT:
		"Sistem tidak menemukan konten yang cukup untuk dianalisis.",
	AI_GENERATION_FAILED:
		"DESIGN.md belum bisa dibuat. Coba ulangi dari link yang sama.",
	VISUAL_CAPTURE_FAILED:
		"Pratinjau visual frame gagal dirender. HTML frame tetap tersimpan.",
	STORAGE_FAILED: "Terjadi kendala saat menyimpan hasil.",
	UNEXPECTED_ERROR:
		"Pemrosesan berhenti karena kendala teknis yang tidak terduga.",
} as const;

export type DesignErrorCode = keyof typeof DESIGN_ERROR_CODES;

export class ScrapeError extends Error {
	constructor(
		public code: DesignErrorCode,
		message?: string,
		options?: ErrorOptions & { retryAfterSeconds?: number },
	) {
		super(message ?? DESIGN_ERROR_CODES[code], options);
		this.name = "ScrapeError";
		this.retryAfterSeconds = options?.retryAfterSeconds;
	}

	// Present only when the upstream website supplied a usable Retry-After
	// signal, so callers never invent a wait duration.
	readonly retryAfterSeconds?: number;
}

const HTTP_STATUS_ERROR_CODES: {
	test: (status: number) => boolean;
	code: DesignErrorCode;
}[] = [
	{ test: (status) => status === 429, code: "WEBSITE_RATE_LIMITED" },
	{
		test: (status) => status === 401 || status === 403,
		code: "WEBSITE_ACCESS_DENIED",
	},
	{
		test: (status) => status === 404 || status === 410,
		code: "WEBSITE_NOT_FOUND",
	},
	{ test: (status) => status >= 500, code: "WEBSITE_SERVER_ERROR" },
	{ test: () => true, code: "WEBSITE_BLOCKED" },
];

export function designErrorCodeForHttpStatus(status: number): DesignErrorCode {
	return (
		HTTP_STATUS_ERROR_CODES.find((entry) => entry.test(status))?.code ??
		"WEBSITE_BLOCKED"
	);
}

export function parseRetryAfterSeconds(
	value: string | null | undefined,
	now = Date.now(),
): number | undefined {
	if (!value) return undefined;
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
		const seconds = Number(trimmed);
		return Number.isFinite(seconds) && seconds >= 0
			? Math.ceil(seconds)
			: undefined;
	}
	const date = Date.parse(trimmed);
	if (!Number.isFinite(date)) return undefined;
	return Math.max(0, Math.ceil((date - now) / 1000));
}
