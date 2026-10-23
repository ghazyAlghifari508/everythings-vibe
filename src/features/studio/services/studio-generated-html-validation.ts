import { STUDIO_VISUAL_WIDTH } from "@/features/studio/types/studio-constants";
import type { StudioDesignBlueprint } from "./studio-design-blueprint";

export interface ValidateGeneratedHtmlOptions {
	blueprint: StudioDesignBlueprint | null;
	viewport: "web" | "mobile";
	expectTokens: boolean;
}

/**
 * Detects a CSS declaration for a positioning mode, ignoring comments.
 *
 * The artboard is a static full-page preview, so an element anchored to the
 * bottom of the viewport paints in the middle of a long page instead of at the
 * end of the document. The check is declaration-based rather than a stylesheet
 * rewrite: it reports the contract violation so the generator can correct it,
 * and never mutates the generated markup.
 */
function hasPositioningDeclaration(html: string, mode: string): boolean {
	const withoutComments = html.replace(/\/\*[\s\S]*?\*\//g, "");
	return new RegExp(`position\\s*:\\s*${mode}\\b`, "i").test(withoutComments);
}

function navBlocks(html: string): string[] {
	return [...html.matchAll(/<nav\b[^>]*>([\s\S]*?)<\/nav\s*>/gi)].map(
		(match) => match[1] ?? "",
	);
}

function stripCodeBlocks(html: string): string {
	return html
		.replace(/<code\b[^>]*>[\s\S]*?<\/code\s*>/gi, "")
		.replace(/<pre\b[^>]*>[\s\S]*?<\/pre\s*>/gi, "");
}

const NAMED_ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
	hellip: "…",
	mdash: "—",
	ndash: "–",
	middot: "·",
	times: "×",
	rsquo: "’",
	lsquo: "‘",
};

function decodeEntities(value: string): string {
	return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
		if (!body.startsWith("#"))
			return NAMED_ENTITIES[body.toLowerCase()] ?? match;
		const hex = body[1]?.toLowerCase() === "x";
		const code = hex
			? Number.parseInt(body.slice(2), 16)
			: Number.parseInt(body.slice(1), 10);
		return Number.isFinite(code) && code > 0 && code <= 0x10ffff
			? String.fromCodePoint(code)
			: match;
	});
}

/**
 * Contract labels are authored as plain text, while generated markup escapes
 * entities (`&` becomes `&amp;`) and may split a label across inline elements.
 * Label comparison must survive that, or a present label reads as missing.
 */
function normalizeNavigationText(value: string): string {
	return decodeEntities(value.replace(/<[^>]*>/g, " "))
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();
}

interface NavItem {
	text: string;
	block: number;
	order: number;
}

function navItems(html: string): NavItem[] {
	const items: NavItem[] = [];
	navBlocks(html).forEach((block, index) => {
		const links = [
			...block.matchAll(/<(?:a|button)\b[^>]*>([\s\S]*?)<\/(?:a|button)\s*>/gi),
		].map((match) => match[1] ?? "");
		// A nav rendered without links (plain text tabs) is compared as one block.
		for (const source of links.length > 0 ? links : [block]) {
			items.push({
				text: normalizeNavigationText(source),
				block: index,
				order: items.length,
			});
		}
	});
	return items;
}

export interface StudioNavigationStructure {
	labels: string[];
	navCount: number;
	fullNavCount: number;
}

export function extractNavigationStructure(
	html: string,
	blueprint: StudioDesignBlueprint | null,
): StudioNavigationStructure {
	const items = navItems(html);
	const expected = blueprint?.navigationContract.labels ?? [];
	const needles = expected
		.map((label) => normalizeNavigationText(label))
		.filter((needle) => needle.length > 0);
	const matched: Array<NavItem & { label: string; within: number }> = [];
	for (const label of expected) {
		const needle = normalizeNavigationText(label);
		if (needle.length === 0) continue;
		const entry = items.find((candidate) => candidate.text.includes(needle));
		if (entry)
			matched.push({
				...entry,
				label,
				within: entry.text.indexOf(needle),
			});
	}
	// Document order of the matched items, not blueprint order: a drifted nav
	// must be reported, and a label found inside a longer item still sorts by
	// its own position within that item.
	matched.sort(
		(left, right) => left.order - right.order || left.within - right.within,
	);
	const blocks = [...new Set(items.map((entry) => entry.block))];
	return {
		labels: matched.map((entry) => entry.label),
		navCount: blocks.length,
		// Counted per block: a second bar repeating the full label set is a
		// duplicate navigation even when the first match consumed every label.
		fullNavCount: blocks.filter((block) =>
			needles.every((needle) =>
				items.some(
					(entry) => entry.block === block && entry.text.includes(needle),
				),
			),
		).length,
	};
}

export function areNavigationStructuresConsistent(
	first: StudioNavigationStructure,
	second: StudioNavigationStructure,
): boolean {
	return (
		first.navCount === second.navCount &&
		first.labels.length === second.labels.length &&
		first.labels.every((label, index) => label === second.labels[index])
	);
}

const ROOT_FONT_SIZE_PX = 16;

function toPixels(value: number, unit: string): number {
	return unit.toLowerCase() === "px" ? value : value * ROOT_FONT_SIZE_PX;
}

function preludeMinimumWidth(prelude: string): number {
	let minimum = 0;
	for (const match of prelude.matchAll(
		/(?<![-\w])(min-width|width)\s*[:>=]+\s*(\d+(?:\.\d+)?)(px|rem|em)\b/gi,
	)) {
		if ((match[1] ?? "").toLowerCase() === "min-width")
			minimum = Math.max(minimum, toPixels(Number(match[2]), match[3] ?? "px"));
	}
	return minimum;
}

function findBlockEnd(css: string, openBraceIndex: number): number {
	let depth = 0;
	for (let cursor = openBraceIndex; cursor < css.length; cursor++) {
		if (css[cursor] === "{") depth++;
		else if (css[cursor] === "}") {
			depth--;
			if (depth === 0) return cursor + 1;
		}
	}
	return css.length;
}

/**
 * Drops conditional blocks that cannot apply at the target viewport. A rule
 * guarded by `min-width` above the viewport (a desktop breakpoint) must not be
 * read as a mobile overflow signal.
 */
function stripInapplicableAtRules(css: string, viewportWidth: number): string {
	const opener = /@(?:media|supports|container)\b[^{]*\{/i;
	let result = "";
	let rest = css;
	for (;;) {
		const match = opener.exec(rest);
		if (!match) return result + rest;
		const blockStart = match.index;
		const blockEnd = findBlockEnd(rest, blockStart + match[0].length - 1);
		result += rest.slice(0, blockStart);
		if (preludeMinimumWidth(match[0]) <= viewportWidth)
			result += rest.slice(blockStart, blockEnd);
		rest = rest.slice(blockEnd);
	}
}

// Property-exact declarations only: `max-width` never overflows, and a bare
// `width="1200"` attribute on an image is constrained by the responsive
// container rather than by the viewport, so neither is flagged.
// ponytail: ignores intrinsic table/image sizing; add a wrapper check if
// generated tables start overflowing in practice.
const FIXED_WIDTH_DECLARATION =
	/(?<![-\w])(min-width|width)\s*:\s*(\d+(?:\.\d+)?)(px|rem|em)\b/gi;

function hasOverflowingFixedWidth(
	html: string,
	viewportWidth: number,
): boolean {
	const withoutComments = html.replace(/\/\*[\s\S]*?\*\//g, "");
	const applicable = stripInapplicableAtRules(withoutComments, viewportWidth);
	for (const match of applicable.matchAll(FIXED_WIDTH_DECLARATION)) {
		if (toPixels(Number(match[2]), match[3] ?? "px") > viewportWidth)
			return true;
	}
	return false;
}

// Deterministic structural validation for generated HTML. String checks
// cannot prove visual correctness; they only catch concrete contract
// violations that warrant one bounded corrective regeneration.
export function validateGeneratedHtml(
	html: string,
	opts: ValidateGeneratedHtmlOptions,
): string[] {
	const issues: string[] = [];
	if (!/<html[\s>]/i.test(html) || !/<\/html>/i.test(html)) {
		issues.push("HTML tidak lengkap.");
		return issues;
	}
	if (opts.viewport === "mobile" && !/name=["']viewport["']/i.test(html)) {
		issues.push("Viewport meta hilang.");
	}
	if (opts.blueprint && !html.includes("studio-blueprint-tokens")) {
		issues.push("Token blueprint bersama hilang.");
	}
	if (opts.expectTokens && !html.includes("studio-design-tokens")) {
		issues.push("Token design system hilang.");
	}
	if (opts.blueprint) {
		const structure = extractNavigationStructure(html, opts.blueprint);
		const expected = opts.blueprint.navigationContract.labels;
		for (const label of expected) {
			if (!structure.labels.includes(label)) {
				issues.push(`Label navigasi hilang dari navigasi: ${label}.`);
			}
		}
		const present = expected.filter((label) =>
			structure.labels.includes(label),
		);
		if (
			present.length > 1 &&
			structure.labels.join("\n") !== present.join("\n")
		) {
			issues.push("Urutan navigasi tidak sesuai kontrak.");
		}
		if (structure.fullNavCount > 1) {
			issues.push("Navigasi ganda terdeteksi.");
		}
	}
	if (stripCodeBlocks(html).includes("```")) {
		issues.push("Artefak markdown tersisa pada output.");
	}
	if (!/<body[\s>]/i.test(html) || !/<\/body\s*>/i.test(html)) {
		issues.push("Body HTML tidak lengkap.");
	} else {
		const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i);
		const bodyText = (bodyMatch?.[1] ?? "")
			.replace(/<[^>]*>/g, " ")
			.replace(/\s+/g, " ")
			.trim();
		if (bodyText.length === 0) {
			issues.push("Body HTML kosong tanpa konten.");
		}
	}
	if (hasOverflowingFixedWidth(html, STUDIO_VISUAL_WIDTH[opts.viewport])) {
		issues.push("Lebar tetap melebihi viewport.");
	}
	if (opts.viewport === "mobile") {
		for (const mode of ["fixed", "sticky"]) {
			if (hasPositioningDeclaration(html, mode)) {
				issues.push(
					`Posisi ${mode} tidak diizinkan pada artboard mobile statis.`,
				);
			}
		}
	}
	return issues;
}
