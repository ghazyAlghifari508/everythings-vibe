/**
 * Composer intent resolution: turns one free-text instruction plus the real
 * canvas selection into an explicit operation. Deterministic rules cover the
 * unambiguous cases; anything left over is classified by the bounded model
 * gateway in `studio-composer-intent.server.ts`, never by a single keyword.
 */

/** Everything a Studio composer message may resolve to. */
export type StudioComposerIntent =
	| "add_screen"
	| "revise_selected"
	| "revise_project"
	| "clarify";

export interface StudioIntentDecision {
	intent: StudioComposerIntent;
	/**
	 * Requested new-screen names. Empty means one screen whose name the
	 * generator still has to choose.
	 */
	screens: string[];
	/** Only set for clarify: what the user still has to specify. */
	message: string | null;
}

/** Name an added frame carries until the generator has named it. */
export const STUDIO_ADD_FRAME_PLACEHOLDER_NAME = "Menamai layar baru...";

export const STUDIO_CLARIFY_MESSAGE =
	"Pilih layar yang ingin diubah, atau sebutkan halaman baru yang ingin dibuat.";

export const STUDIO_INTENT_MAX_TOKENS = 200;

const SCREEN_NOUN = /\b(halaman|layar|screen|page)s?\b/i;
const ADD_VERB = /\b(tambah(?:kan|in)?|buat(?:kan)?|bikin|create|add)\b/i;
// The quantifier must bind to the screen noun itself; "semua tombol di halaman
// ini" is a within-screen change, not a project-wide rewrite.
const PROJECT_SCOPE =
	/\b(semua|seluruh|keseluruhan|setiap|tiap)\s+(halaman|layar|screen|page)s?\b/i;
const PROJECT_SCOPE_APP = /\b(semua|seluruh)\s+(project|aplikasi|app)\b/i;
// A clause that opens with these does not name a screen; it describes a change.
const MODIFIER_START =
	/^(lebih|paling|agar|supaya|biar|jadi|menjadi|terlihat|tampil|responsif|konsisten|minimalis|modern|rapi|bagus|bersih|sederhana|elegan)\b/i;
// "halaman baru" asks for a screen but does not name it.
const NO_NAME_SEGMENT = /^(baru|lain|lainnya|tambahan)$/i;
const CLAUSE_BOUNDARY =
	/\s+(?:dengan|untuk|yang|agar|supaya|dari|pada|sebagai|buat|biar|punya|di|ke)\b/i;
const LIST_SEPARATOR = /\s*(?:,|;|&|\bdan\b|\bserta\b|\batau\b)\s*/i;
const COUNT_WORDS: Record<string, number> = {
	satu: 1,
	dua: 2,
	tiga: 3,
	empat: 4,
	lima: 5,
	enam: 6,
	tujuh: 7,
	delapan: 8,
	sembilan: 9,
	sepuluh: 10,
};

function decision(
	intent: StudioComposerIntent,
	screens: string[] = [],
	message: string | null = null,
): StudioIntentDecision {
	return { intent, screens, message };
}

function cleanScreenName(raw: string): string {
	return raw
		.replace(/^[^\p{L}\p{N}]+/u, "")
		.replace(/[^\p{L}\p{N}]+$/u, "")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 60);
}

/**
 * Names from the clause that follows the screen noun. Returns `null` when the
 * clause is a modifier ("lebih responsif") rather than a name, so the caller
 * falls through to classification instead of inventing a screen.
 */
export function extractStudioRequestedScreenNames(
	prompt: string,
): string[] | null {
	const noun = SCREEN_NOUN.exec(prompt);
	if (!noun) return null;
	const afterNoun = prompt.slice(noun.index + noun[0].length);
	const clause = afterNoun.split(/[.!?\n]/, 1)[0] ?? "";
	const hasColon = /^\s*:/.test(clause);
	let segment = clause.replace(/^[\s:,;–—-]+/, "").trim();
	if (!segment) return [];
	const boundaryMatch = CLAUSE_BOUNDARY.exec(segment);
	if (boundaryMatch && boundaryMatch.index > 0) {
		const head = segment.slice(0, boundaryMatch.index).trim();
		if (NO_NAME_SEGMENT.test(head)) {
			// e.g. "baru untuk Catat Transaksi" -> the name follows "untuk"
			const remainder = segment
				.slice(boundaryMatch.index + boundaryMatch[0].length)
				.trim();
			const nextBoundary = remainder.search(CLAUSE_BOUNDARY);
			segment =
				nextBoundary > 0 ? remainder.slice(0, nextBoundary).trim() : remainder;
		} else {
			segment = head;
		}
	} else {
		const boundary = segment.search(CLAUSE_BOUNDARY);
		if (boundary > 0) segment = segment.slice(0, boundary).trim();
	}
	if (!segment) return [];
	if (NO_NAME_SEGMENT.test(segment)) return [];
	if (MODIFIER_START.test(segment)) return null;
	const before = prompt.slice(0, noun.index).trim();
	const countToken = /\b([a-z]+|\d+)\s*$/i.exec(before)?.[1]?.toLowerCase();
	const count =
		countToken === undefined
			? null
			: /^\d+$/.test(countToken)
				? Number(countToken)
				: (COUNT_WORDS[countToken] ?? null);
	const explicitList = hasColon || (count ?? 1) > 1 || /,/.test(segment);
	const names = (explicitList ? segment.split(LIST_SEPARATOR) : [segment])
		.map(cleanScreenName)
		.filter((name) => name.length > 0);
	return names.length > 0 ? names : null;
}

/**
 * Pure resolution from structured context. `null` means "not decidable here":
 * the caller must classify the message, and a missing selection must never be
 * read as project-wide on its own.
 */
export function resolveStudioIntentFromContext(input: {
	prompt: string;
	selectedFrameIds: string[];
}): StudioIntentDecision | null {
	const text = input.prompt;
	if (ADD_VERB.test(text) && SCREEN_NOUN.test(text)) {
		const screens = extractStudioRequestedScreenNames(text);
		if (screens !== null) return decision("add_screen", screens);
	}
	if (PROJECT_SCOPE.test(text) || PROJECT_SCOPE_APP.test(text))
		return decision("revise_project");
	if (input.selectedFrameIds.length > 0) return decision("revise_selected");
	return null;
}
