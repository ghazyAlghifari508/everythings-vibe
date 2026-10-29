import type { ImageResult } from "@/features/scrape/components/images-result-asset";

export type ImageFailureCategoryKey =
	| "access_restricted"
	| "connection_failed"
	| "format_unsupported"
	| "security_rejected"
	| "storage_failed"
	| "unspecified";

export interface ImageFailureCategoryMeta {
	key: ImageFailureCategoryKey;
	label: string;
	description: string;
	actionHint?: string;
}

export const IMAGE_FAILURE_CATEGORIES: Record<
	ImageFailureCategoryKey,
	ImageFailureCategoryMeta
> = {
	access_restricted: {
		key: "access_restricted",
		label: "Akses tidak tersedia",
		description: "Website tujuan membatasi atau menolak akses otomatis.",
		actionHint: "Gunakan URL yang mengizinkan pengambilan aset.",
	},
	connection_failed: {
		key: "connection_failed",
		label: "Gangguan sementara",
		description: "Koneksi terputus atau website terlalu lama merespons.",
		actionHint: "Coba lagi beberapa saat lagi.",
	},
	format_unsupported: {
		key: "format_unsupported",
		label: "Format belum didukung",
		description: "Format file gambar belum didukung untuk disimpan.",
		actionHint: "Buka link gambar asli untuk melihat atau mengunduh langsung.",
	},
	security_rejected: {
		key: "security_rejected",
		label: "Konten ditolak oleh validasi keamanan",
		description: "Alamat atau jenis file tidak lolos validasi keamanan sistem.",
		actionHint: "Pastikan URL merujuk ke domain publik yang aman.",
	},
	storage_failed: {
		key: "storage_failed",
		label: "Penyimpanan tidak berhasil",
		description: "Terjadi kendala saat menyimpan data gambar ke penyimpanan.",
		actionHint: "Coba simpan ulang jika diperlukan.",
	},
	unspecified: {
		key: "unspecified",
		label: "Penyebab tidak dapat dipastikan",
		description: "Metadata kegagalan tidak memberikan rincian pasti.",
		actionHint: "Periksa akses sumber atau coba lagi.",
	},
};

/**
 * Classifies a failed image strictly by typed error code or numeric HTTP status.
 * Never performs substring matching on raw exception messages.
 */
export function classifyImageFailureCode(
	code: string | null | undefined,
	httpStatus: number | null | undefined,
): ImageFailureCategoryKey {
	const normalized = code?.trim().toUpperCase();

	if (
		normalized &&
		[
			"STORAGE_FAILED",
			"SCRAPE_STORAGE_QUOTA",
			"OWNER_STORAGE_QUOTA",
			"IMAGE_TOO_LARGE",
			"ASSET_TOO_LARGE",
			"STORED_BYTES_MISSING",
			"STORED_BYTES_INVALID",
			"ASSET_READ_FAILED",
		].includes(normalized)
	) {
		return "storage_failed";
	}

	if (
		normalized &&
		[
			"PRIVATE_URL_BLOCKED",
			"URL_BLOCKED",
			"REMOTE_REDIRECT_BLOCKED",
			"UNSAFE_SVG",
		].includes(normalized)
	) {
		return "security_rejected";
	}

	if (
		normalized &&
		["UNSUPPORTED_FORMAT", "UNSUPPORTED_MIME", "INVALID_IMAGE"].includes(
			normalized,
		)
	) {
		return "format_unsupported";
	}

	if (typeof httpStatus === "number" && httpStatus > 0) {
		if (httpStatus === 429 || httpStatus === 401 || httpStatus === 403) {
			return "access_restricted";
		}
		if (httpStatus === 404 || httpStatus === 410 || httpStatus >= 500) {
			return "connection_failed";
		}
	}

	if (!normalized) {
		return "unspecified";
	}

	if (
		[
			"WEBSITE_RATE_LIMITED",
			"RATE_LIMITED",
			"PROXY_RATE_LIMITED",
			"REMOTE_RATE_LIMITED",
			"WEBSITE_ACCESS_DENIED",
			"REMOTE_ACCESS_DENIED",
		].includes(normalized)
	) {
		return "access_restricted";
	}

	if (
		[
			"NETWORK",
			"NETWORK_FAILURE",
			"FETCH_TIMEOUT",
			"REMOTE_TIMEOUT",
			"WEBSITE_NAVIGATION_TIMEOUT",
			"WEBSITE_SERVER_ERROR",
			"WEBSITE_BLOCKED",
			"WEBSITE_NOT_FOUND",
			"REMOTE_NOT_FOUND",
			"REMOTE_HTTP_ERROR",
			"REMOTE_FETCH_FAILED",
			"ASSET_FETCH_FAILED",
			"CAPTURE_FAILED",
			"WORKER_INTERRUPTED",
			"JOB_TIMEOUT",
			"DECODE_FAILED",
		].includes(normalized)
	) {
		return "connection_failed";
	}

	return "unspecified";
}

export interface ImageFailureGroup {
	category: ImageFailureCategoryMeta;
	count: number;
	images: ImageResult[];
}

export function groupImageFailures(
	failedImages: readonly ImageResult[],
): ImageFailureGroup[] {
	const map = new Map<ImageFailureCategoryKey, ImageResult[]>();

	for (const img of failedImages) {
		const key = classifyImageFailureCode(img.failureCode, img.httpStatus);
		const list = map.get(key);
		if (list) {
			list.push(img);
		} else {
			map.set(key, [img]);
		}
	}

	const categoryKeys: ImageFailureCategoryKey[] = [
		"access_restricted",
		"format_unsupported",
		"connection_failed",
		"security_rejected",
		"storage_failed",
		"unspecified",
	];

	const groups: ImageFailureGroup[] = [];
	for (const key of categoryKeys) {
		const images = map.get(key);
		if (images && images.length > 0) {
			groups.push({
				category: IMAGE_FAILURE_CATEGORIES[key],
				count: images.length,
				images,
			});
		}
	}

	return groups.sort((a, b) => b.count - a.count);
}

export function extractHost(url: string): string {
	try {
		return new URL(url).hostname;
	} catch {
		return "sumber";
	}
}
