import type { FlowQuestion } from "./chat-flow-run";

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

/** Persisted Ask question shape (mirrors the handoff state schema). */
export interface PersistedAskQuestion {
	id: string;
	question: string;
	type: AskQuestionType;
	options?: string[];
	recommended?: number;
	recommendationReason?: string;
}

/**
 * Serialize the visible adaptive questions into the restorable handoff shape so
 * a refresh or History reopen can rebuild the exact question list and answer
 * mapping. Only the fields a question actually carries are written.
 */
export function serializeAskQuestions(
	questions: readonly AdaptiveQuestion[],
): PersistedAskQuestion[] {
	return questions.map((question) => ({
		id: question.id,
		question: question.title,
		type: question.type,
		...(question.options.length > 0
			? { options: question.options.map((option) => option.label) }
			: {}),
		...(question.recommendedOptionId !== undefined
			? {
					recommended: question.options.findIndex(
						(option) => option.id === question.recommendedOptionId,
					),
				}
			: {}),
		...(question.recommendationReason
			? { recommendationReason: question.recommendationReason }
			: {}),
	}));
}

/**
 * Rebuild the UI questions and answers from a persisted handoff. Answers are
 * keyed by question id; option semantics (type, options, recommendation) are
 * reconstructed from the stored question fields so nothing is flattened.
 */
export function restoreAskState(
	questions: readonly PersistedAskQuestion[],
	answers: readonly { question: string; answer: string }[],
): { questions: AdaptiveQuestion[]; answers: Record<string, string> } {
	const restoredQuestions = mapAskQuestionsToAdaptive(
		questions.map((question) => ({
			id: question.id,
			question: question.question,
			type: question.type,
			...(question.options ? { options: question.options } : {}),
			...(question.recommended !== undefined
				? { recommended: question.recommended }
				: {}),
			...(question.recommendationReason
				? { recommendationReason: question.recommendationReason }
				: {}),
		})),
	);
	const answerByQuestionText = new Map(
		answers.map((entry) => [entry.question.trim(), entry.answer]),
	);
	const restoredAnswers: Record<string, string> = {};
	for (const question of restoredQuestions) {
		const answer = answerByQuestionText.get(question.title.trim());
		if (answer !== undefined && answer.trim().length > 0) {
			restoredAnswers[question.id] = answer;
		}
	}
	return { questions: restoredQuestions, answers: restoredAnswers };
}

/** Defensive parse of the `/api/ask/options` get-handoff payload. Malformed
 *  entries are dropped per field rather than thrown, so a partial handoff
 *  degrades gracefully instead of blocking recovery. */
export function parseRestoredQuestions(value: unknown): PersistedAskQuestion[] {
	if (!Array.isArray(value)) return [];
	const out: PersistedAskQuestion[] = [];
	for (const entry of value) {
		if (typeof entry !== "object" || entry === null) continue;
		const record = entry as Record<string, unknown>;
		if (
			typeof record.id !== "string" ||
			typeof record.question !== "string" ||
			(record.type !== "select" &&
				record.type !== "text" &&
				record.type !== "multiselect")
		) {
			continue;
		}
		const options = Array.isArray(record.options)
			? record.options.filter(
					(option): option is string => typeof option === "string",
				)
			: undefined;
		const recommended =
			typeof record.recommended === "number" ? record.recommended : undefined;
		const recommendationReason =
			typeof record.recommendationReason === "string"
				? record.recommendationReason
				: undefined;
		out.push({
			id: record.id,
			question: record.question,
			type: record.type,
			...(options ? { options } : {}),
			...(recommended !== undefined ? { recommended } : {}),
			...(recommendationReason ? { recommendationReason } : {}),
		});
	}
	return out;
}

export function parseRestoredAnswers(
	value: unknown,
): Array<{ question: string; answer: string }> {
	if (!Array.isArray(value)) return [];
	const out: Array<{ question: string; answer: string }> = [];
	for (const entry of value) {
		if (typeof entry !== "object" || entry === null) continue;
		const record = entry as Record<string, unknown>;
		if (
			typeof record.question === "string" &&
			typeof record.answer === "string" &&
			record.question.trim() &&
			record.answer.trim()
		) {
			out.push({ question: record.question, answer: record.answer });
		}
	}
	return out;
}
