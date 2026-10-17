/**
 * Row model for the read-only source viewer.
 *
 * A source file is not a prose document: it is a numbered sequence of logical
 * lines that must stay aligned under wrapping, indentation, and truncation.
 * Everything the viewer draws comes from one array of rows, so the gutter
 * number and the text beside it are produced from the same record and cannot
 * drift apart.
 *
 * Presentation only. The original file content is never rewritten: formatting
 * produces a second view beside the original, and copying always uses the
 * untouched source.
 *
 * The formatting, highlighting, and caching internals live in the sibling
 * `source-view-*` modules and are re-exported here unchanged.
 */

import { detectSourceLanguage } from "./snapshot-preview";
import {
	clearFormatMarkupCache,
	clearHighlightCache,
	getCachedFormattedMarkup,
	getCachedHighlightedRows,
} from "./source-view-cache";
import {
	formatMarkupSource,
	shouldSoftWrapLanguage,
	supportsFormattedView,
} from "./source-view-format";

export type SourceViewMode = "original" | "formatted";

export interface SourceToken {
	/** Raw source text, already decoded for safe rendering. */
	text: string;
	/** Highlighter token class, or null for unhighlighted text. */
	className: string | null;
}

export interface SourceRow {
	/** 1-based logical line number, matching the source file. */
	lineNumber: number;
	/** Raw text of this row, without any markup. */
	text: string;
	/** Highlighted runs for this row, in order. */
	tokens: SourceToken[];
}

export interface SourceView {
	rows: SourceRow[];
	/** The view actually rendered; a formatted request falls back to original. */
	mode: SourceViewMode;
	/** Whether a formatted view exists for this file. */
	formattedAvailable: boolean;
	/** Prose wraps within the panel; code keeps its own line breaks. */
	softWrap: boolean;
	truncatedLines: boolean;
	totalLines: number;
	/** Unmodified file content, always the value a copy action must use. */
	originalContent: string;
	language: string | null;
}

export {
	clearFormatMarkupCache,
	clearHighlightCache,
	formatMarkupSource,
	getCachedFormattedMarkup,
	getCachedHighlightedRows,
	shouldSoftWrapLanguage,
	supportsFormattedView,
};

export interface BuildSourceViewInput {
	content: string;
	path: string;
	mode: SourceViewMode;
	maxLines: number;
}

/** Build every row the viewer needs for one file in one chosen view. */
export function buildSourceViewRows(input: BuildSourceViewInput): SourceView {
	const language = detectSourceLanguage(input.path);
	const isMarkup = supportsFormattedView(input.path);
	let formatted: string | null = null;
	let formattedAvailable = false;

	if (isMarkup) {
		const cached = getCachedFormattedMarkup(input.content);
		formattedAvailable = cached !== null;
		if (input.mode === "formatted") {
			formatted = cached;
		}
	}

	const mode: SourceViewMode = formatted === null ? "original" : "formatted";
	const text = formatted ?? input.content;
	const highlighted = getCachedHighlightedRows(text, language, input.maxLines);

	return {
		rows: highlighted.text.map((rowText, index) => ({
			lineNumber: index + 1,
			text: rowText,
			tokens: highlighted.tokens[index] ?? [],
		})),
		mode,
		formattedAvailable,
		softWrap: mode === "formatted" ? false : shouldSoftWrapLanguage(language),
		truncatedLines: highlighted.totalLines > highlighted.text.length,
		totalLines: highlighted.totalLines,
		originalContent: input.content,
		language,
	};
}
