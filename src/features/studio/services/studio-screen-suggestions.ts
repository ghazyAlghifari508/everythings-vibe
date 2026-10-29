import type { StudioDesignMode } from "@/features/studio/types/studio-prompts";
import type { StudioDesignBlueprint } from "./studio-design-blueprint";
import {
	GENERIC_FOCUS,
	PLATFORM_FALLBACK,
	SCREEN_RECIPES,
} from "./studio-screen-recipes";

/**
 * Next-screen suggestions are derived from data the workspace already loaded:
 * the shared blueprint screen plan, the navigation contract, the PRD, and the
 * frames on the canvas. Nothing here calls a model, so opening, panning, or
 * zooming the canvas can never trigger a generation request.
 */

/** One next-screen bubble: compact label, full editable prompt, stable id. */
export interface StudioScreenSuggestion {
	id: string;
	label: string;
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
}

export const STUDIO_SCREEN_SUGGESTION_LIMIT = 4;
const SUGGESTION_CACHE_LIMIT = 8;

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

function formatTarget(projectTitle: string): string {
	const title = projectTitle.trim();
	return title ? ` untuk ${title}` : "";
}

function buildPrompt(
	input: StudioSuggestionInput,
	name: string,
	focus: string,
) {
	return [
		`Buat satu halaman ${name}${formatTarget(input.projectTitle)}.`,
		sentence(focus),
		"Ikuti desain, navigasi, dan komponen aplikasi yang sudah ada.",
		"Jangan mengubah halaman lain.",
	].join(" ");
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
	focus: string;
	reason: string;
}

function collectCandidates(
	input: StudioSuggestionInput,
): SuggestionCandidate[] {
	const candidates: SuggestionCandidate[] = [];
	const blueprint = input.blueprint;

	if (blueprint) {
		for (const screen of [...blueprint.screenPlan].sort(
			(a, b) => a.order - b.order,
		))
			candidates.push({
				name: screen.name,
				focus: screen.role,
				reason: "Rencana layar blueprint belum ada di canvas",
			});
		for (const label of blueprint.navigationContract.labels)
			candidates.push({
				name: label,
				focus: GENERIC_FOCUS,
				reason: "Destinasi navigasi belum punya layar",
			});
	}

	const prd = input.prdContent ?? "";
	const previousRequests = (input.frameDescriptions ?? []).join("\n");
	const pushRecipeMatches = (text: string, reason: (hit: string) => string) => {
		if (!text.trim()) return;
		for (const recipe of SCREEN_RECIPES) {
			if (recipe.platforms && !recipe.platforms.includes(input.designMode))
				continue;
			const hit = text.match(recipe.triggers)?.[0];
			if (!hit) continue;
			candidates.push({
				name: recipe.name,
				focus: recipe.focus,
				reason: reason(hit.toLowerCase()),
			});
		}
	};
	pushRecipeMatches(prd, (hit) => `PRD menyebut "${hit}"`);
	pushRecipeMatches(
		previousRequests,
		(hit) => `Permintaan halaman sebelumnya menyebut "${hit}"`,
	);

	for (const fallback of PLATFORM_FALLBACK[input.designMode])
		candidates.push({
			...fallback,
			reason: "Layar dasar yang belum ada di canvas",
		});

	return candidates;
}

export function deriveStudioScreenSuggestions(
	input: StudioSuggestionInput,
): StudioScreenSuggestion[] {
	const taken = input.frameNames.map(tokensOf).filter((t) => t.length > 0);
	const suggestions: StudioScreenSuggestion[] = [];

	for (const candidate of collectCandidates(input)) {
		if (suggestions.length >= STUDIO_SCREEN_SUGGESTION_LIMIT) break;
		const name = cleanScreenName(candidate.name);
		const tokens = tokensOf(name);
		if (tokens.length === 0) continue;
		if (taken.some((existing) => isSameScreen(tokens, existing))) continue;
		if (
			suggestions.some((entry) => isSameScreen(tokens, tokensOf(entry.label)))
		)
			continue;
		taken.push(tokens);
		suggestions.push({
			// The label already carries "Buat", so the id keys off the screen name.
			id: suggestionId(name),
			label: `Buat ${name}`,
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
 * edits without re-reading the documents.
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
