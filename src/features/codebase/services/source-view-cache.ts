/**
 * Module-level caches for both expensive viewer paths, so a view toggle stays
 * instant. One instance per process: every reader goes through these functions.
 */

import type { SourceToken } from "@/features/codebase/types/source-view";
import { formatMarkupSource } from "./source-view-format";
import { buildHighlightedRows } from "./source-view-highlight";

const FORMAT_CACHE_MAX = 50;
const formatCache = new Map<string, string | null>();

export function getCachedFormattedMarkup(content: string): string | null {
	if (formatCache.has(content)) {
		return formatCache.get(content) ?? null;
	}
	const formatted = formatMarkupSource(content);
	if (formatCache.size >= FORMAT_CACHE_MAX) {
		const oldest = formatCache.keys().next().value;
		if (oldest) formatCache.delete(oldest);
	}
	formatCache.set(content, formatted);
	return formatted;
}

export function clearFormatMarkupCache(): void {
	formatCache.clear();
}

interface HighlightedCacheEntry {
	tokens: SourceToken[][];
	text: string[];
	totalLines: number;
}
const HIGHLIGHT_CACHE_MAX = 100;
const highlightCache = new Map<string, HighlightedCacheEntry>();

/**
 * Fingerprint of the exact source text.
 *
 * A length plus a head/tail sample cannot identify a document: two pages from
 * the same template share both while holding different code, so the cache
 * would hand one page the other page's rows. A full-text hash keeps the key
 * short without that collision.
 */
function textFingerprint(text: string): string {
	let hash = 2166136261;
	for (let index = 0; index < text.length; index += 1) {
		hash ^= text.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36);
}

function highlightCacheKey(
	text: string,
	language: string | null,
	maxLines: number,
): string {
	return `${language ?? "none"}:${maxLines}:${text.length}:${textFingerprint(text)}`;
}

export function getCachedHighlightedRows(
	text: string,
	language: string | null,
	maxLines: number,
): HighlightedCacheEntry {
	const key = highlightCacheKey(text, language, maxLines);
	const hit = highlightCache.get(key);
	if (hit) return hit;

	const result = buildHighlightedRows(text, language, maxLines);
	if (highlightCache.size >= HIGHLIGHT_CACHE_MAX) {
		const oldest = highlightCache.keys().next().value;
		if (oldest) highlightCache.delete(oldest);
	}
	highlightCache.set(key, result);
	return result;
}

export function clearHighlightCache(): void {
	highlightCache.clear();
}
