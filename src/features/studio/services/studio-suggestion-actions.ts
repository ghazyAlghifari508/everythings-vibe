import {
	ACTION_RECIPES,
	type StudioActionRecipe,
} from "./studio-action-recipes";
import {
	cleanScreenName,
	formatTarget,
	normalizeStudioScreenName,
	type SuggestionCandidate,
	sentence,
} from "./studio-suggestion-candidates";
import type { StudioSuggestionInput } from "./studio-suggestion-types";

function targetFrameName(
	frames: readonly string[],
	target: RegExp,
): string | null {
	for (const frame of frames)
		if (target.test(frame)) return cleanScreenName(frame);
	return null;
}

function groundingText(input: StudioSuggestionInput): string {
	const blueprint = input.blueprint;
	return [
		input.prdContent ?? "",
		input.projectBrief ?? "",
		input.recentRequest ?? "",
		input.projectTitle,
		(input.frameNames ?? []).join("\n"),
		(input.frameDescriptions ?? []).join("\n"),
		blueprint?.productIdentity.productName ?? "",
		blueprint?.productIdentity.targetAudience ?? "",
		blueprint?.screenPlan.map((screen) => screen.role).join("\n") ?? "",
	].join("\n");
}

function priority(
	recipe: StudioActionRecipe,
	selected: readonly string[],
	recentRequest: string,
	index: number,
): { rank: number; index: number } {
	const selectedHit = selected.some((name) => recipe.target.test(name));
	const requestHit = recipe.detect.test(recentRequest);
	return { rank: (selectedHit ? 2 : 0) + (requestHit ? 1 : 0), index };
}

/**
 * Only emit an action when the project text grounds it AND a real frame owns
 * it. A state or validation prompt without a target would degrade into a
 * project-wide change, which the engine deliberately refuses.
 */
export function collectActionCandidates(
	input: StudioSuggestionInput,
): SuggestionCandidate[] {
	const text = groundingText(input);
	const selected = input.selectedFrameNames ?? [];
	const used = new Set<string>();

	return ACTION_RECIPES.map((recipe, index) => ({
		recipe,
		order: priority(recipe, selected, input.recentRequest ?? "", index),
	}))
		.sort(
			(a, b) => b.order.rank - a.order.rank || a.order.index - b.order.index,
		)
		.flatMap(({ recipe }) => {
			if (!recipe.detect.test(text)) return [];
			const frame = targetFrameName(input.frameNames ?? [], recipe.target);
			if (!frame) return [];
			const key = `${recipe.kind}:${normalizeStudioScreenName(frame)}`;
			if (used.has(key)) return [];
			used.add(key);
			return [
				{
					name: frame,
					title: recipe.title,
					description: recipe.description,
					focus: recipe.focus,
					cardCopy: recipe.title,
					kind: recipe.kind,
					targetFrameName: frame,
					reason: `Konteks project menyebut kebutuhan ${recipe.id}`,
				} satisfies SuggestionCandidate,
			];
		});
}

/** Full instruction for a targeted action; only a selected frame may apply it. */
export function buildActionPrompt(
	input: StudioSuggestionInput,
	targetFrameName: string,
	focus: string,
): string {
	const audience = input.blueprint?.productIdentity.targetAudience?.trim();
	return [
		`Pada layar ${targetFrameName}${formatTarget(input.projectTitle)}.`,
		sentence(focus),
		audience ? `Sasarannya ${audience}.` : "",
		input.designMode === "mobile"
			? "Susun tata letak mobile satu kolom dengan target sentuh yang nyaman."
			: "",
		"Pertahankan navigasi, warna, tipografi, header, dan komponen yang sudah ada.",
		"Jangan mengubah halaman lain.",
	]
		.filter(Boolean)
		.join(" ");
}
