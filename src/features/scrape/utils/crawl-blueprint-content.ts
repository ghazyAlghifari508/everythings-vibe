import type { CrawlPageContent } from "@/db/schema";
import {
	CRAWL_BLUEPRINT_DESCRIPTION_MAX_CHARS,
	CRAWL_BLUEPRINT_DIGIT_CYCLE_MIN_TOKENS,
	CRAWL_BLUEPRINT_DIGIT_LADDER_MIN_TOKENS,
	CRAWL_BLUEPRINT_SECTION_SENTENCE_MIN_CHARS,
} from "@/features/scrape/types/scrape-constants";

/** A heading with its level, or null when the extractor could not read one. */
export interface BlueprintHeading {
	level: number | null;
	text: string;
}
export interface HeadingCleanup {
	headings: BlueprintHeading[];
	/** Adjacent headings dropped as extraction duplicates. */
	removedDuplicates: number;
}

export type DescriptionSource = "meta" | "content";

export interface PageDescription {
	text: string;
	source: DescriptionSource;
}

function normalizeWhitespace(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function isLadder(digits: number[]): boolean {
	let step: number | null = null;
	for (let index = 1; index < digits.length; index += 1) {
		const diff = digits[index] - digits[index - 1];
		if (Math.abs(diff) !== 1) return false;
		if (step === null) step = diff;
		else if (step !== diff) return false;
	}
	return step !== null;
}

function isCyclingCounter(digits: number[]): boolean {
	if (digits.length < CRAWL_BLUEPRINT_DIGIT_CYCLE_MIN_TOKENS) return false;
	const counts = new Array<number>(10).fill(0);
	for (const digit of digits) counts[digit] += 1;
	return counts.every((count) => count >= 2);
}

/**
 * True when a run of single-digit tokens is an animated counter.
 *
 * Two shapes are treated as decorative: a ladder counting up one digit at a
 * time, and a long run that cycles through the whole 0-9 range more than once.
 * Both carry no content meaning, and neither matches a short ordered list.
 */
function isDecorativeDigitRun(tokens: string[]): boolean {
	if (tokens.length < CRAWL_BLUEPRINT_DIGIT_LADDER_MIN_TOKENS) return false;
	const digits = tokens.map(Number);
	return isLadder(digits) || isCyclingCounter(digits);
}

export interface DecorativeCleanup {
	text: string;
	/** Number of decorative digit runs dropped from the input. */
	removedRuns: number;
}

/**
 * Removes decorative digit runs from extracted text.
 *
 * Only whole runs of single-digit tokens are removed; every other token,
 * including numbers inside words or multi-digit values, is preserved. The
 * removed count is returned so the exported document can report what was
 * dropped instead of silently shrinking the page content.
 */
export function cleanDecorativeDigitRuns(value: string): DecorativeCleanup {
	const words = value.split(/\s+/).filter((word) => word.length > 0);
	const kept: string[] = [];
	let run: string[] = [];
	let removedRuns = 0;

	const flush = () => {
		if (run.length === 0) return;
		if (isDecorativeDigitRun(run)) removedRuns += 1;
		else kept.push(...run);
		run = [];
	};

	for (const word of words) {
		if (/^[0-9]$/.test(word)) {
			run.push(word);
			continue;
		}
		flush();
		kept.push(word);
	}
	flush();

	return { text: normalizeWhitespace(kept.join(" ")), removedRuns };
}

/**
 * Drops adjacent headings that share level and text.
 *
 * Only consecutive duplicates are removed: a heading repeated further down the
 * page is a real second heading, while a node the extractor read twice always
 * lands next to its twin.
 */
export function dedupeHeadings(headings: BlueprintHeading[]): HeadingCleanup {
	const kept: BlueprintHeading[] = [];
	let removedDuplicates = 0;
	for (const heading of headings) {
		const previous = kept.at(-1);
		if (
			previous &&
			previous.level === heading.level &&
			normalizeWhitespace(previous.text).toLowerCase() ===
				normalizeWhitespace(heading.text).toLowerCase()
		) {
			removedDuplicates += 1;
			continue;
		}
		kept.push(heading);
	}
	return { headings: kept, removedDuplicates };
}

function truncateAtWordBoundary(value: string, max: number): string {
	if (value.length <= max) return value;
	const slice = value.slice(0, max);
	const lastSpace = slice.lastIndexOf(" ");
	if (lastSpace < max * 0.6) return `${slice.trimEnd()}…`;
	return `${slice.slice(0, lastSpace).trimEnd()}…`;
}

function firstSentence(value: string): string {
	const match = value.match(/^[\s\S]*?[.!?](?:\s|$)/);
	return match ? match[0].trim() : value.trim();
}

/**
 * Builds a short page description from observed content only.
 *
 * The meta description wins when the page published one. Otherwise the first
 * heading and the first sentence of the first section are quoted, and the
 * source is reported so the reader knows the line was derived rather than
 * published.
 */
export function describePage(
	content: CrawlPageContent,
): PageDescription | null {
	const meta = normalizeWhitespace(content.description ?? "");
	if (meta)
		return {
			text: truncateAtWordBoundary(meta, CRAWL_BLUEPRINT_DESCRIPTION_MAX_CHARS),
			source: "meta",
		};
	const section = content.sections?.find((row) => row.text.trim().length > 0);
	if (!section) return null;
	const body = cleanDecorativeDigitRuns(section.text).text;
	const lead = section.title
		? `${section.title}. ${firstSentence(body)}`
		: firstSentence(body);
	const text = truncateAtWordBoundary(
		normalizeWhitespace(lead),
		CRAWL_BLUEPRINT_DESCRIPTION_MAX_CHARS,
	);
	return text ? { text, source: "content" } : null;
}

/**
 * Splits a long section into sentences so the exported document stays
 * scannable. Short sections are returned whole; nothing is dropped.
 */
export function sectionSentences(text: string): string[] {
	const cleaned = cleanDecorativeDigitRuns(text).text;
	if (cleaned.length < CRAWL_BLUEPRINT_SECTION_SENTENCE_MIN_CHARS)
		return cleaned ? [cleaned] : [];
	const sentences = cleaned
		.split(/(?<=[.!?])\s+/)
		.map((sentence) => sentence.trim())
		.filter((sentence) => sentence.length > 0);
	return sentences.length > 1 ? sentences : [cleaned];
}
