import type {
	StudioFrameChanges,
	StudioFrameFacts,
} from "../types/studio-conversation";

/**
 * Bounded observations read from a frame's committed markup. Everything here is
 * text or a count that exists in the HTML; nothing is inferred or model-authored,
 * so an explanation built from it cannot claim a control the screen lacks.
 * Pure and total: any string input yields facts, and no DOM or I/O is involved.
 */
const SOURCE_MAX = 500_000;
const HEADING_MAX = 120;
const LABEL_MAX = 80;
const SEGMENT_MAX = 120;
const CHANGE_MAX = 6;

const ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
};

function decode(text: string): string {
	return text.replace(
		/&(?:#(\d{1,7})|#x([\da-f]{1,6})|([a-z]{2,8}));/gi,
		(match, decimal?: string, hex?: string, name?: string) => {
			if (name) return ENTITIES[name.toLowerCase()] ?? match;
			const code = Number.parseInt(decimal ?? hex ?? "", decimal ? 10 : 16);
			return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
		},
	);
}

function squash(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

function truncate(text: string, limit: number): string {
	return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}

const MEANINGFUL = /[\p{L}\p{N}]/u;

/** Text of an element's inner markup with tags removed. */
function inner(markup: string): string {
	return squash(decode(markup.replace(/<[^>]*>/g, " ")));
}

/** Drops markup that never renders as readable text. */
function renderable(html: string): string {
	return html
		.slice(0, SOURCE_MAX)
		.replace(/<!--[\s\S]*?-->/g, "")
		.replace(
			/<(script|style|template|noscript|svg|head)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
			"",
		)
		.replace(/<(?:script|style)\b[\s\S]*$/i, "");
}

function attribute(tag: string, name: string): string {
	const match = new RegExp(
		`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,
		"i",
	).exec(tag);
	return squash(decode(match?.[1] ?? match?.[2] ?? ""));
}

function unique(values: readonly string[], limit: number, max: number) {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const value of values) {
		const text = truncate(value, max);
		const key = text.toLowerCase();
		if (!MEANINGFUL.test(text) || seen.has(key)) continue;
		seen.add(key);
		result.push(text);
		if (result.length === limit) break;
	}
	return result;
}

function controlTexts(markup: string): string[] {
	return [...markup.matchAll(/<(a|button)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi)].map(
		(match) => inner(match[3] ?? "") || attribute(match[2] ?? "", "aria-label"),
	);
}

export function extractStudioFrameFacts(html: string): StudioFrameFacts {
	const source = renderable(html);
	const navPattern = /<nav\b[^>]*>([\s\S]*?)<\/nav\s*>/gi;
	const navigation = [...source.matchAll(navPattern)].flatMap((match) =>
		controlTexts(match[1] ?? ""),
	);
	const body = source.replace(navPattern, " ");
	const headings = [
		...body.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]\s*>/gi),
	].map((match) => inner(match[1] ?? ""));
	const actions = [
		...[...body.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button\s*>/gi)].map(
			(match) =>
				inner(match[2] ?? "") || attribute(match[1] ?? "", "aria-label"),
		),
		...[
			...body.matchAll(
				/<a\b([^>]*\brole\s*=\s*["']button["'][^>]*)>([\s\S]*?)<\/a\s*>/gi,
			),
		].map(
			(match) =>
				inner(match[2] ?? "") || attribute(match[1] ?? "", "aria-label"),
		),
		...[...body.matchAll(/<input\b[^>]*>/gi)]
			.filter((match) =>
				/^(?:submit|button)$/i.test(attribute(match[0], "type")),
			)
			.map((match) => attribute(match[0], "value")),
	];
	const fieldTags = [...body.matchAll(/<(?:input|select|textarea)\b[^>]*>/gi)]
		.map((match) => match[0])
		.filter(
			(tag) =>
				!/^(?:hidden|submit|button|image|reset)$/i.test(attribute(tag, "type")),
		);
	const fields = [
		...[...body.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label\s*>/gi)].map(
			(match) => inner(match[1] ?? ""),
		),
		...fieldTags.map(
			(tag) => attribute(tag, "placeholder") || attribute(tag, "aria-label"),
		),
	];
	return {
		headings: unique(headings, 6, HEADING_MAX),
		navigation: unique(navigation, 8, LABEL_MAX),
		actions: unique(actions, 6, LABEL_MAX),
		fields: unique(fields, 6, LABEL_MAX),
		forms: Math.min(99, (body.match(/<form\b/gi) ?? []).length),
		tables: Math.min(99, (body.match(/<table\b/gi) ?? []).length),
	};
}

/** Visible text runs in document order, one entry per distinct run. */
function textSegments(html: string): string[] {
	const runs = [...renderable(html).matchAll(/>([^<]+)</g)].map((match) =>
		squash(decode(match[1] ?? "")),
	);
	return unique(runs, Number.POSITIVE_INFINITY, SEGMENT_MAX);
}

/**
 * Compares two committed revisions of one frame by their visible text. Equal
 * text with different markup is reported as `markup`, never as a text change,
 * and byte-equal (whitespace aside) documents as `identical`.
 */
export function compareStudioFrameHtml(
	before: string,
	after: string,
): StudioFrameChanges {
	const previous = textSegments(before);
	const next = textSegments(after);
	const previousSet = new Set(previous);
	const nextSet = new Set(next);
	const added = next.filter((text) => !previousSet.has(text));
	const removed = previous.filter((text) => !nextSet.has(text));
	if (added.length || removed.length)
		return {
			kind: "text",
			added: added.slice(0, CHANGE_MAX),
			removed: removed.slice(0, CHANGE_MAX),
		};
	return {
		kind: squash(before) === squash(after) ? "identical" : "markup",
		added: [],
		removed: [],
	};
}
