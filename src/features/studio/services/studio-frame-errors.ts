import { ScrapeError } from "@/lib/design-errors";

export type StudioFrameErrorCode =
	| "STUDIO_INVALID_INPUT"
	| "STUDIO_FRAME_FAILED"
	| "STUDIO_CONTRACT_VIOLATION"
	| "STUDIO_PROVIDER_UNAVAILABLE"
	| "STUDIO_PROVIDER_RATE_LIMITED"
	| "STUDIO_PROVIDER_TIMEOUT"
	| "STUDIO_STORAGE_FAILED"
	| "STUDIO_PREVIEW_FAILED"
	| "STUDIO_RETRY_RUNNING"
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
		message: "Desain belum berhasil dibuat. Coba lagi.",
	},
	STUDIO_CONTRACT_VIOLATION: {
		status: 500,
		message: "Desain belum berhasil dibuat. Coba lagi.",
	},
	STUDIO_PROVIDER_UNAVAILABLE: {
		status: 503,
		message: "Desain belum berhasil dibuat. Coba lagi.",
	},
	STUDIO_PROVIDER_RATE_LIMITED: {
		status: 429,
		message: "Permintaan sedang padat. Coba lagi sebentar lagi.",
	},
	STUDIO_PROVIDER_TIMEOUT: {
		status: 504,
		message: "Proses desain melewati batas waktu. Coba lagi.",
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
	STUDIO_NOT_FOUND: {
		status: 404,
		message: "Halaman ini sudah tidak tersedia.",
	},
	STUDIO_UNAUTHORIZED: {
		status: 401,
		message: "Silakan masuk kembali untuk membuka Studio.",
	},
};

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

export function studioFrameErrorCodeFor(error: unknown): StudioFrameErrorCode {
	if (error instanceof StudioFrameError) return error.code;
	if (error instanceof ScrapeError) {
		const mapped = SHARED_CODE_MAP[error.code];
		if (mapped) return mapped;
	}
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
	status: number;
	message: string;
	diagnostic: string;
}

/** Classified error with its HTTP status, public copy and internal diagnostic. */
export function studioFrameErrorReport(error: unknown): StudioFrameErrorReport {
	const code = studioFrameErrorCodeFor(error);
	return {
		code,
		...STUDIO_FRAME_ERRORS[code],
		diagnostic: error instanceof Error ? error.message : String(error),
	};
}

/** The only copy from a failure that may be persisted or shown to the user. */
export function publicStudioFrameErrorMessage(error: unknown): string {
	return STUDIO_FRAME_ERRORS[studioFrameErrorCodeFor(error)].message;
}
