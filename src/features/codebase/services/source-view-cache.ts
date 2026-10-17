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

function highlightCacheKey(
	text: string,
	language: string | null,
	maxLines: number,
): string {
	const len = text.length;
	const sample = len > 200 ? `${text.slice(0, 100)}|${text.slice(-100)}` : text;
	return `${language ?? "none"}:${maxLines}:${len}:${sample}`;
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
