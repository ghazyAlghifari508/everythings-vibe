// Feature plan naming inside a synced repository.
//
// The shared greenfield fallback (`deriveProjectNameSync`) names a *product* by
// the last meaningful words of the prompt. Used for a feature request inside an
// existing application it returns a fragment of the user's final sentence — for
// "…agar hasil pencarian tidak ditemukan … demi kemudahan eksplorasi karya" it
// produced "Demi Kemudahan Eksplorasi Karya", which names nothing.
//
// A feature title must name FUNCTION + TARGET instead. This module derives it
// from the intent the user actually wrote: canonical action nouns (what the
// feature does) plus the domain entity those actions operate on (what they
// operate on). Pure, synchronous and deterministic — no model call, no credit
// charge, and the same prompt always yields the same title, which is what keeps
// a feature identity stable across questions, PRD, AC and tasks.
//
// Explicit user naming and manual renames outrank all of this: an explicit name
// is delegated to the shared single source of truth, and this module is only
// consulted once, at feature creation.
import {
	deriveProjectNameSync,
	hasExplicitProductName,
	stripPrdBoilerplate,
} from "@/features/greenfield/services/prd-naming";
import type { OutputLanguage } from "@/lib/language";
import {
	ACTION_TERMS,
	ENTITY_TERMS,
	type FeatureTerm,
	GENERIC_WORDS,
} from "./feature-naming-terms";

const PROVISIONAL_TITLE: Record<OutputLanguage, string> = {
	id: "Fitur Baru",
	en: "New Feature",
};

const MAX_ACTIONS = 2;
const MAX_ENTITIES = 2;
const MAX_TITLE_WORDS = 6;
const MAX_TITLE_CHARS = 40;
const MAX_FALLBACK_WORDS = 3;

/** Markers that tell an Indonesian prompt from an English one. */
const INDONESIAN_MARKERS =
	"yang dan untuk dengan pada dari agar supaya tambah tambahkan fitur saya bisa tidak halaman bila ketika silakan serta";
const ENGLISH_MARKERS =
	"the and add with for to of on in is are feature when fix please a an";

interface TermMatch {
	term: FeatureTerm;
	/** How often the concept is mentioned — the request's centre of gravity. */
	count: number;
	/** Token index of the first mention. */
	first: number;
}

/** Word tokens: matching happens in token space, so adjacency is exact. */
function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.split(" ")
		.filter(Boolean);
}

function matchTerms(
	tokens: readonly string[],
	terms: readonly FeatureTerm[],
): TermMatch[] {
	const matches: TermMatch[] = [];
	for (const term of terms) {
		const positions: number[] = [];
		for (const alias of term.aliases.split(" ")) {
			const aliasTokens = alias.split(" ");
			for (let i = 0; i + aliasTokens.length <= tokens.length; i++) {
				if (aliasTokens.every((token, offset) => tokens[i + offset] === token))
					positions.push(i);
			}
		}
		if (positions.length === 0) continue;
		matches.push({
			term,
			count: positions.length,
			first: Math.min(...positions),
		});
	}
	// The concept the request mentions most is the feature's centre; ties keep the
	// order the user wrote them in. Both halves are deterministic, so the same
	// prompt always yields the same title.
	return matches.sort((a, b) => b.count - a.count || a.first - b.first);
}

/** Whether the prompt itself is written in English rather than Indonesian. */
function isEnglishPrompt(tokens: readonly string[]): boolean {
	const english = tokenize(ENGLISH_MARKERS);
	const indonesian = tokenize(INDONESIAN_MARKERS);
	const isMarker = (markers: readonly string[]) =>
		tokens.filter((token) => markers.includes(token)).length;
	return isMarker(english) > isMarker(indonesian);
}

/**
 * Order the target entities of a title.
 *
 * Entities named right after the first action form the compound the user is
 * talking about ("mobile navigation", "status pesanan"); entities mentioned
 * earlier are the context the feature lives in ("halaman portofolio"). The
 * compound comes first because it names what the feature changes, the context
 * follows as its qualifier — so "menyaring proyek … portofolio" reads as
 * "Proyek Portofolio" and "status pesanan" as "Status Pesanan".
 *
 * A compound keeps the word order of the language its prompt was written in; an
 * English compound rendered as an Indonesian title is reversed, because
 * Indonesian puts the head noun first ("mobile navigation" → "Navigasi Mobile").
 */
function orderEntities(
	entities: readonly TermMatch[],
	actions: readonly TermMatch[],
	target: OutputLanguage,
	englishPrompt: boolean,
): TermMatch[] {
	if (entities.length === 0) return [];
	const firstAction =
		actions.length > 0
			? Math.min(...actions.map((action) => action.first))
			: Number.POSITIVE_INFINITY;
	const mentioned = entities
		.filter((entity) => entity.first > firstAction)
		.sort((a, b) => a.first - b.first);

	const compound: TermMatch[] = [];
	for (const entity of mentioned) {
		const previous = compound[compound.length - 1];
		if (previous && entity.first !== previous.first + 1) break;
		compound.push(entity);
	}

	const ordered =
		target === "id" && englishPrompt ? [...compound].reverse() : [...compound];
	const context = entities
		.filter((entity) => !compound.includes(entity))
		.sort((a, b) => a.first - b.first);
	return [...ordered, ...context];
}

/**
 * Last resort when the prompt uses none of the known terms: the first plain
 * words the user wrote, taken from the head of the first clause — never the
 * tail of a sentence, so a filler fragment cannot become the title.
 */
function deriveFromContentWords(message: string): string {
	const clause = message.split(/[.\n!?;:]/)[0] ?? message;
	const words = tokenize(clause)
		.filter((word) => word.length > 1 && !GENERIC_WORDS[word])
		.slice(0, MAX_FALLBACK_WORDS);
	return words
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

function capTitle(title: string, language: OutputLanguage): string {
	const conjunction = language === "en" ? "and" : "dan";
	return title
		.split(" ")
		.filter(Boolean)
		.slice(0, MAX_TITLE_WORDS)
		.join(" ")
		.replace(new RegExp(`\\s+${conjunction}$`, "i"), "")
		.slice(0, MAX_TITLE_CHARS)
		.trim();
}

/**
 * Titles that only mean "the intent is not known yet". They are internal: a
 * provisional label must never survive a point where the feature's own words are
 * known.
 */
export function isProvisionalFeatureTitle(title: string): boolean {
	const normalized = title.trim().toLowerCase();
	return Object.values(PROVISIONAL_TITLE).some(
		(label) => label.toLowerCase() === normalized,
	);
}

/**
 * The controlled, one-time refinement of a provisional feature title.
 *
 * Returns the new title only when the stored name is still the neutral
 * provisional label and the feature's own words (the answered questions carried
 * by the compiled generation prompt) yield a real title. Any other stored name —
 * a derived one, or one the user chose or renamed — is left untouched, so a
 * manual rename always wins and the identity never drifts.
 */
export function refineProvisionalFeatureTitle(input: {
	currentName: string;
	message: string;
	language: OutputLanguage;
}): string | null {
	if (!isProvisionalFeatureTitle(input.currentName)) return null;
	const refined = deriveFeatureTitle(input.message, input.language);
	if (refined === input.currentName || isProvisionalFeatureTitle(refined)) {
		return null;
	}
	return refined;
}

/**
 * Derive the functional feature title for an existing-codebase feature request:
 * primary function + target entity/context.
 *
 * Order of precedence:
 *  1. an explicit user-given name (quoted, "bernama X", CamelCase) is kept
 *     verbatim by the shared single source of truth;
 *  2. the prompt's own action nouns and target entity ("Pencarian dan Filter
 *     Proyek Portofolio", "Perbaikan Navigasi Mobile");
 *  3. the first plain content words the user wrote, when no term is known;
 *  4. a neutral provisional label — never a tail-word fragment.
 *
 * @param language the planning language, which is also the title language
 */
export function deriveFeatureTitle(
	message: string,
	language: OutputLanguage = "id",
): string {
	if (hasExplicitProductName(message)) return deriveProjectNameSync(message);

	const cleaned = stripPrdBoilerplate(message);
	const tokens = tokenize(cleaned);
	const englishPrompt = isEnglishPrompt(tokens);
	const actions = matchTerms(tokens, ACTION_TERMS).slice(0, MAX_ACTIONS);
	const entities = orderEntities(
		matchTerms(tokens, ENTITY_TERMS),
		actions,
		language,
		englishPrompt,
	).slice(0, MAX_ENTITIES);

	const functions = actions.map((match) =>
		language === "en" ? match.term.en : match.term.id,
	);
	const targets = entities.map((match) =>
		language === "en" ? match.term.en : match.term.id,
	);

	if (functions.length === 0 && targets.length === 0) {
		const words = deriveFromContentWords(cleaned);
		return words || PROVISIONAL_TITLE[language];
	}
	if (functions.length === 0) return capTitle(targets.join(" "), language);

	// A repair intent modifies the function it repairs ("Perbaikan Checkout"), so
	// it is not a peer of that function: it leads the phrase and is never joined
	// with a conjunction.
	const repair = language === "en" ? "Fix" : "Perbaikan";
	const ordered = functions.includes(repair)
		? [repair, ...functions.filter((name) => name !== repair)]
		: functions;
	const conjunction = language === "en" ? " and " : " dan ";
	const phrase = ordered.includes(repair)
		? ordered.join(" ")
		: ordered.join(conjunction);
	return capTitle(`${phrase} ${targets.join(" ")}`, language);
}
