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
 */

import hljs from "highlight.js/lib/common";
import {
	detectSourceLanguage,
	sourceFileName,
} from "./codebase-source-preview";

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

const MARKUP_EXTENSIONS = new Set([
	"html",
	"htm",
	"xml",
	"svg",
	"vue",
	"astro",
]);
const PROSE_LANGUAGES = new Set(["markdown", "ini", "yaml", "toml"]);

/** Elements that never have a closing tag. */
const VOID_ELEMENTS = new Set([
	"area",
	"base",
	"br",
	"col",
	"embed",
	"hr",
	"img",
	"input",
	"link",
	"meta",
	"param",
	"source",
	"track",
	"wbr",
]);

/**
 * Elements whose tags belong on the same line as their own text, so a short
 * paragraph or label does not explode into three lines.
 */
const INLINE_ELEMENTS = new Set([
	"a",
	"abbr",
	"b",
	"bdi",
	"bdo",
	"button",
	"cite",
	"code",
	"data",
	"dfn",
	"em",
	"figcaption",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"i",
	"kbd",
	"label",
	"legend",
	"li",
	"mark",
	"option",
	"p",
	"q",
	"s",
	"samp",
	"small",
	"span",
	"strong",
	"sub",
	"summary",
	"sup",
	"td",
	"th",
	"time",
	"u",
	"var",
]);

/** Elements whose content is text, never nested markup. */
const RAW_TEXT_ELEMENTS = new Set(["script", "style", "textarea", "title"]);

export function supportsFormattedView(path: string): boolean {
	const name = sourceFileName(path).toLowerCase();
	const dot = name.lastIndexOf(".");
	if (dot <= 0) return false;
	return MARKUP_EXTENSIONS.has(name.slice(dot + 1));
}

/**
 * Prose wraps inside the narrow panel; code keeps its own line breaks so
 * indentation and structure survive. An unrecognized file type is left alone
 * rather than guessed at.
 */
export function shouldSoftWrapLanguage(language: string | null): boolean {
	if (!language) return false;
	return PROSE_LANGUAGES.has(language);
}

function tagNameOf(tag: string): string {
	const match = /^<\/?\s*([a-zA-Z][a-zA-Z0-9-]*)/.exec(tag);
	return match ? (match[1] ?? "").toLowerCase() : "";
}

/**
 * Break a markup document into one tag or text run per line.
 *
 * Only line breaks and indentation are added; the characters themselves are
 * never altered, so a formatted view cannot introduce or lose content. A
 * document whose tags do not balance is reported as unformattable instead of
 * being rendered with invented structure.
 */
export function formatMarkupSource(source: string): string | null {
	const lines: Array<{ text: string; indent: number }> = [];
	let pending: string[] = [];
	let pendingIndent = 0;
	let depth = 0;
	let index = 0;
	let sawTag = false;

	const flush = () => {
		if (pending.length === 0) return;
		lines.push({ text: pending.join(""), indent: pendingIndent });
		pending = [];
	};
	const pushOwnLine = (text: string, indent: number) => {
		flush();
		lines.push({ text, indent });
	};
	/** A whitespace-only run is a blank line only when it had a real gap. */
	const pushGap = (text: string, indent: number) => {
		flush();
		if (text.split("\n").length > 2) lines.push({ text: "", indent });
	};

	while (index < source.length) {
		const nextTag = source.indexOf("<", index);
		if (nextTag === -1) {
			const text = source.slice(index).trim();
			if (text) {
				if (!sawTag) return null;
				pending.push(text);
			}
			break;
		}
		if (nextTag > index) {
			const text = source.slice(index, nextTag);
			if (!text.trim()) pushGap(text, depth);
			else if (sawTag) {
				if (pending.length === 0) pendingIndent = depth;
				pending.push(text.trim());
			}
		}

		if (source.startsWith("<!--", nextTag)) {
			const end = source.indexOf("-->", nextTag + 4);
			if (end === -1) return null;
			pushOwnLine(source.slice(nextTag, end + 3).trim(), depth);
			index = end + 3;
			sawTag = true;
			continue;
		}
		if (source.startsWith("<!", nextTag) || source.startsWith("<?", nextTag)) {
			const end = source.indexOf(">", nextTag);
			if (end === -1) return null;
			pushOwnLine(source.slice(nextTag, end + 1).trim(), depth);
			index = end + 1;
			sawTag = true;
			continue;
		}

		const end = source.indexOf(">", nextTag);
		if (end === -1) return null;
		const tag = source.slice(nextTag, end + 1);
		const name = tagNameOf(tag);
		if (!name) return null;
		const isClosing = tag.startsWith("</");
		const isSelfClosing = /\/\s*>$/.test(tag);
		sawTag = true;

		if (!isClosing && RAW_TEXT_ELEMENTS.has(name) && !isSelfClosing) {
			const closeIndex = source.toLowerCase().indexOf(`</${name}`, end + 1);
			if (closeIndex === -1) return null;
			const closeEnd = source.indexOf(">", closeIndex);
			if (closeEnd === -1) return null;
			const body = source.slice(end + 1, closeIndex).trim();
			const closeTag = source.slice(closeIndex, closeEnd + 1).trim();
			if (body.includes("\n")) {
				pushOwnLine(tag, depth);
				for (const bodyLine of body.split("\n")) pushOwnLine(bodyLine, depth);
				pushOwnLine(closeTag, depth);
			} else {
				pushOwnLine(`${tag}${body}${closeTag}`, depth);
			}
			index = closeEnd + 1;
			continue;
		}

		if (isClosing) {
			depth -= 1;
			if (depth < 0) return null;
			if (INLINE_ELEMENTS.has(name)) {
				if (pending.length === 0) pendingIndent = depth;
				pending.push(tag);
			} else {
				pushOwnLine(tag, depth);
			}
		} else if (isSelfClosing || VOID_ELEMENTS.has(name)) {
			pushOwnLine(tag, depth);
		} else if (INLINE_ELEMENTS.has(name)) {
			if (pending.length === 0) pendingIndent = depth;
			pending.push(tag);
			depth += 1;
		} else {
			pushOwnLine(tag, depth);
			depth += 1;
		}
		index = end + 1;
	}
	flush();

	if (!sawTag || depth !== 0) return null;
	const indentWidth = "  ";
	return lines
		.map((line) =>
			line.text
				? `${indentWidth.repeat(Math.max(line.indent, 0))}${line.text}`
				: "",
		)
		.join("\n");
}

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

/**
 * Highlight a whole file, then cut it into rows.
 *
 * Highlighting the entire file rather than each line keeps multi-line
 * constructs correct. When the highlighted result cannot be cut back into
 * exactly the source's lines, plain text is used instead: a readable file is
 * always preferable to a misaligned one.
 */
function buildHighlightedRows(
	text: string,
	language: string | null,
	maxLines: number,
): { tokens: SourceToken[][]; text: string[]; totalLines: number } {
	const lines = text.split("\n");
	const totalLines = lines.length;
	const visibleLines = lines.slice(0, Math.max(maxLines, 0));
	const visible = visibleLines.join("\n");
	const plain: SourceToken[][] = visibleLines.map((line) => [
		{ text: line, className: null },
	]);

	if (!language || !hljs.getLanguage(language)) {
		return { tokens: plain, text: visibleLines, totalLines };
	}
	let markup: string;
	try {
		markup = hljs.highlight(visible, { language, ignoreIllegals: true }).value;
	} catch {
		return { tokens: plain, text: visibleLines, totalLines };
	}
	const tokens = splitHighlightedIntoRows(markup);
	// The highlighter must reproduce the source exactly; if it does not, the
	// line model would no longer correspond to real source lines.
	if (!tokens || tokens.length !== visibleLines.length) {
		return { tokens: plain, text: visibleLines, totalLines };
	}
	return { tokens, text: visibleLines, totalLines };
}

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
	const formatted =
		input.mode === "formatted" && isMarkup
			? formatMarkupSource(input.content)
			: null;
	const formattedAvailable = isMarkup
		? (formatMarkupSource(input.content) ?? null) !== null
		: false;
	const mode: SourceViewMode = formatted === null ? "original" : "formatted";
	const text = formatted ?? input.content;
	const highlighted = buildHighlightedRows(text, language, input.maxLines);

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
