export interface FlowQuestion {
	id: string;
}

export type AskQuestionType = "select" | "text" | "multiselect";

/** Validated question shape from `/api/ask/options` (ask-service contract). */
export interface RawAskQuestion {
	id: string;
	question: string;
	type: AskQuestionType;
	options?: string[];
	recommended?: number;
	recommendationReason?: string;
}

export interface AdaptiveQuestionOption {
	id: string;
	label: string;
	recommended?: boolean;
}

export interface AdaptiveQuestion {
	id: string;
	title: string;
	type: AskQuestionType;
	options: AdaptiveQuestionOption[];
	recommendedOptionId?: string;
	recommendationReason?: string;
	customPlaceholder?: string;
}

/**
 * Map validated ask-service questions to the UI model. Question type semantics
 * are preserved, and a recommendation is only surfaced when the server parsed
 * an explicit in-range index; option order never implies a recommendation.
 */
export function mapAskQuestionsToAdaptive(
	raw: readonly RawAskQuestion[],
): AdaptiveQuestion[] {
	return raw.map((item) => {
		const options = (item.options ?? []).map((label, optionIndex) => ({
			id: `${item.id}-opt${optionIndex + 1}`,
			label,
			recommended: item.type === "select" && item.recommended === optionIndex,
		}));
		const recommendedOption =
			item.type === "select" && item.recommended !== undefined
				? options[item.recommended]
				: undefined;
		return {
			id: item.id,
			title: item.question,
			type: item.type,
			options,
			...(recommendedOption
				? {
						recommendedOptionId: recommendedOption.id,
						recommendationReason: item.recommendationReason,
					}
				: {}),
		};
	});
}

export function nextQuestionIndex(
	answers: Record<string, string>,
	questions: readonly FlowQuestion[],
): number {
	for (let index = 0; index < questions.length; index += 1) {
		const id = questions[index].id;
		if (!answers[id] || !answers[id].trim()) return index;
	}
	return -1;
}

export function areAllQuestionsAnswered(
	answers: Record<string, string>,
	questions: readonly FlowQuestion[],
): boolean {
	if (questions.length === 0) return false;
	return nextQuestionIndex(answers, questions) === -1;
}

export function buildFeatureMessage(
	featureName: string,
	answers: Record<string, string>,
): string {
	const joined = Object.values(answers)
		.map((value) => value.trim())
		.filter((value) => value.length > 0)
		.join(" ");
	if (joined.length >= 3) return `Rencanakan fitur ${featureName}: ${joined}`;
	return `Rencanakan fitur ${featureName}`;
}

export interface ConfirmGenerateDeps {
	/** Persist the Ask handoff; resolves true only when the server confirmed. */
	saveHandoff: () => Promise<boolean>;
	generateFeature: () => Promise<{ status: number }>;
	/** Reload the authoritative feature tree; null when it is not persisted. */
	reloadFeatureTree: () => Promise<unknown | null>;
}

export type ConfirmGenerateOutcome =
	| { kind: "handoff_failed" }
	| { kind: "spec_failed" }
	| { kind: "generating" }
	| { kind: "not_persisted" }
	| { kind: "success" };

/**
 * Orchestrate Feature Specification generation with generation gated on real
 * persistence:
 *  - the Feature generator never runs when the Ask handoff was not saved;
 *  - a 200 response alone is not treated as success — the feature tree must be
 *    reloadable from the authoritative server state before the stage advances.
 */
export async function runConfirmGenerate(
	deps: ConfirmGenerateDeps,
): Promise<ConfirmGenerateOutcome> {
	const saved = await deps.saveHandoff();
	if (!saved) return { kind: "handoff_failed" };

	const response = await deps.generateFeature();
	if (response.status === 409) return { kind: "generating" };
	if (response.status < 200 || response.status >= 300)
		return { kind: "spec_failed" };

	const persisted = await deps.reloadFeatureTree();
	if (!persisted) return { kind: "not_persisted" };
	return { kind: "success" };
}
