/** Highlighted rows: highlight the whole file once, then cut it back into source lines. */

import hljs from "highlight.js/lib/common";
import type { SourceToken } from "@/features/codebase/types/source-view";

/**
 * The complete entity set the highlighter emits when escaping source text.
 * Decoding exactly these five turns highlighted output back into real text, so
 * rows are rendered as ordinary React children and React performs the escaping.
 */
const HIGHLIGHT_ENTITIES: Record<string, string> = {
	"&amp;": "&",
	"&lt;": "<",
	"&gt;": ">",
	"&quot;": '"',
	"&#x27;": "'",
};

function decodeHighlightEntities(value: string): string {
	return value.replace(
		/&(?:amp|lt|gt|quot|#x27);/g,
		(entity) => HIGHLIGHT_ENTITIES[entity] ?? entity,
	);
}

function tokenClassOf(openTag: string): string | null {
	const match = /class="([^"]*)"/.exec(openTag);
	return match ? (match[1] ?? null) : null;
}

/**
 * Split highlighted output into one token list per source line.
 *
 * A highlighted block comment spans several lines, so its opening tag sits on
 * one line and its closing tag on another. Emitting each line's runs separately
 * lets a row stand alone, and the innermost open token supplies each run's
 * class, which reproduces the highlighter's appearance exactly.
 *
 * Returns null when the output contains anything other than spans, so an
 * unexpected shape falls back to plain text instead of rendering wrongly.
 */
function splitHighlightedIntoRows(markup: string): SourceToken[][] | null {
	const rows: SourceToken[][] = [];
	let current: SourceToken[] = [];
	const open: Array<string | null> = [];
	let text = "";

	const flush = () => {
		if (!text) return;
		current.push({
			text: decodeHighlightEntities(text),
			className: open.length > 0 ? (open[open.length - 1] ?? null) : null,
		});
		text = "";
	};

	let index = 0;
	while (index < markup.length) {
		const char = markup[index];
		if (char === "\r") {
			index += 1;
			continue;
		}
		if (char === "\n") {
			flush();
			rows.push(current);
			current = [];
			index += 1;
			continue;
		}
		if (char === "<") {
			const end = markup.indexOf(">", index);
			if (end === -1) return null;
			const tag = markup.slice(index, end + 1);
			if (tag === "</span>") {
				flush();
				if (open.length === 0) return null;
				open.pop();
			} else if (tag.startsWith("<span")) {
				flush();
				open.push(tokenClassOf(tag));
			} else {
				return null;
			}
			index = end + 1;
			continue;
		}
		text += char;
		index += 1;
	}
	flush();
	if (open.length > 0) return null;
	rows.push(current);
	return rows;
}

export interface SplitSourceResult {
	lines: string[];
	hasTrailingNewline: boolean;
	trailingBlankCount: number;
}

/**
 * Split source text into logical lines, normalizing line endings (LF vs CRLF),
 * respecting POSIX line terminators, and accurately counting trailing blank lines.
 */
export function splitSourceLines(text: string): SplitSourceResult {
	if (text.length === 0) {
		return { lines: [], hasTrailingNewline: false, trailingBlankCount: 0 };
	}

	let normalized = text;
	let hasTrailingNewline = false;
	if (normalized.endsWith("\r\n")) {
		hasTrailingNewline = true;
		normalized = normalized.slice(0, -2);
	} else if (normalized.endsWith("\n")) {
		hasTrailingNewline = true;
		normalized = normalized.slice(0, -1);
	}

	const rawLines = normalized.split(/\r?\n/);
	const lines = rawLines.map((line) =>
		line.endsWith("\r") ? line.slice(0, -1) : line,
	);

	let trailingBlankCount = 0;
	for (let index = lines.length - 1; index >= 0; index--) {
		if (lines[index]?.trim() === "") {
			trailingBlankCount++;
		} else {
			break;
		}
	}

	return { lines, hasTrailingNewline, trailingBlankCount };
}

/**
 * Highlight a whole file, then cut it into rows.
 *
 * Highlighting the entire file rather than each line keeps multi-line
 * constructs correct. When the highlighted result cannot be cut back into
 * exactly the source's lines, plain text is used instead: a readable file is
 * always preferable to a misaligned one.
 */
export function buildHighlightedRows(
	text: string,
	language: string | null,
	maxLines: number,
): {
	tokens: SourceToken[][];
	text: string[];
	totalLines: number;
	hasTrailingNewline: boolean;
	trailingBlankCount: number;
} {
	const { lines, hasTrailingNewline, trailingBlankCount } =
		splitSourceLines(text);
	const totalLines = lines.length;
	const visibleLines = lines.slice(0, Math.max(maxLines, 0));
	const visible = visibleLines.join("\n");
	const plain: SourceToken[][] = visibleLines.map((line) =>
		line.length > 0 ? [{ text: line, className: null }] : [],
	);

	if (!language || !hljs.getLanguage(language) || visibleLines.length === 0) {
		return {
			tokens: plain,
			text: visibleLines,
			totalLines,
			hasTrailingNewline,
			trailingBlankCount,
		};
	}
	let markup: string;
	try {
		markup = hljs.highlight(visible, { language, ignoreIllegals: true }).value;
	} catch {
		return {
			tokens: plain,
			text: visibleLines,
			totalLines,
			hasTrailingNewline,
			trailingBlankCount,
		};
	}
	const tokens = splitHighlightedIntoRows(markup);
	// The highlighter must reproduce the source exactly; if it does not, the
	// line model would no longer correspond to real source lines.
	if (!tokens || tokens.length !== visibleLines.length) {
		return {
			tokens: plain,
			text: visibleLines,
			totalLines,
			hasTrailingNewline,
			trailingBlankCount,
		};
	}
	return {
		tokens,
		text: visibleLines,
		totalLines,
		hasTrailingNewline,
		trailingBlankCount,
	};
}
