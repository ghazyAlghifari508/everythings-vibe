import type { StudioDesignMode } from "@/features/studio/types/studio-prompts";
import type { StudioDesignBlueprint } from "./studio-design-blueprint";
import {
	DOMAIN_RECIPES,
	FLOW_SUCCESSORS,
	GENERIC_FOCUS,
	NAV_DESTINATION_DESCRIPTION,
	PLATFORM_FALLBACK,
	SCREEN_RECIPES,
	type StudioScreenConcept,
} from "./studio-screen-recipes";

/**
 * Next-screen suggestions are derived from data the workspace already loaded:
 * the shared blueprint screen plan, the navigation contract, the PRD, the
 * prompts behind existing screens, and the frames on the canvas. Nothing here
 * calls a model, so opening, panning, or zooming the canvas can never trigger a
 * generation request.
 */

/** One next-screen card: action label, one-line value, full editable prompt. */
export interface StudioScreenSuggestion {
	id: string;
	/** Action label, e.g. "Buat halaman riwayat perjalanan". */
	title: string;
	/** Short bubble label, e.g. "Kelola Stok", "Beranda", "Profil". */
	label?: string;
	/** One short line: what the user gets from this screen. */
	description: string;
	prompt: string;
	intent: "add_screen";
	/** Why this screen was proposed; internal grounding, not decorative copy. */
	reason: string;
}

export interface StudioSuggestionInput {
	projectId: string;
	projectTitle: string;
	designMode: StudioDesignMode;
	/** Bumped whenever the shared blueprint is rewritten. */
	designBlueprintVersion: number;
	prdContent: string | null;
	prdContentHash: string | null;
	blueprint: StudioDesignBlueprint | null;
	frameNames: readonly string[];
	/** Frame descriptions hold the prompt that asked for each screen. */
	frameDescriptions?: readonly string[];
	/**
	 * The project's own message history: the original brief and every later
	 * request. The brief names the audience and the workflow the user asked for
	 * before any screen existed.
	 */
	projectBrief?: string;
}

/** Two or three cards stay readable; a longer list is a wall of filler. */
export const STUDIO_SCREEN_SUGGESTION_LIMIT = 3;
const SUGGESTION_CACHE_LIMIT = 8;
const DESCRIPTION_MAX_CHARS = 96;
const DEFAULT_DESCRIPTION = "Layar lanjutan untuk melengkapi alur project.";

function normalizeStudioScreenName(raw: string): string {
	return raw
		.toLowerCase()
		.normalize("NFKD")
		.replace(/\p{M}/gu, "")
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim();
}

function tokensOf(raw: string): string[] {
	const normalized = normalizeStudioScreenName(raw);
	return normalized ? normalized.split(" ") : [];
}

/**
 * Two names describe the same screen when one token set contains the other, so
 * "Riwayat" is not proposed next to an existing "Riwayat Transaksi" and
 * "Transaksi" is not proposed next to "Catat Transaksi".
 */
function isSameScreen(a: readonly string[], b: readonly string[]): boolean {
	if (a.length === 0 || b.length === 0) return false;
	const shared = a.filter((token) => b.includes(token)).length;
	return shared > 0 && (shared === a.length || shared === b.length);
}

function cleanScreenName(raw: string): string {
	return raw.replace(/\s+/g, " ").trim().slice(0, 60);
}

function sentence(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed) return GENERIC_FOCUS;
	return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** One visible line: first sentence, capped. Blueprint roles can run long. */
function brief(raw: string): string {
	const compact = raw.replace(/\s+/g, " ").trim();
	if (!compact) return DEFAULT_DESCRIPTION;
	const end = compact.search(/[.!?]/);
	const head = end >= 0 ? compact.slice(0, end + 1) : compact;
	return head.length > DESCRIPTION_MAX_CHARS
		? `${head.slice(0, DESCRIPTION_MAX_CHARS - 3).trimEnd()}...`
		: head;
}

function formatTarget(projectTitle: string): string {
	const title = projectTitle.trim();
	return title ? ` untuk ${title}` : "";
}

function buildPrompt(
	input: StudioSuggestionInput,
	name: string,
	focus: string,
) {
	// Who the screen is for and which surface it lives on decide the layout as
	// much as the screen content does, so both reach the prompt explicitly.
	const audience = input.blueprint?.productIdentity.targetAudience?.trim();
	return [
		`Buat satu halaman ${name}${formatTarget(input.projectTitle)}.`,
		sentence(focus),
		audience ? `Sasarannya ${audience}.` : "",
		input.designMode === "mobile"
			? "Susun tata letak mobile satu kolom dengan target sentuh yang nyaman."
			: "",
		"Gunakan navigasi, warna, tipografi, header, dan komponen yang konsisten dengan layar project yang sudah ada.",
		"Jangan mengubah halaman lain.",
	]
		.filter(Boolean)
		.join(" ");
}

function suggestionId(name: string): string {
	return `add-screen:${normalizeStudioScreenName(name).replace(/\s+/g, "-")}`;
}

/** FNV-1a over the joined history keeps the revision key short. */
function hashText(value: string): string {
	let hash = 0x811c9dc5;
	for (let index = 0; index < value.length; index++) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16);
}

interface SuggestionCandidate {
	name: string;
	title?: string;
	label?: string;
	description: string;
	focus: string;
	reason: string;
	aliases?: readonly string[];
}

function fromConcept(
	concept: StudioScreenConcept,
	reason: string,
): SuggestionCandidate {
	return {
		name: concept.name,
		title: concept.title,
		label: concept.label ?? concept.name,
		description: concept.description,
		focus: concept.focus,
		reason,
		aliases: concept.aliases,
	};
}

/**
 * A navigation label usually names a capability the lexicon already describes
 * ("Keranjang", "Laporan"). Reusing that concept keeps the destination's own
 * wording as the screen name while the card still says what the screen is for.
 */
function conceptForName(name: string): StudioScreenConcept | null {
	const normalized = normalizeStudioScreenName(name);
	if (!normalized) return null;
	for (const concept of SCREEN_RECIPES)
		if (normalizeStudioScreenName(concept.name) === normalized) return concept;
	for (const domain of DOMAIN_RECIPES)
		for (const concept of domain.screens)
			if (normalizeStudioScreenName(concept.name) === normalized)
				return concept;
	return null;
}

/**
 * Successor names for a screen the canvas already holds. Names can carry extra
 * words ("Katalog Produk"), so a key matches when either token set contains the
 * other, the same rule that rejects near-duplicate screens.
 */
function successorsForName(name: string): readonly string[] {
	const tokens = tokensOf(name);
	if (tokens.length === 0) return [];
	for (const [key, successors] of Object.entries(FLOW_SUCCESSORS))
		if (isSameScreen(tokensOf(key), tokens)) return successors;
	return [];
}

/** Recipes whose own trigger words appear in this project text, in lexicon order. */
function matchedRecipes(
	text: string,
	designMode: StudioDesignMode,
): { concept: StudioScreenConcept; hit: string }[] {
	if (!text.trim()) return [];
	const matches: { concept: StudioScreenConcept; hit: string }[] = [];
	for (const recipe of SCREEN_RECIPES) {
		if (recipe.platforms && !recipe.platforms.includes(designMode)) continue;
		const hit = text.match(recipe.triggers)?.[0];
		if (hit) matches.push({ concept: recipe, hit });
	}
	return matches;
}

/**
 * Candidates in source-priority order: the user's own earlier requests and PRD,
 * the remaining blueprint plan, the journey the existing screen names already
 * imply, the navigation destinations without a screen, the detected product
 * domain, the step after a screen that is already on the canvas, and only then
 * the platform base sets.
 */
function collectCandidates(
	input: StudioSuggestionInput,
): SuggestionCandidate[] {
	const candidates: SuggestionCandidate[] = [];
	const blueprint = input.blueprint;
	const prd = input.prdContent ?? "";

	// 1. The prompt that asked for an existing screen is the strongest evidence
	// of what the user wants the product to do next.
	for (const { concept, hit } of matchedRecipes(
		(input.frameDescriptions ?? []).join("\n"),
		input.designMode,
	))
		candidates.push(
			fromConcept(
				concept,
				`Permintaan halaman sebelumnya menyebut "${hit.toLowerCase()}"`,
			),
		);

	// 2. The PRD describes the product even before any screen exists.
	for (const { concept, hit } of matchedRecipes(prd, input.designMode))
		candidates.push(
			fromConcept(concept, `PRD menyebut "${hit.toLowerCase()}"`),
		);

	// 3. Plan entries the canvas has not reached yet; the planned role becomes
	// both the description and the prompt focus.
	if (blueprint)
		for (const screen of [...blueprint.screenPlan].sort(
			(a, b) => a.order - b.order,
		)) {
			const known = conceptForName(screen.name);
			candidates.push({
				name: screen.name,
				title: `Buat halaman ${screen.name}`,
				label: known?.label ?? screen.name,
				description: brief(screen.role),
				focus: screen.role,
				reason: "Rencana layar blueprint belum ada di canvas",
			});
		}

	// 4. An existing screen name can imply the rest of its flow.
	for (const { concept, hit } of matchedRecipes(
		(input.frameNames ?? []).join("\n"),
		input.designMode,
	))
		candidates.push(
			fromConcept(
				concept,
				`Alur layar yang sudah ada menyebut "${hit.toLowerCase()}"`,
			),
		);

	// 5. A navigation destination without a screen is a dead end for the user.
	if (blueprint)
		for (const label of blueprint.navigationContract.labels) {
			const known = conceptForName(label);
			candidates.push({
				name: label,
				label: known?.label ?? label,
				description: known?.description ?? NAV_DESTINATION_DESCRIPTION,
				focus: known?.focus ?? GENERIC_FOCUS,
				reason: "Destinasi navigasi belum punya layar",
				aliases: known?.aliases,
			});
		}

	// 6. The product domain adds the workflow a page name cannot express.
	const domainText = [
		prd,
		input.projectBrief ?? "",
		input.projectTitle,
		(input.frameNames ?? []).join("\n"),
		(input.frameDescriptions ?? []).join("\n"),
		blueprint?.productIdentity.productName ?? "",
		blueprint?.productIdentity.targetAudience ?? "",
	].join("\n");
	// Rank domain recipes by specificity (match count), so a portfolio mentioning
	// "budget" or "kopi" once doesn't get overwhelmed by unrelated finance/culinary screens.
	const scoredDomains = DOMAIN_RECIPES.map((domain) => {
		const matches =
			domainText.match(new RegExp(domain.detect.source, "gi")) ?? [];
		const hit = matches[0] ?? "";
		return { domain, count: matches.length, hit };
	})
		.filter((entry) => entry.count > 0 && entry.hit.length > 0)
		.sort((a, b) => b.count - a.count);

	// Take screens from the top domain(s) only when multiple domains match,
	// rather than letting incidental single-keyword matches inject irrelevant flows.
	const topCount = scoredDomains[0]?.count ?? 0;
	for (const { domain, count, hit } of scoredDomains) {
		if (topCount > 1 && count === 1) continue;
		for (const screen of domain.screens)
			candidates.push(
				fromConcept(
					screen,
					`Alur aplikasi ${domain.label} menyebut "${hit.toLowerCase()}"`,
				),
			);
	}

	// 7. The step a screen on the canvas already calls for. "Katalog" alone never
	// says "Keranjang", and that missing link is the journey gap the user feels.
	for (const name of input.frameNames ?? [])
		for (const successor of successorsForName(name)) {
			const known = conceptForName(successor);
			const reason = `Alur lanjutan dari layar "${name}"`;
			candidates.push(
				known
					? fromConcept(known, reason)
					: {
							name: successor,
							label: successor,
							description: NAV_DESTINATION_DESCRIPTION,
							focus: GENERIC_FOCUS,
							reason,
						},
			);
		}

	// 8. Base screens, only when the project itself said nothing more specific.
	for (const concept of PLATFORM_FALLBACK[input.designMode])
		candidates.push(
			fromConcept(concept, "Layar dasar yang belum ada di canvas"),
		);

	return candidates;
}

export function deriveStudioScreenSuggestions(
	input: StudioSuggestionInput,
): StudioScreenSuggestion[] {
	const taken = input.frameNames.map(tokensOf).filter((t) => t.length > 0);
	// Bubbles are read at a glance, so two cards must never show the same action
	// phrase even when their screen names differ.
	const takenLabels = new Set<string>();
	const suggestions: StudioScreenSuggestion[] = [];

	for (const candidate of collectCandidates(input)) {
		if (suggestions.length >= STUDIO_SCREEN_SUGGESTION_LIMIT) break;
		const name = cleanScreenName(candidate.name);
		const tokens = tokensOf(name);
		if (tokens.length === 0) continue;
		const label = cleanScreenName(candidate.label || name);
		const normalizedLabel = normalizeStudioScreenName(label);
		if (!normalizedLabel || takenLabels.has(normalizedLabel)) continue;
		// A candidate is a duplicate when its own name, or any name that means
		// the same screen ("Checkout" for "Pembayaran"), is already on the canvas
		// or in the row.
		const forms = [
			tokens,
			...(candidate.aliases ?? []).map(tokensOf).filter((t) => t.length > 0),
		];
		if (
			forms.some((form) =>
				taken.some((existing) => isSameScreen(form, existing)),
			)
		)
			continue;
		taken.push(...forms);
		takenLabels.add(normalizedLabel);
		suggestions.push({
			id: suggestionId(name),
			title: candidate.title?.trim() || `Buat halaman ${name}`,
			label,
			description: brief(candidate.description),
			prompt: buildPrompt(input, name, candidate.focus),
			intent: "add_screen",
			reason: candidate.reason,
		});
	}

	return suggestions;
}

/**
 * Stable project-content revision. Frame names carry add/rename/delete, so the
 * key changes with the canvas; the PRD hash and blueprint version cover plan
 * edits without re-reading the documents. The brief hash makes a new user
 * request re-derive the row, and nothing else about a poll does.
 */
export function studioSuggestionRevision(input: StudioSuggestionInput): string {
	return [
		input.projectId,
		input.designMode,
		input.designBlueprintVersion,
		input.prdContentHash ?? `len-${input.prdContent?.length ?? 0}`,
		normalizeStudioScreenName(input.projectTitle),
		input.frameNames.map(normalizeStudioScreenName).join("|"),
		hashText((input.frameDescriptions ?? []).join("\n")),
		hashText(input.projectBrief ?? ""),
	].join("::");
}

// Keyed by revision, which already contains the project id, so a shared SSR
// module cache can never return another project's suggestions.
const suggestionCache = new Map<string, StudioScreenSuggestion[]>();

/**
 * Revision cache: identical project content returns the same array instance, so
 * a status poll or a re-render never recomputes and never re-renders the row.
 */
export function getStudioScreenSuggestions(
	input: StudioSuggestionInput,
): StudioScreenSuggestion[] {
	const revision = studioSuggestionRevision(input);
	const cached = suggestionCache.get(revision);
	if (cached) return cached;
	const suggestions = deriveStudioScreenSuggestions(input);
	if (suggestionCache.size >= SUGGESTION_CACHE_LIMIT) {
		const oldest = suggestionCache.keys().next();
		if (!oldest.done) suggestionCache.delete(oldest.value);
	}
	suggestionCache.set(revision, suggestions);
	return suggestions;
}
