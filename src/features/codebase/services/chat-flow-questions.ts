import type {
	AskOptionDraft,
	AskOptionInput,
	AskQuestion,
	AskQuestionType,
} from "@/features/greenfield/services/ask-service";
import { toCanonicalOptions } from "@/features/greenfield/services/ask-service";
import type { FlowQuestion } from "./chat-flow-run";

export type { AskQuestionType };

/** Validated question shape from `/api/ask/options` (ask-service contract). */
export type RawAskQuestion = AskQuestion;

export interface AdaptiveQuestionOption {
	id: string;
	label: string;
	/** What choosing this option changes. Absent only for legacy data written
	 *  before FIX 01, or for the Greenfield short-text option form. */
	description?: string;
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
 *
 * Option identity comes from the CANONICAL order (see `toCanonicalOptions`), so
 * a renderer that shows the recommended option first sorts a copy and leaves
 * both the saved answer (the label) and `recommendedOptionId` untouched.
 */
export function mapAskQuestionsToAdaptive(
	raw: readonly RawAskQuestion[],
): AdaptiveQuestion[] {
	return raw.map((item) => {
		const options = toCanonicalOptions(item.id, item.options ?? []).map(
			(option, optionIndex) => ({
				id: option.id,
				label: option.label,
				...(option.description ? { description: option.description } : {}),
				recommended: item.type === "select" && item.recommended === optionIndex,
			}),
		);
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

/** Persisted Ask question shape (mirrors the handoff state schema). Options keep
 *  the tolerant input form: handoffs written before FIX 01 stored `string[]`,
 *  new writes always store `{ label, description }`. Only the heading is ever a
 *  saved answer; the description is supporting information. */
export interface PersistedAskQuestion {
	id: string;
	question: string;
	type: AskQuestionType;
	options?: AskOptionInput[];
	recommended?: number;
	recommendationReason?: string;
}

/**
 * Serialize the visible adaptive questions into the restorable handoff shape so
 * a refresh or History reopen can rebuild the exact question list and answer
 * mapping. Descriptions are persisted alongside the heading they belong to, and
 * the recommendation is stored as an index into the very array written here, so
 * the pair can never drift apart. Only the fields a question actually carries
 * are written.
 */
export function serializeAskQuestions(
	questions: readonly AdaptiveQuestion[],
): PersistedAskQuestion[] {
	return questions.map((question) => {
		const recommendedIndex =
			question.recommendedOptionId !== undefined
				? question.options.findIndex(
						(option) => option.id === question.recommendedOptionId,
					)
				: -1;
		return {
			id: question.id,
			question: question.title,
			type: question.type,
			...(question.options.length > 0
				? {
						options: question.options.map((option) => ({
							label: option.label,
							...(option.description
								? { description: option.description }
								: {}),
						})),
					}
				: {}),
			...(recommendedIndex >= 0 ? { recommended: recommendedIndex } : {}),
			...(question.recommendationReason
				? { recommendationReason: question.recommendationReason }
				: {}),
		};
	});
}

/**
 * Rebuild the UI questions and answers from a persisted handoff. Answers are
 * keyed by question id; option semantics (type, options, heading, description,
 * recommendation) are reconstructed from the stored question fields so nothing
 * is flattened. Option identity is re-derived from the canonical order, which
 * is why the saved label keeps pointing at the same option.
 */
export function restoreAskState(
	questions: readonly PersistedAskQuestion[],
	answers: readonly { question: string; answer: string; questionId?: string }[],
): { questions: AdaptiveQuestion[]; answers: Record<string, string> } {
	const restoredQuestions = mapAskQuestionsToAdaptive(
		questions.map((question) => ({
			id: question.id,
			question: question.question,
			type: question.type,
			...(question.options
				? { options: toCanonicalOptions(question.id, question.options) }
				: {}),
			...(question.recommended !== undefined
				? { recommended: question.recommended }
				: {}),
			...(question.recommendationReason
				? { recommendationReason: question.recommendationReason }
				: {}),
		})),
	);
	const answerByQuestionId = new Map<string, string>();
	const answerByQuestionText = new Map<string, string>();
	for (const entry of answers) {
		if (entry.questionId && entry.answer.trim().length > 0) {
			answerByQuestionId.set(entry.questionId, entry.answer);
		}
		if (entry.question.trim().length > 0 && entry.answer.trim().length > 0) {
			answerByQuestionText.set(entry.question.trim(), entry.answer);
		}
	}
	const restoredAnswers: Record<string, string> = {};
	for (const question of restoredQuestions) {
		const answer =
			answerByQuestionId.get(question.id) ??
			answerByQuestionText.get(question.title.trim());
		if (answer !== undefined && answer.trim().length > 0) {
			restoredAnswers[question.id] = answer;
		}
	}
	return { questions: restoredQuestions, answers: restoredAnswers };
}

/**
 * Legacy-tolerant option normalization for restore only. Unlike the generation
 * parser (which REJECTS an object option without a description, because that is
 * a contract miss the model must repair), stored data is never thrown away: a
 * plain string becomes a heading, and a description is kept only when it is
 * genuinely present. Nothing is invented to fill a gap.
 */
function toStoredOptionDraft(value: unknown): AskOptionDraft | null {
	if (typeof value === "string") {
		const label = value.trim();
		return label ? { label } : null;
	}
	if (typeof value !== "object" || value === null) return null;
	const record = value as Record<string, unknown>;
	if (typeof record.label !== "string") return null;
	const label = record.label.trim();
	if (!label) return null;
	const description =
		typeof record.description === "string" ? record.description.trim() : "";
	return { label, ...(description ? { description } : {}) };
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
			? record.options
					.map((option) => toStoredOptionDraft(option))
					.filter((option): option is AskOptionDraft => option !== null)
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
): Array<{ question: string; answer: string; questionId?: string }> {
	if (!Array.isArray(value)) return [];
	const out: Array<{ question: string; answer: string; questionId?: string }> =
		[];
	for (const entry of value) {
		if (typeof entry !== "object" || entry === null) continue;
		const record = entry as Record<string, unknown>;
		if (
			typeof record.question === "string" &&
			typeof record.answer === "string" &&
			record.question.trim() &&
			record.answer.trim()
		) {
			const questionId =
				typeof record.questionId === "string" && record.questionId.trim()
					? record.questionId.trim()
					: undefined;
			out.push({
				question: record.question,
				answer: record.answer,
				...(questionId ? { questionId } : {}),
			});
		}
	}
	return out;
}
