import { z } from "zod";
import {
	STUDIO_PROJECT_TITLE_FALLBACK,
	STUDIO_PROJECT_TITLE_MAX_CHARS,
	STUDIO_PROJECT_TITLE_MAX_WORDS,
	STUDIO_PROJECT_TITLE_OWNER_CONNECTORS,
	STUDIO_PROJECT_TITLE_PLACEHOLDERS,
	STUDIO_PROJECT_TITLE_TRAILING_CONNECTORS,
} from "../types/studio-constants";

/**
 * Provenance of `studio_projects.title`. "auto" is a name the system chose (the
 * provisional title cut from the brief, later replaced by the planner's product
 * name); "user" is a name a person typed through the rename dialog. Planning may
 * only replace a title still marked "auto", so a rename is never overwritten.
 */
export const studioTitleSourceSchema = z.enum(["auto", "user"]);
export type StudioTitleSource = z.infer<typeof studioTitleSourceSchema>;

const QUOTED_BRAND_PATTERN = /[“"']([^“"']{2,60})[”"']/u;
const OWNER_NAME_PATTERN = new RegExp(
	`\\b(?:${STUDIO_PROJECT_TITLE_OWNER_CONNECTORS.join("|")})\\s+([\\p{Lu}][\\p{L}]*)((?:\\s+[\\p{Lu}][\\p{L}]*){0,2})`,
	"u",
);

const WRAPPING_PAIRS: Array<[string, string]> = [
	['"', '"'],
	["'", "'"],
	["“", "”"],
	["`", "`"],
	["[", "]"],
	["(", ")"],
];

const SENTENCE_MARKS = /[!?…]|\s\.|\.\s/u;

function collapseWhitespace(value: string): string {
	return value.replace(/\s+/gu, " ").trim();
}

function words(value: string): string[] {
	const collapsed = collapseWhitespace(value);
	return collapsed ? collapsed.split(" ") : [];
}

function stripWrapping(value: string): string {
	let out = value.trim();
	let changed = out.length > 0;
	while (changed) {
		changed = false;
		for (const [open, close] of WRAPPING_PAIRS) {
			if (out.length > 2 && out.startsWith(open) && out.endsWith(close)) {
				out = out.slice(open.length, out.length - close.length).trim();
				changed = true;
			}
		}
	}
	return out;
}

/** Cuts at a word boundary, so a truncated name never ends mid-word. */
function limitTitle(value: string, maxChars: number): string {
	const list = words(value);
	const kept: string[] = [];
	for (const word of list) {
		const candidate = kept.length === 0 ? word : `${kept.join(" ")} ${word}`;
		if (candidate.length > maxChars) break;
		kept.push(word);
	}
	if (kept.length > 0) return kept.join(" ");
	return (list[0] ?? "").slice(0, maxChars);
}

function isPlaceholder(value: string): boolean {
	const key = value
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s]/gu, "")
		.replace(/\s+/gu, " ")
		.trim();
	return STUDIO_PROJECT_TITLE_PLACEHOLDERS.includes(key);
}

function cutAtTrailingConnector(value: string): string {
	const list = words(value);
	const kept: string[] = [];
	for (let index = 0; index < list.length; index++) {
		const bare = list[index].toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
		if (index > 0 && STUDIO_PROJECT_TITLE_TRAILING_CONNECTORS.includes(bare))
			break;
		kept.push(list[index]);
	}
	return kept.length > 0 ? kept.join(" ") : value;
}

/**
 * Accepts a title only when it reads as a product name: no sentence punctuation,
 * no brief-length paragraph, no generic placeholder. Returns null so the caller
 * can fall back to a better source instead of truncating a paragraph.
 */
export function normalizeStudioProjectTitle(
	candidate: string | null | undefined,
): string | null {
	if (typeof candidate !== "string") return null;
	const collapsed = collapseWhitespace(stripWrapping(candidate));
	// A trailing full stop is cosmetic; a question or an interior stop is a
	// sentence someone wrote about the product rather than its name.
	const named = collapsed.replace(/[.…]+\s*$/u, "").trim();
	if (!named) return null;
	if (isPlaceholder(named)) return null;
	if (SENTENCE_MARKS.test(named)) return null;
	if (words(named).length > STUDIO_PROJECT_TITLE_MAX_WORDS) return null;
	const limited = limitTitle(named, STUDIO_PROJECT_TITLE_MAX_CHARS);
	return limited && !isPlaceholder(limited) ? limited : null;
}

/**
 * Rename input from a person: whitespace is normalized and the length is capped,
 * but the wording is never rewritten or rejected for reading like a description.
 */
export function normalizeStudioRenameTitle(
	candidate: string | null | undefined,
): string | null {
	if (typeof candidate !== "string") return null;
	const collapsed = collapseWhitespace(stripWrapping(candidate));
	if (!collapsed) return null;
	const limited = limitTitle(collapsed, STUDIO_PROJECT_TITLE_MAX_CHARS);
	return limited || null;
}

/**
 * Short, safe name for a project whose planning step has not produced a title
 * yet: a brand the brief quotes, a person or brand the brief names, otherwise
 * the brief's product head with its context clause removed.
 */
export function deriveProvisionalStudioTitle(prompt: string): string {
	const text = collapseWhitespace(prompt);
	if (!text) return STUDIO_PROJECT_TITLE_FALLBACK;
	const quoted = normalizeStudioProjectTitle(
		text.match(QUOTED_BRAND_PATTERN)?.[1] ?? "",
	);
	if (quoted) return quoted;
	const owner = text.match(OWNER_NAME_PATTERN);
	const ownerName = normalizeStudioProjectTitle(
		owner ? `${owner[1]}${owner[2]}` : "",
	);
	if (ownerName) return ownerName;
	return (
		normalizeStudioProjectTitle(cutAtTrailingConnector(text)) ??
		STUDIO_PROJECT_TITLE_FALLBACK
	);
}

/**
 * Final title for a project whose planning step just finished: the planner's
 * product name when it is usable, otherwise the brand the brief stated, the
 * provisional title, or the neutral fallback.
 */
export function resolveStudioProjectTitle(input: {
	candidate?: string | null;
	productName?: string | null;
	prompt?: string | null;
}): string {
	return (
		normalizeStudioProjectTitle(input.candidate) ??
		normalizeStudioProjectTitle(input.productName) ??
		deriveProvisionalStudioTitle(input.prompt ?? "")
	);
}
