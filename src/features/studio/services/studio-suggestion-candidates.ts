import type { StudioDesignMode } from "@/features/studio/types/studio-prompts";
import { EXTRA_DOMAIN_RECIPES } from "./studio-action-recipes";
import {
	DOMAIN_RECIPES,
	FLOW_SUCCESSORS,
	GENERIC_FOCUS,
	NAV_DESTINATION_DESCRIPTION,
	PLATFORM_FALLBACK,
	SCREEN_RECIPES,
	type StudioDomainRecipe,
	type StudioScreenConcept,
} from "./studio-screen-recipes";
import type {
	StudioActionKind,
	StudioSuggestionInput,
} from "./studio-suggestion-types";

export const DESCRIPTION_MAX_CHARS = 96;
export const DEFAULT_DESCRIPTION =
	"Layar lanjutan untuk melengkapi alur project.";

export function normalizeStudioScreenName(raw: string): string {
	return raw
		.toLowerCase()
		.normalize("NFKD")
		.replace(/\p{M}/gu, "")
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim();
}

export function tokensOf(raw: string): string[] {
	const normalized = normalizeStudioScreenName(raw);
	return normalized ? normalized.split(" ") : [];
}

/**
 * Two names describe the same screen when one token set contains the other:
 * "Riwayat" is not proposed beside an existing "Riwayat Transaksi".
 */
export function isSameScreen(
	a: readonly string[],
	b: readonly string[],
): boolean {
	if (a.length === 0 || b.length === 0) return false;
	const shared = a.filter((token) => b.includes(token)).length;
	return shared > 0 && (shared === a.length || shared === b.length);
}

export function cleanScreenName(raw: string): string {
	return raw.replace(/\s+/g, " ").trim().slice(0, 60);
}

export function sentence(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed) return GENERIC_FOCUS;
	return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export function brief(raw: string): string {
	const compact = raw.replace(/\s+/g, " ").trim();
	if (!compact) return DEFAULT_DESCRIPTION;
	const end = compact.search(/[.!?]/);
	const head = end >= 0 ? compact.slice(0, end + 1) : compact;
	return head.length > DESCRIPTION_MAX_CHARS
		? `${head.slice(0, DESCRIPTION_MAX_CHARS - 3).trimEnd()}...`
		: head;
}

export function formatTarget(projectTitle: string): string {
	const title = projectTitle.trim();
	return title ? ` untuk ${title}` : "";
}

/** FNV-1a over the joined history keeps the revision key short. */
export function hashText(value: string): string {
	let hash = 0x811c9dc5;
	for (let index = 0; index < value.length; index++) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16);
}

export interface SuggestionCandidate {
	name: string;
	title?: string;
	description: string;
	focus: string;
	reason: string;
	aliases?: readonly string[];
	cardCopy?: string;
	kind?: StudioActionKind;
	targetFrameName?: string;
}

export function fromConcept(
	concept: StudioScreenConcept,
	reason: string,
): SuggestionCandidate {
	return {
		name: concept.name,
		title: concept.title,
		description: concept.description,
		focus: concept.focus,
		reason,
		aliases: concept.aliases,
	};
}

/** A navigation label usually names a capability the lexicon already describes. */
export function conceptForName(name: string): StudioScreenConcept | null {
	const normalized = normalizeStudioScreenName(name);
	if (!normalized) return null;
	const lexicon: readonly StudioScreenConcept[] = [
		...SCREEN_RECIPES,
		...DOMAIN_RECIPES.flatMap((domain) => domain.screens),
		...EXTRA_DOMAIN_RECIPES.flatMap((domain) => domain.screens),
	];
	for (const concept of lexicon)
		if (normalizeStudioScreenName(concept.name) === normalized) return concept;
	return null;
}

export function successorsForName(name: string): readonly string[] {
	const tokens = tokensOf(name);
	if (tokens.length === 0) return [];
	for (const [key, successors] of Object.entries(FLOW_SUCCESSORS))
		if (isSameScreen(tokensOf(key), tokens)) return successors;
	return [];
}

export function matchedRecipes(
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
 * the remaining blueprint plan, the journey the existing screen names imply,
 * the navigation destinations without a screen, the detected product domain,
 * the step after a screen already on the canvas, and only then base sets.
 */
export function collectCandidates(
	input: StudioSuggestionInput,
): SuggestionCandidate[] {
	const candidates: SuggestionCandidate[] = [];
	const blueprint = input.blueprint;
	const prd = input.prdContent ?? "";

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

	for (const { concept, hit } of matchedRecipes(prd, input.designMode))
		candidates.push(
			fromConcept(concept, `PRD menyebut "${hit.toLowerCase()}"`),
		);

	if (blueprint)
		for (const screen of [...blueprint.screenPlan].sort(
			(a, b) => a.order - b.order,
		)) {
			const known = conceptForName(screen.name);
			candidates.push({
				name: screen.name,
				title: `Buat halaman ${screen.name}`,
				description: brief(screen.role),
				focus: screen.role,
				reason: "Rencana layar blueprint belum ada di canvas",
				aliases: known?.aliases,
			});
		}

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

	if (blueprint)
		for (const label of blueprint.navigationContract.labels) {
			const known = conceptForName(label);
			candidates.push({
				name: label,
				description: known?.description ?? NAV_DESTINATION_DESCRIPTION,
				focus: known?.focus ?? GENERIC_FOCUS,
				reason: "Destinasi navigasi belum punya layar",
				aliases: known?.aliases,
			});
		}

	const domainText = [
		prd,
		input.projectBrief ?? "",
		input.recentRequest ?? "",
		input.projectTitle,
		(input.frameNames ?? []).join("\n"),
		(input.frameDescriptions ?? []).join("\n"),
		blueprint?.productIdentity.productName ?? "",
		blueprint?.productIdentity.targetAudience ?? "",
	].join("\n");
	const domains: readonly StudioDomainRecipe[] = [
		...DOMAIN_RECIPES,
		...EXTRA_DOMAIN_RECIPES,
	];
	const scoredDomains = domains.map((domain) => {
		const matches =
			domainText.match(new RegExp(domain.detect.source, "gi")) ?? [];
		return { domain, count: matches.length, hit: matches[0] ?? "" };
	});
	// A single stray noun in a title is not enough to claim the product domain;
	// with no real signal the journey and platform fallbacks take over.
	for (const { domain, count, hit } of scoredDomains.sort(
		(a, b) => b.count - a.count,
	)) {
		if (count < 2) continue;
		for (const screen of domain.screens)
			candidates.push(
				fromConcept(
					screen,
					`Alur aplikasi ${domain.label} menyebut "${hit.toLowerCase()}"`,
				),
			);
	}

	for (const name of input.frameNames ?? [])
		for (const successor of successorsForName(name)) {
			const known = conceptForName(successor);
			const reason = `Alur lanjutan dari layar "${name}"`;
			candidates.push(
				known
					? fromConcept(known, reason)
					: {
							name: successor,
							description: NAV_DESTINATION_DESCRIPTION,
							focus: GENERIC_FOCUS,
							reason,
						},
			);
		}

	for (const concept of PLATFORM_FALLBACK[input.designMode])
		candidates.push(
			fromConcept(concept, "Layar dasar yang belum ada di canvas"),
		);

	return candidates;
}

export function buildScreenPrompt(
	input: StudioSuggestionInput,
	name: string,
	focus: string,
): string {
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
