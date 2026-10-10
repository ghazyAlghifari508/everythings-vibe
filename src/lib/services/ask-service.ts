/**
 * Ask-flow question parsing - mirrors task-service.ts's parseTaskJson
 * strict-validation pattern (reject malformed shape, no partial trust).
 */
export type AskQuestionType = "select" | "text" | "multiselect";

export interface AskQuestion {
	id: string;
	question: string;
	type: AskQuestionType;
	options?: string[];
	/** 0-based index of the option the model recommends, only when the model
	 *  declared it explicitly. Never inferred from array order. */
	recommended?: number;
	/** Short, evidence-tied justification for the recommendation. */
	recommendationReason?: string;
}

const MAX_OPTIONS_PER_QUESTION = 12;
const MAX_OPTION_CHARS = 500;
const MAX_QUESTION_CHARS = 2000;
const MAX_ID_CHARS = 128;
const MAX_REASON_CHARS = 400;

export function parseAskOptionsJson(jsonString: string): AskQuestion[] | null {
	try {
		const parsed = JSON.parse(jsonString);
		if (
			!parsed.questions ||
			!Array.isArray(parsed.questions) ||
			parsed.questions.length === 0
		)
			return null;
		// ponytail: AI picks count by complexity tier (3-10). Reject outside
		// bounds so a runaway model can't flood the ask flow with 20 questions
		// or starve it with 1.
		if (parsed.questions.length < 3 || parsed.questions.length > 10)
			return null;

		// Per-question bounds: one valid question must not smuggle an
		// unbounded options array, and every string must carry visible
		// content (whitespace-only renders blank and breaks answer lookup).
		const validated: AskQuestion[] = [];

		for (const q of parsed.questions) {
			if (
				typeof q?.id !== "string" ||
				!q.id.trim() ||
				q.id.length > MAX_ID_CHARS
			)
				return null;
			if (
				typeof q?.question !== "string" ||
				!q.question.trim() ||
				q.question.length > MAX_QUESTION_CHARS
			)
				return null;
			const qType = q.type as string | undefined;
			if (!qType || !["select", "text", "multiselect"].includes(qType))
				return null;
			let options: string[] | undefined;
			// select & multiselect require options array; text does not
			if (qType === "select" || qType === "multiselect") {
				if (!Array.isArray(q.options) || q.options.length === 0) return null;
				if (q.options.length > MAX_OPTIONS_PER_QUESTION) return null;
				if (
					!q.options.every(
						(o: unknown) =>
							typeof o === "string" &&
							!!o.trim() &&
							o.length <= MAX_OPTION_CHARS,
					)
				)
					return null;
				options = q.options.map((o: string) => o.trim());
			}
			// A recommendation is only honored on a single-select question, and
			// only when the model supplied an in-range index AND a non-empty
			// reason. An out-of-range or reason-less recommendation is dropped
			// rather than silently pinned to the first option.
			let recommended: number | undefined;
			let recommendationReason: string | undefined;
			if (qType === "select" && options) {
				const candidate = q.recommended;
				const reason =
					typeof q.recommendationReason === "string"
						? q.recommendationReason.trim()
						: "";
				if (
					typeof candidate === "number" &&
					Number.isInteger(candidate) &&
					candidate >= 0 &&
					candidate < options.length &&
					reason.length > 0 &&
					reason.length <= MAX_REASON_CHARS
				) {
					recommended = candidate;
					recommendationReason = reason;
				}
			}
			validated.push({
				id: q.id.trim(),
				question: q.question.trim(),
				type: qType as AskQuestionType,
				...(options ? { options } : {}),
				...(recommended !== undefined ? { recommended } : {}),
				...(recommendationReason ? { recommendationReason } : {}),
			});
		}

		return validated;
	} catch {
		return null;
	}
}
