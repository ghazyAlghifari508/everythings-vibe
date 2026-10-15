export const DESIGN_ERROR_CODES = {
	QUEUE_CAPACITY: "Tunggu proses aktif selesai sebelum memulai ekstraksi baru.",
	RATE_LIMITED: "Batas request tercapai. Coba lagi setelah satu menit.",
	INVALID_URL: "URL tidak valid. Masukkan URL website yang benar.",
	PRIVATE_URL_BLOCKED: "URL tidak dapat diproses karena alasan keamanan.",
	FETCH_TIMEOUT: "Website terlalu lama merespons permintaan resource.",
	WEBSITE_BLOCKED: "Website tidak dapat diakses oleh sistem.",
	WEBSITE_RATE_LIMITED:
		"Website membatasi jumlah permintaan. Tunggu beberapa saat lalu coba lagi.",
	WEBSITE_ACCESS_DENIED:
		"Website menolak akses otomatis. Situs ini tidak dapat di-capture tanpa akses resmi.",
	WEBSITE_NOT_FOUND:
		"Website membalas halaman tidak ditemukan. Periksa kembali URL-nya.",
	WEBSITE_SERVER_ERROR:
		"Website mengalami gangguan di sisinya. Coba lagi setelah beberapa saat.",
	WEBSITE_NAVIGATION_TIMEOUT:
		"Website tidak menyelesaikan pemuatan halaman dalam batas waktu sistem.",
	CAPTURE_FAILED:
		"Sistem gagal menyiapkan atau menangkap halaman website. Ini kendala di sisi sistem, bukan respons dari website.",
	ASSET_FETCH_FAILED:
		"Resource halaman tidak berhasil diambil sehingga hasilnya tidak dapat dianalisis.",
	JOB_TIMEOUT:
		"Proses dihentikan karena melewati batas waktu sistem. Ini kendala di sisi sistem, bukan respons dari website.",
	WORKER_INTERRUPTED:
		"Pemrosesan terhenti sebelum selesai karena worker tidak menyelesaikan job.",
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

// Which part of the pipeline actually failed. Kept separate from the error code
// so the UI can answer "apakah ini website, capture, asset, worker, atau
// storage" without re-deriving it from copy.
export type ScrapeErrorSource =
	| "request"
	| "website"
	| "capture"
	| "asset"
	| "worker"
	| "storage"
	| "internal";

export type ScrapeFailureReason =
	| "queue-capacity"
	| "app-rate-limited"
	| "invalid-url"
	| "private-url"
	| "transport-timeout"
	| "connection-failed"
	| "rate-limited"
	| "access-denied"
	| "not-found"
	| "server-error"
	| "navigation-timeout"
	| "resource-load-timeout"
	| "content-capture"
	| "browser-init"
	| "page-content"
	| "asset-unavailable"
	| "too-small"
	| "no-meaningful-content"
	| "job-timeout"
	| "lease-lost"
	| "worker-interrupted"
	| "generation-failed"
	| "storage-failed"
	| "unknown";

const ERROR_SOURCES: Record<DesignErrorCode, ScrapeErrorSource> = {
	QUEUE_CAPACITY: "request",
	RATE_LIMITED: "request",
	INVALID_URL: "request",
	PRIVATE_URL_BLOCKED: "request",
	FETCH_TIMEOUT: "website",
	WEBSITE_BLOCKED: "website",
	WEBSITE_RATE_LIMITED: "website",
	WEBSITE_ACCESS_DENIED: "website",
	WEBSITE_NOT_FOUND: "website",
	WEBSITE_SERVER_ERROR: "website",
	WEBSITE_NAVIGATION_TIMEOUT: "website",
	CAPTURE_FAILED: "capture",
	ASSET_FETCH_FAILED: "asset",
	JOB_TIMEOUT: "worker",
	WORKER_INTERRUPTED: "worker",
	NO_ANALYZABLE_CONTENT: "capture",
	AI_GENERATION_FAILED: "internal",
	VISUAL_CAPTURE_FAILED: "capture",
	STORAGE_FAILED: "storage",
	UNEXPECTED_ERROR: "internal",
};

const FAILURE_REASONS: Record<DesignErrorCode, ScrapeFailureReason> = {
	QUEUE_CAPACITY: "queue-capacity",
	RATE_LIMITED: "app-rate-limited",
	INVALID_URL: "invalid-url",
	PRIVATE_URL_BLOCKED: "private-url",
	FETCH_TIMEOUT: "transport-timeout",
	WEBSITE_BLOCKED: "connection-failed",
	WEBSITE_RATE_LIMITED: "rate-limited",
	WEBSITE_ACCESS_DENIED: "access-denied",
	WEBSITE_NOT_FOUND: "not-found",
	WEBSITE_SERVER_ERROR: "server-error",
	WEBSITE_NAVIGATION_TIMEOUT: "navigation-timeout",
	CAPTURE_FAILED: "content-capture",
	ASSET_FETCH_FAILED: "asset-unavailable",
	JOB_TIMEOUT: "job-timeout",
	WORKER_INTERRUPTED: "worker-interrupted",
	NO_ANALYZABLE_CONTENT: "no-meaningful-content",
	AI_GENERATION_FAILED: "generation-failed",
	VISUAL_CAPTURE_FAILED: "content-capture",
	STORAGE_FAILED: "storage-failed",
	UNEXPECTED_ERROR: "unknown",
};

const HTTP_STATUSES: Record<DesignErrorCode, number> = {
	QUEUE_CAPACITY: 409,
	RATE_LIMITED: 429,
	INVALID_URL: 400,
	PRIVATE_URL_BLOCKED: 400,
	FETCH_TIMEOUT: 502,
	WEBSITE_BLOCKED: 502,
	WEBSITE_RATE_LIMITED: 429,
	WEBSITE_ACCESS_DENIED: 502,
	WEBSITE_NOT_FOUND: 502,
	WEBSITE_SERVER_ERROR: 502,
	WEBSITE_NAVIGATION_TIMEOUT: 502,
	CAPTURE_FAILED: 500,
	ASSET_FETCH_FAILED: 502,
	JOB_TIMEOUT: 503,
	WORKER_INTERRUPTED: 503,
	NO_ANALYZABLE_CONTENT: 500,
	AI_GENERATION_FAILED: 500,
	VISUAL_CAPTURE_FAILED: 500,
	STORAGE_FAILED: 500,
	UNEXPECTED_ERROR: 500,
};

// Only failures a fresh attempt can plausibly resolve are retryable. Refusals
// that come from the site's own final answer, and request-level rejections,
// stay non-retryable so a retry never hammers a site that already said no.
const NON_RETRYABLE_CODES = new Set<string>([
	"INVALID_URL",
	"PRIVATE_URL_BLOCKED",
	"WEBSITE_ACCESS_DENIED",
	"WEBSITE_NOT_FOUND",
]);

export function isDesignErrorCode(value: unknown): value is DesignErrorCode {
	return typeof value === "string" && value in DESIGN_ERROR_CODES;
}

export function errorSourceForCode(code: DesignErrorCode): ScrapeErrorSource {
	return ERROR_SOURCES[code];
}

export function scrapeFailureReasonForCode(
	code: DesignErrorCode,
): ScrapeFailureReason {
	return FAILURE_REASONS[code];
}

export function httpStatusForErrorCode(code: DesignErrorCode): number {
	return HTTP_STATUSES[code];
}

// Unknown codes are not verifiably retryable, so the retry action stays hidden
// instead of offering an action we cannot justify.
export function isRetryableScrapeErrorCode(
	code: string | null | undefined,
): boolean {
	if (!code || !isDesignErrorCode(code)) return false;
	return !NON_RETRYABLE_CODES.has(code);
}

export class ScrapeError extends Error {
	constructor(
		public code: DesignErrorCode,
		message?: string,
		options?: ErrorOptions & {
			retryAfterSeconds?: number;
			httpStatus?: number;
			finalUrl?: string;
			failureReason?: ScrapeFailureReason;
		},
	) {
		super(message ?? DESIGN_ERROR_CODES[code], options);
		this.name = "ScrapeError";
		this.retryAfterSeconds = options?.retryAfterSeconds;
		this.httpStatus = options?.httpStatus;
		this.finalUrl = options?.finalUrl;
		this.failureReason =
			options?.failureReason ?? scrapeFailureReasonForCode(code);
	}

	// Present only when the upstream website supplied a usable Retry-After
	// signal, so callers never invent a wait duration.
	readonly retryAfterSeconds?: number;

	// Present only when an actual HTTP response was received, so a status is
	// never displayed for a failure that never got one.
	readonly httpStatus?: number;

	// Present only when the page actually resolved to a URL, so the diagnostic
	// metadata can answer whether a final URL existed after redirects.
	readonly finalUrl?: string;

	readonly failureReason: ScrapeFailureReason;
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
