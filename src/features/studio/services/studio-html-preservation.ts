import { JSDOM } from "jsdom";
import { STUDIO_PREVIOUS_HTML_MAX_CHARS } from "../types/studio-constants";
import { StudioFrameError } from "./studio-frame-errors";

/**
 * A revision must never receive a silently clipped document: the model cannot
 * preserve what it never saw, and returning a "complete" document from a
 * partial input is how content disappears. This prepares the exact document
 * that fits, or refuses the revision so the committed design stays intact.
 */

const COMMENT = /<!--(?!\[if)[\s\S]*?-->/g;
const BETWEEN_TAGS = />\s+</g;
const PRESERVE_WHITESPACE = /<(pre|textarea|script|style)\b[\s\S]*?<\/\1>/gi;

/** Whitespace and comment removal only, and only outside whitespace-sensitive elements. */
function compactStudioHtml(html: string): string {
	const compactChunk = (chunk: string) =>
		chunk.replace(COMMENT, "").replace(BETWEEN_TAGS, "><");
	let out = "";
	let last = 0;
	for (const match of html.matchAll(PRESERVE_WHITESPACE)) {
		const start = match.index ?? 0;
		out += compactChunk(html.slice(last, start)) + match[0];
		last = start + match[0].length;
	}
	return (out + compactChunk(html.slice(last))).trim();
}

interface HtmlShape {
	tag: string;
	attributes: string[];
	text: string;
	children: HtmlShape[];
}

const TEXT_SENSITIVE = new Set(["PRE", "TEXTAREA", "SCRIPT", "STYLE"]);

function shapeOf(element: Element): HtmlShape {
	const text = TEXT_SENSITIVE.has(element.tagName)
		? (element.textContent ?? "")
		: (element.textContent ?? "").replace(/\s+/g, " ").trim();
	return {
		tag: element.tagName,
		attributes: [...element.attributes]
			.map(({ name, value }) => `${name}=${value}`)
			.sort(),
		text: element.children.length === 0 ? text : "",
		children: [...element.children].map(shapeOf),
	};
}

function isStructureEquivalent(first: string, second: string): boolean {
	const a = new JSDOM(first).window.document.documentElement;
	const b = new JSDOM(second).window.document.documentElement;
	return JSON.stringify(shapeOf(a)) === JSON.stringify(shapeOf(b));
}

/**
 * Returns the document to send with a revision, or throws so the caller keeps
 * the last committed design. Compaction is accepted only when the parsed
 * structure, attributes and text are identical before and after it.
 */
export function prepareStudioExistingDocument(
	html: string,
	maxChars = STUDIO_PREVIOUS_HTML_MAX_CHARS,
): string {
	const trimmed = html.trim();
	if (!trimmed) throw new StudioFrameError("STUDIO_REVISION_TOO_LARGE");
	if (trimmed.length <= maxChars) return trimmed;
	const compacted = compactStudioHtml(trimmed);
	if (compacted.length <= maxChars && isStructureEquivalent(trimmed, compacted))
		return compacted;
	throw new StudioFrameError(
		"STUDIO_REVISION_TOO_LARGE",
		`document ${trimmed.length} chars, limit ${maxChars}`,
	);
}
