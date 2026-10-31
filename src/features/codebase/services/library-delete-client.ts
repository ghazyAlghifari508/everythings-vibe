import type { CodebaseBulkDeleteResult } from "./library";

export function readServerErrorMessage(
	value: unknown,
	fallback: string,
): string {
	if (
		typeof value === "object" &&
		value !== null &&
		"error" in value &&
		typeof value.error === "string" &&
		value.error.trim().length > 0
	) {
		return value.error;
	}
	return fallback;
}

/**
 * Read the batch delete response instead of trusting it. A successful HTTP
 * status with an unexpected body would otherwise let the UI remove rows the
 * server never confirmed.
 */
export function parseCodebaseBulkDeleteResult(
	value: unknown,
): CodebaseBulkDeleteResult | null {
	if (typeof value !== "object" || value === null) return null;
	if (!("deleted" in value) || typeof value.deleted !== "number") return null;
	if (!("skipped" in value) || typeof value.skipped !== "number") return null;
	if (!("deletedIds" in value) || !Array.isArray(value.deletedIds)) return null;
	const deletedIds = value.deletedIds.filter(
		(id): id is string => typeof id === "string",
	);
	return {
		deleted: value.deleted,
		skipped: value.skipped,
		deletedIds,
	};
}

/**
 * One bounded request instead of one DELETE per row: the server owns ownership,
 * deduplication, batching, and cascade semantics for the whole set.
 */
export async function requestCodebaseBulkDelete(
	ids: readonly string[],
): Promise<CodebaseBulkDeleteResult> {
	const response = await fetch("/api/codebases", {
		method: "DELETE",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ ids }),
	});
	const body: unknown = await response.json().catch(() => null);
	if (!response.ok) {
		throw new Error(
			readServerErrorMessage(body, "Gagal menghapus repository."),
		);
	}
	const result = parseCodebaseBulkDeleteResult(body);
	if (!result) throw new Error("Respons hapus repository tidak valid.");
	return result;
}
