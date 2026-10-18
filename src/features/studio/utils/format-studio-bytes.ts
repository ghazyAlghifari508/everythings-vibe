/**
 * Human-readable byte size used by the Studio design-reference pickers.
 *
 * Kept in one place so the DESIGN.md dialog and the Start-with-design modal
 * never drift apart on how a limit is described to the user.
 */
export function formatStudioBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
