/**
 * PRD content text rules — pure string handling, no DB and no crypto.
 *
 * Shared by every generator that persists model output (PRD, AC, features,
 * ask options, task decomposition), so the same sanitization and completeness
 * contract applies no matter which route produced the document.
 */

/**
 * Normalize a content document that an AI model mis-rendered as a full HTML
 * page back into plain text (strip markup, keep visible text). Leaves any
 * document that does not look like a whole HTML page untouched, so valid
 * markdown survives unaffected. Structural rule only — independent of any
 * specific model, symptom, or provider.
 */
export function sanitizeModelOutput(content: string): string {
	if (!content) return content;
	const isFullHtmlPage =
		/^\s*<!DOCTYPE\s+html/i.test(content) && /<\/html>/i.test(content);
	if (!isFullHtmlPage) return content;
	const stripped = content
		.replace(/<script[\s\S]*?<\/script>/gi, " ")
		.replace(/<style[\s\S]*?<\/style>/gi, " ")
		.replace(/<head[\s\S]*?<\/head>/gi, " ");
	const text = stripped
		.replace(/><(?=\/?)/g, "> <")
		.replace(/<[^>]+>/g, "")
		.replace(/&nbsp;/gi, " ")
		.replace(/\s+/g, " ")
		.trim();
	return text.length > 0 ? text : content;
}

/**
 * Count unique PRD section markers in sanitized content.
 */
export function countPrdSectionMarkers(content: string): number {
	return (content.match(/<!--\s*SECTION:\s*([^-\n]+?)\s*-->/gi) || []).filter(
		(m, i, arr) => arr.indexOf(m) === i,
	).length;
}

/**
 * A generate must carry all 8 unique section markers. Fewer markers is a
 * truncated/aborted generation (providers report finish_reason "stop" even for
 * premature ends), so it is rejected before any write — including the share
 * token rotation, which must never revoke a working public link for output
 * that was never persisted. Revisions patch into existing content and may
 * legitimately ship a single block, so they are exempt.
 */
export function assertCompletePrdOutput(content: string): void {
	if (content.trim() && countPrdSectionMarkers(content) < 8) {
		throw new Error(
			"PRD output tidak lengkap (kurang dari 8 section). Tidak disimpan. Coba lagi.",
		);
	}
}
