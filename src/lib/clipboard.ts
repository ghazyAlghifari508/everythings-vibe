/**
 * Safe clipboard helper for browser environments.
 *
 * Copies plain text to system clipboard.
 * Returns { success: true } or { success: false, error: string }.
 * Does not throw and does not leak clipboard content to logs.
 */
export async function copyToClipboard(
	text: string,
): Promise<{ success: boolean; error?: string }> {
	if (!text) {
		return { success: false, error: "Teks kosong tidak dapat disalin." };
	}
	try {
		if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
			return {
				success: false,
				error: "Gagal menyalin otomatis. Silakan salin teks secara manual.",
			};
		}
		await navigator.clipboard.writeText(text);
		return { success: true };
	} catch {
		return {
			success: false,
			error: "Gagal menyalin otomatis. Silakan salin teks secara manual.",
		};
	}
}
