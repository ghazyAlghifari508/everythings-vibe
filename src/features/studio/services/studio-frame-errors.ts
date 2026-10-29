import { ScrapeError } from "@/lib/design-errors";

export type StudioFrameErrorCode =
	| "STUDIO_INVALID_INPUT"
	| "STUDIO_FRAME_FAILED"
	| "STUDIO_CONTRACT_VIOLATION"
	| "STUDIO_PROVIDER_INCOMPLETE"
	| "STUDIO_PROVIDER_UNAVAILABLE"
	| "STUDIO_PROVIDER_RATE_LIMITED"
	| "STUDIO_PROVIDER_TIMEOUT"
	| "STUDIO_JOB_TIMEOUT"
	| "STUDIO_JOB_LEASE_LOST"
	| "STUDIO_CANCELLED"
	| "STUDIO_STORAGE_FAILED"
	| "STUDIO_PREVIEW_FAILED"
	| "STUDIO_RETRY_RUNNING"
	| "STUDIO_DUPLICATE_SCREEN"
	| "STUDIO_SCREEN_LIMIT"
	| "STUDIO_NOT_FOUND"
	| "STUDIO_UNAUTHORIZED";

interface StudioFrameErrorDescriptor {
	status: number;
	message: string;
}

// Stable internal codes paired with the only copy allowed to reach a user.
// Validator output, provider identifiers and exception text stay in server logs.
export const STUDIO_FRAME_ERRORS: Record<
	StudioFrameErrorCode,
	StudioFrameErrorDescriptor
> = {
	STUDIO_INVALID_INPUT: {
		status: 400,
		message: "Permintaan desain tidak valid.",
	},
	STUDIO_FRAME_FAILED: {
		status: 500,
		message: "Ada kendala saat membuat halaman ini.",
	},
	STUDIO_CONTRACT_VIOLATION: {
		status: 500,
		message: "Desain belum berhasil dibuat. Coba lagi.",
	},
	STUDIO_PROVIDER_INCOMPLETE: {
		status: 502,
		message: "Hasil desain terpotong sebelum selesai. Coba lagi.",
	},
	STUDIO_PROVIDER_UNAVAILABLE: {
		status: 503,
		message: "Layanan desain sedang tidak tersedia. Coba lagi.",
	},
	STUDIO_PROVIDER_RATE_LIMITED: {
		status: 429,
		message: "Permintaan sedang padat. Coba lagi sebentar lagi.",
	},
	STUDIO_PROVIDER_TIMEOUT: {
		status: 504,
		message: "Proses desain melewati batas waktu. Coba lagi.",
	},
	STUDIO_JOB_TIMEOUT: {
		status: 504,
		message: "Proses desain berhenti karena melewati batas waktu. Coba lagi.",
	},
	STUDIO_JOB_LEASE_LOST: {
		status: 409,
		message:
			"Proses sedang dipulihkan sistem. Tunggu sebentar, lalu coba lagi.",
	},
	STUDIO_CANCELLED: {
		status: 409,
		message: "Proses dihentikan sebelum selesai. Coba lagi.",
	},
	STUDIO_STORAGE_FAILED: {
		status: 500,
		message: "Hasil desain belum bisa disimpan. Coba lagi.",
	},
	STUDIO_PREVIEW_FAILED: {
		status: 502,
		message: "Pratinjau belum bisa ditampilkan. Coba muat ulang pratinjau.",
	},
	STUDIO_RETRY_RUNNING: {
		status: 409,
		message: "Halaman ini sedang dibuat ulang.",
	},
	STUDIO_DUPLICATE_SCREEN: {
		status: 409,
		message:
			"Nama halaman itu sudah dipakai. Pilih nama lain atau revisi halaman yang ada.",
	},
	STUDIO_SCREEN_LIMIT: {
		status: 400,
		message: "Terlalu banyak halaman baru dalam satu permintaan.",
	},
	STUDIO_NOT_FOUND: {
		status: 404,
		message: "Halaman ini sudah tidak tersedia.",
	},
	STUDIO_UNAUTHORIZED: {
		status: 401,
		message: "Silakan masuk kembali untuk membuka Studio.",
	},
};

/**
 * The recovery shape behind every failure. Categories exist so a retry is never
 * the blanket answer: a lost lease recovers by waiting for the worker, a failed
 * capture re-renders the preview, a deleted screen has no recovery at all.
 */
export type StudioFrameFailureCategory =
	| "provider-request"
	| "provider-incomplete"
	| "html-validation"
	| "render-capture"
	| "job-timeout"
	| "lease-loss"
	| "resource-missing"
	| "cancelled"
	| "unknown";

export type StudioFrameRecoveryAction =
	| "retry-generation"
	| "retry-visual"
	| "wait-for-recovery"
	| "none";

const FAILURE_CATEGORY_BY_CODE: Record<
	StudioFrameErrorCode,
	StudioFrameFailureCategory
> = {
	STUDIO_FRAME_FAILED: "provider-request",
	STUDIO_PROVIDER_UNAVAILABLE: "provider-request",
	STUDIO_PROVIDER_RATE_LIMITED: "provider-request",
	STUDIO_PROVIDER_TIMEOUT: "provider-request",
	STUDIO_PROVIDER_INCOMPLETE: "provider-incomplete",
	STUDIO_CONTRACT_VIOLATION: "html-validation",
	STUDIO_PREVIEW_FAILED: "render-capture",
	STUDIO_JOB_TIMEOUT: "job-timeout",
	STUDIO_JOB_LEASE_LOST: "lease-loss",
	STUDIO_NOT_FOUND: "resource-missing",
	STUDIO_CANCELLED: "cancelled",
	STUDIO_INVALID_INPUT: "unknown",
	STUDIO_STORAGE_FAILED: "unknown",
	STUDIO_RETRY_RUNNING: "unknown",
	STUDIO_DUPLICATE_SCREEN: "unknown",
	STUDIO_SCREEN_LIMIT: "unknown",
	STUDIO_UNAUTHORIZED: "unknown",
};

const RECOVERY_BY_CATEGORY: Record<
	StudioFrameFailureCategory,
	StudioFrameRecoveryAction
> = {
	"provider-request": "retry-generation",
	"provider-incomplete": "retry-generation",
	"html-validation": "retry-generation",
	"render-capture": "retry-visual",
	"job-timeout": "retry-generation",
	"lease-loss": "wait-for-recovery",
	"resource-missing": "none",
	cancelled: "retry-generation",
	unknown: "retry-generation",
};

export function studioFrameFailureCategory(
	code: StudioFrameErrorCode,
): StudioFrameFailureCategory {
	return FAILURE_CATEGORY_BY_CODE[code];
}

export function studioFrameRecoveryAction(
	category: StudioFrameFailureCategory,
): StudioFrameRecoveryAction {
	return RECOVERY_BY_CATEGORY[category];
}

export class StudioFrameError extends Error {
	constructor(
		readonly code: StudioFrameErrorCode,
		diagnostic?: string,
	) {
		super(
			diagnostic
				? `${STUDIO_FRAME_ERRORS[code].message} [${code}] ${diagnostic}`
				: STUDIO_FRAME_ERRORS[code].message,
		);
		this.name = "StudioFrameError";
	}
}

// Shared pipeline errors that already carry a meaning for this surface.
const SHARED_CODE_MAP: Partial<Record<string, StudioFrameErrorCode>> = {
	INVALID_URL: "STUDIO_INVALID_INPUT",
	AI_GENERATION_FAILED: "STUDIO_FRAME_FAILED",
	STORAGE_FAILED: "STUDIO_STORAGE_FAILED",
	VISUAL_CAPTURE_FAILED: "STUDIO_PREVIEW_FAILED",
	WEBSITE_BLOCKED: "STUDIO_NOT_FOUND",
};

const ABORT_REASON_CODES: Record<string, StudioFrameErrorCode> = {
	JOB_TIMEOUT: "STUDIO_JOB_TIMEOUT",
	JOB_CANCELLED: "STUDIO_CANCELLED",
	WORKER_SHUTDOWN: "STUDIO_JOB_LEASE_LOST",
};

// The provider stream and lease classes live in DB-backed runtime modules.
// Matching their constructor names keeps this taxonomy importable from the
// request boundary without pulling the worker runtime into it. ES subclasses
// inherit Error.prototype.name, so the own constructor name is what identifies
// the class.
function errorClassName(error: unknown): string {
	if (!(error instanceof Error)) return "";
	// DOMException subclasses (AbortError, TimeoutError) keep their identity in
	// Error.name, not in the constructor, which is always DOMException.
	if (error.name !== "Error" && error.name) return error.name;
	return typeof error.constructor === "function" ? error.constructor.name : "";
}

function namedErrorField(error: unknown, field: string): string | null {
	if (typeof error !== "object" || error === null || !(field in error))
		return null;
	const value: unknown = Reflect.get(error, field);
	return typeof value === "string" ? value : null;
}

export function studioFrameErrorCodeFor(error: unknown): StudioFrameErrorCode {
	if (error instanceof StudioFrameError) return error.code;
	if (error instanceof ScrapeError) {
		const mapped = SHARED_CODE_MAP[error.code];
		if (mapped) return mapped;
	}
	const kind = errorClassName(error);
	if (kind === "StudioIncompleteOutputError")
		return "STUDIO_PROVIDER_INCOMPLETE";
	if (kind === "StudioLeaseLostError") {
		const reason = namedErrorField(error, "reason");
		if (reason) {
			const mapped = ABORT_REASON_CODES[reason];
			if (mapped) return mapped;
		}
		return "STUDIO_JOB_LEASE_LOST";
	}
	if (kind === "TimeoutError") return "STUDIO_PROVIDER_TIMEOUT";
	if (kind === "AbortError") return "STUDIO_CANCELLED";
	const message = error instanceof Error ? error.message : String(error);
	if (/unauthorized|forbidden|not authenticated/i.test(message))
		return "STUDIO_UNAUTHORIZED";
	if (/429|rate.?limit|too many requests/i.test(message))
		return "STUDIO_PROVIDER_RATE_LIMITED";
	if (/timeout|timed out|etimedout|timedout|abort/i.test(message))
		return "STUDIO_PROVIDER_TIMEOUT";
	if (/econn|socket|fetch failed|unavailable|overloaded|5\d\d/i.test(message))
		return "STUDIO_PROVIDER_UNAVAILABLE";
	return "STUDIO_FRAME_FAILED";
}

export interface StudioFrameErrorReport {
	code: StudioFrameErrorCode;
	category: StudioFrameFailureCategory;
	recovery: StudioFrameRecoveryAction;
	status: number;
	message: string;
	diagnostic: string;
}

/** Classified error with its HTTP status, public copy and internal diagnostic. */
export function studioFrameErrorReport(error: unknown): StudioFrameErrorReport {
	const code = studioFrameErrorCodeFor(error);
	const category = studioFrameFailureCategory(code);
	return {
		code,
		category,
		recovery: studioFrameRecoveryAction(category),
		...STUDIO_FRAME_ERRORS[code],
		diagnostic: error instanceof Error ? error.message : String(error),
	};
}

/** The only copy from a failure that may be persisted or shown to the user. */
export function publicStudioFrameErrorMessage(error: unknown): string {
	return STUDIO_FRAME_ERRORS[studioFrameErrorCodeFor(error)].message;
}
