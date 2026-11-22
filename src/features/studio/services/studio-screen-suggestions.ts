import { cardCopyFor } from "./studio-action-recipes";
import {
	buildActionPrompt,
	collectActionCandidates,
} from "./studio-suggestion-actions";
import {
	buildScreenPrompt,
	cleanScreenName,
	collectCandidates,
	hashText,
	isSameScreen,
	normalizeStudioScreenName,
	type SuggestionCandidate,
	tokensOf,
} from "./studio-suggestion-candidates";
import {
	STUDIO_SCREEN_SUGGESTION_LIMIT,
	type StudioScreenSuggestion,
	type StudioSuggestionInput,
} from "./studio-suggestion-types";

export { cardCopyFor } from "./studio-action-recipes";
export {
	STUDIO_SCREEN_SUGGESTION_LIMIT,
	type StudioScreenSuggestion,
	type StudioSuggestionInput,
	type StudioSuggestionIntent,
} from "./studio-suggestion-types";

const SUGGESTION_CACHE_LIMIT = 8;
/** Leave at least one slot for a new screen when actions are available. */
const MAX_ACTIONS_PER_ROW = 2;

/**
 * Suggestions are derived from data the workspace already loaded: blueprint,
 * navigation contract, PRD, prompts behind existing screens, frames and the
 * conversation. No model call happens here, so panning or rerendering the
 * canvas can never trigger generation.
 */
function candidateId(candidate: SuggestionCandidate): string {
	const kind = candidate.kind ?? "add-screen";
	const name = normalizeStudioScreenName(candidate.name).replace(/\s+/g, "-");
	return `${kind}:${name}`;
}

/**
 * A targeted action intentionally names a screen that already exists, so only
 * its copy participates in duplicate detection. New-screen candidates keep
 * the stricter token-subset rule against the canvas and earlier cards.
 */
function isDuplicate(
	candidate: SuggestionCandidate,
	seen: { tokens: string[][]; copies: Set<string> },
): boolean {
	const copy = normalizeStudioScreenName(candidate.cardCopy ?? candidate.name);
	if (seen.copies.has(copy)) return true;
	seen.copies.add(copy);
	if (candidate.kind) return false;
	const forms = [
		tokensOf(candidate.name),
		...(candidate.aliases ?? []).map(tokensOf),
	];
	if (
		forms.some((form) => seen.tokens.some((taken) => isSameScreen(form, taken)))
	)
		return true;
	seen.tokens.push(...forms);
	return false;
}

export function deriveStudioScreenSuggestions(
	input: StudioSuggestionInput,
): StudioScreenSuggestion[] {
	const suggestions: StudioScreenSuggestion[] = [];
	const taken = input.frameNames
		.map(tokensOf)
		.filter((list) => list.length > 0);
	const seen = { tokens: taken, copies: new Set<string>() };
	const actions = collectActionCandidates(input).slice(0, MAX_ACTIONS_PER_ROW);
	let actionCount = 0;

	for (const candidate of [
		...actions,
		...collectCandidates(input).filter(
			(entry) => !entry.kind && !entry.targetFrameName,
		),
	]) {
		if (suggestions.length >= STUDIO_SCREEN_SUGGESTION_LIMIT) break;
		const name = cleanScreenName(candidate.name);
		if (tokensOf(name).length === 0) continue;
		if (candidate.kind && actionCount >= MAX_ACTIONS_PER_ROW) continue;
		if (isDuplicate(candidate, seen)) continue;

		const isAction = Boolean(candidate.kind && candidate.targetFrameName);
		const cardCopy =
			candidate.cardCopy ??
			cardCopyFor(
				name,
				candidate.title ?? `Buat halaman ${name}`,
				candidate.description,
			);

		suggestions.push({
			id: candidateId(candidate),
			title: candidate.title?.trim() || `Buat halaman ${name}`,
			cardCopy,
			description: candidate.description,
			prompt: isAction
				? buildActionPrompt(
						input,
						candidate.targetFrameName ?? name,
						candidate.focus,
					)
				: buildScreenPrompt(input, name, candidate.focus),
			intent: candidate.kind ?? "add_screen",
			reason: candidate.reason,
			...(isAction ? { targetFrameName: candidate.targetFrameName } : {}),
		});
		if (isAction) actionCount++;
	}

	return suggestions;
}

/**
 * Stable project-content revision. Frame names carry add/rename/delete; the
 * PRD hash and blueprint version cover plan edits; the selection and latest
 * request cover contextual actions. Nothing about a poll changes the key.
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
		hashText((input.selectedFrameNames ?? []).join("|")),
		hashText(input.recentRequest ?? ""),
		hashText(input.projectBrief ?? ""),
	].join("::");
}

const suggestionCache = new Map<string, StudioScreenSuggestion[]>();

/** Identical project content returns the same array instance. */
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
