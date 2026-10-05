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
 * Resolve a stored codebase name to a presentable repository identity.
 * Returns null while the name is provisional, missing, or blank — the caller
 * then renders neutral copy ("Repository belum terdeteksi") or omits the
 * identity instead of inventing one.
 */
export function resolveCodebaseDisplayName(
	value: string | null | undefined,
): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (trimmed.length === 0 || isProvisionalCodebaseName(trimmed)) return null;
	return trimmed;
}
