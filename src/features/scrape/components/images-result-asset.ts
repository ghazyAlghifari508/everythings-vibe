import { z } from "zod";
import type { ScrapeImageResult } from "@/features/scrape/services/scrape-service";

export type ImageResult = ScrapeImageResult;

const diagnosticSchema = z.object({
	error: z.object({
		code: z.string(),
		retryable: z.boolean(),
		retryAfterSeconds: z.number().nonnegative().optional(),
	}),
});

export const diagnosticLabels: Record<string, string> = {
	PROXY_RATE_LIMITED: "Batas proxy tercapai. Tunggu sebelum mencoba lagi.",
	CAPABILITY_EXPIRED:
		"Akses preview kedaluwarsa. Perbarui akses untuk mencoba lagi.",
	CAPABILITY_INVALID:
		"Akses preview tidak valid. Perbarui akses untuk mencoba lagi.",
	STORED_BYTES_MISSING: "Byte gambar tersimpan tidak tersedia.",
	STORED_BYTES_INVALID: "Isi gambar tersimpan tidak dapat diverifikasi.",
	OWNERSHIP_DENIED: "Akses ke hasil ini tidak diizinkan.",
	AUTHENTICATION_REQUIRED:
		"Sesi berakhir. Masuk kembali untuk mengakses gambar.",
	REMOTE_TIMEOUT: "Sumber gambar melewati batas waktu.",
	REMOTE_FETCH_FAILED: "Proxy gagal mengambil gambar dari sumber.",
	UNSUPPORTED_MIME: "Format respons tidak aman untuk preview.",
	ASSET_TOO_LARGE: "Ukuran gambar melewati batas proxy.",
	REMOTE_ACCESS_DENIED: "Sumber menolak akses ke gambar.",
	REMOTE_NOT_FOUND: "Gambar tidak lagi tersedia di sumber.",
	REMOTE_RATE_LIMITED: "Batas request sumber tercapai.",
	REMOTE_HTTP_ERROR: "Sumber mengembalikan respons gagal.",
	REMOTE_REDIRECT_BLOCKED: "Redirect sumber ditolak oleh pemeriksaan keamanan.",
	URL_BLOCKED: "Alamat gambar ditolak oleh pemeriksaan keamanan.",
	ASSET_READ_FAILED: "Sistem gagal membaca gambar. Coba lagi nanti.",
	DECODE_FAILED: "Browser tidak dapat membaca isi gambar.",
	NETWORK: "Koneksi ke layanan gambar gagal.",
	REFRESH_FAILED: "Akses gambar gagal diperbarui. Coba lagi.",
};

export async function readAssetFailure(response: Response) {
	const parsed = diagnosticSchema.safeParse(
		await response.json().catch(() => null),
	);
	const error = parsed.success
		? parsed.data.error
		: { code: `HTTP_${response.status}`, retryable: response.status >= 500 };
	return {
		...error,
		retryAt: error.retryAfterSeconds
			? Date.now() + error.retryAfterSeconds * 1000
			: 0,
	};
}

export async function refreshImageUrl(image: ImageResult) {
	const response = await fetch(
		`/api/scrape?id=${encodeURIComponent(image.scrapeId)}`,
	);
	if (!response.ok) throw new Error("Refresh failed");
	const result = z
		.object({
			scrape: z.object({
				images: z.array(z.object({ id: z.string(), assetUrl: z.string() })),
			}),
		})
		.parse(await response.json());
	const refreshed = result.scrape.images.find((row) => row.id === image.id);
	if (!refreshed) throw new Error("Missing image");
	return refreshed.assetUrl;
}
