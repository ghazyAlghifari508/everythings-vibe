/**
 * Provisional repository naming.
 *
 * A codebase exists before the CLI has reported its real repository folder
 * name, so creation assigns a system-owned placeholder. That value is
 * storage-only: it must never surface as repository identity in a generated
 * sync prompt, as feature intent, as analysis input, or as a workspace
 * title. Every boundary detects it through isProvisionalCodebaseName —
 * never through a scattered string comparison.
 */
export const PROVISIONAL_CODEBASE_NAME = "Repository Lokal";

/**
 * Whether a codebase name is still the unresolved system placeholder rather
 * than a detected repository name or a user-chosen name.
 */
export function isProvisionalCodebaseName(value: unknown): boolean {
	if (typeof value !== "string") return false;
	return value.trim() === PROVISIONAL_CODEBASE_NAME;
}

/**
 * Whether a value is exactly one safe path segment: no separator (so never an
 * absolute path, drive prefix, UNC root, or nested path), no `.`/`..`
 * traversal, no control characters, and not blank.
 *
 * This is the canonical shape rule for repository identity. The repository
 * name a CLI may send, and the display name rendered in a title, must both be
 * a single folder-like segment; a filesystem coordinate is never either.
 */
export function isSingleSafeNameSegment(value: unknown): boolean {
	if (typeof value !== "string") return false;
	const trimmed = value.trim();
	if (trimmed.length === 0) return false;
	if (trimmed.includes("/") || trimmed.includes("\\")) return false;
	if (trimmed === "." || trimmed === "..") return false;
	// Expressed over code points so the pattern carries no control literal.
	return ![...trimmed].some((ch) => {
		const code = ch.codePointAt(0) ?? 0;
		return code < 0x20 || code === 0x7f;
	});
}

/**
 * Resolve a stored codebase name to a presentable repository identity.
 * Returns null while the name is provisional, missing, blank, or not a single
 * safe path segment — the caller then renders neutral copy ("Repository belum
 * terdeteksi") or omits the identity instead of inventing one. A folder path,
 * drive prefix, traversal, or nested path is never a display name.
 */
export function resolveCodebaseDisplayName(
	value: string | null | undefined,
): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (trimmed.length === 0 || isProvisionalCodebaseName(trimmed)) return null;
	if (!isSingleSafeNameSegment(trimmed)) return null;
	return trimmed;
}
