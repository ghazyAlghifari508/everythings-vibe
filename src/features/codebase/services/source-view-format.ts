/** Markup formatting path: line breaks and indentation added beside the untouched source. */

import { sourceFileName } from "./snapshot-preview";

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
