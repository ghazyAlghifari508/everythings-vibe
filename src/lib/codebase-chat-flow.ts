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
