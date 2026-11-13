/**
 * Ask-flow question parsing - mirrors task-service.ts's parseTaskJson
 * strict-validation pattern (reject malformed shape, no partial trust).
 */
import { z } from "zod";

export type AskQuestionType = "select" | "text" | "multiselect";

/** One answer option before identity is assigned (model output, persisted form). */
export interface AskOptionDraft {
	/** Heading the user picks — short, specific, and free of app jargon. */
	label: string;
	/** What choosing this option changes: scope, behaviour, or limits. */
	description?: string;
}

/**
 * Option input accepted by the shared parser. Both forms are real: the legacy
 * short-text form (what the Greenfield prompt emits and what handoffs written
 * before FIX 01 store) and the rich object form (heading + description) the
 * Existing-Codebase prompt emits.
 */
export type AskOptionInput = string | AskOptionDraft;

/** Canonical option: stable identity + heading + optional description. */
export interface AskQuestionOption extends AskOptionDraft {
	id: string;
}

export interface AskQuestion {
	id: string;
	question: string;
	type: AskQuestionType;
	options?: AskQuestionOption[];
	/** 0-based index of the option the model recommends, only when the model
	 *  declared it explicitly. Never inferred from array order. */
	recommended?: number;
	/** Short, evidence-tied justification for the recommendation. Metadata only:
	 *  what the user reads must already be in the recommended option's own
	 *  description, so no separate reason panel is required. */
	recommendationReason?: string;
}

const MAX_OPTIONS_PER_QUESTION = 12;
// Matches the persisted handoff bound (`askHandoffOptionSchema`): a heading the
// parser accepts must be storable, otherwise a long label would pass generation
// and then 400 the handoff save, which gates feature generation.
const MAX_OPTION_CHARS = 100;
const MAX_OPTION_DESC_CHARS = 400;
const MAX_QUESTION_CHARS = 2000;
const MAX_ID_CHARS = 128;
const MAX_REASON_CHARS = 400;

/**
 * Canonical option identity: the question id plus the option's position in the
 * CANONICAL array. Display code sorts a copy (recommendation first) and never
 * reorders the canonical array, so the id — and with it the saved answer, which
 * is the label — keeps pointing at the same option.
 */
export function buildAskOptionId(questionId: string, index: number): string {
	return `${questionId}-opt${index + 1}`;
}

/**
 * Assign canonical identities to accepted options, preserving order. Accepts
 * both real forms: a plain string is the legacy short-text heading (no
 * description available), an object carries heading + description. Validation
 * and restore both come through here so identity is assigned by one rule.
 */
export function toCanonicalOptions(
	questionId: string,
	inputs: readonly AskOptionInput[],
): AskQuestionOption[] {
	return inputs.map((input, index) => {
		const draft = typeof input === "string" ? { label: input } : input;
		return {
			id: buildAskOptionId(questionId, index),
			label: draft.label,
			...(draft.description ? { description: draft.description } : {}),
		};
	});
}

/**
 * Accept one raw option as either form. Returns null when it misses the
 * contract so the caller can reject (generation) or drop it (restore):
 * - string: the legacy short-text heading (no description available).
 * - object: `label` plus an optional `description`. When a description is
 *   present it must carry information — blank, oversized, or a verbatim repeat
 *   of the heading is rejected.
 * Whether a description is REQUIRED is a mode question, not a shape question:
 * `describeOptionContractMiss` enforces it for the Existing-Codebase prompt
 * only, because the Greenfield prompt and every pre-FIX-01 handoff carry
 * heading-only options that must stay valid.
 */
const askOptionSchema = z.union([
	z
		.string()
		.trim()
		.min(1)
		.max(MAX_OPTION_CHARS)
		.transform((label) => ({ label })),
	z
		.object({
			label: z.string().trim().min(1).max(MAX_OPTION_CHARS),
			description: z
				.string()
				.trim()
				.min(1)
				.max(MAX_OPTION_DESC_CHARS)
				.nullish(),
		})
		.refine(
			(option) =>
				!option.description ||
				option.description.toLowerCase() !== option.label.toLowerCase(),
		)
		.transform(({ label, description }) => ({
			label,
			...(description ? { description } : {}),
		})),
]);

export function normalizeAskOptionInput(input: unknown): AskOptionDraft | null {
	const parsed = askOptionSchema.safeParse(input);
	return parsed.success ? parsed.data : null;
}

/**
 * Location of the first option that breaks the rich contract (heading without a
 * description), or null when every option explains itself. Used to run the one
 * bounded repair pass instead of silently shipping a half-explained list.
 */
export function describeOptionContractMiss(
	questions: readonly AskQuestion[],
): string | null {
	for (const question of questions) {
		const options = question.options ?? [];
		for (let index = 0; index < options.length; index += 1) {
			if (!options[index].description) {
				return `${question.id}#opt${index + 1}`;
			}
		}
	}
	return null;
}

/**
 * Validate the `questions` array itself (the value `/api/ask/options` returns).
 *
 * Split from the JSON envelope so both boundaries share ONE set of rules:
 * `parseAskOptionsJson` validates raw model text, and this validates the
 * already-extracted array a client receives. A client that called the JSON
 * envelope parser on a bare array could never succeed, which is exactly the
 * bug this split fixes — and it keeps the client's re-validation strict
 * instead of trusting the wire.
 */
export function validateAskQuestions(value: unknown): AskQuestion[] | null {
	if (!Array.isArray(value) || value.length === 0) return null;
	// ponytail: AI picks count by complexity tier (3-10). Reject outside
	// bounds so a runaway model can't flood the ask flow with 20 questions
	// or starve it with 1.
	if (value.length < 3 || value.length > 10) return null;

	// Per-question bounds: one valid question must not smuggle an
	// unbounded options array, and every string must carry visible
	// content (whitespace-only renders blank and breaks answer lookup).
	const validated: AskQuestion[] = [];
	const seenIds = new Set<string>();

	for (const q of value as Array<Record<string, unknown>>) {
		if (typeof q?.id !== "string" || !q.id.trim() || q.id.length > MAX_ID_CHARS)
			return null;
		const cleanId = q.id.trim();
		if (seenIds.has(cleanId)) return null;
		seenIds.add(cleanId);
		if (
			typeof q?.question !== "string" ||
			!q.question.trim() ||
			q.question.length > MAX_QUESTION_CHARS
		)
			return null;
		const qType = q.type as string | undefined;
		if (!qType || !["select", "text", "multiselect"].includes(qType))
			return null;
		let options: AskQuestionOption[] | undefined;
		// select & multiselect require options array; text does not
		if (qType === "select" || qType === "multiselect") {
			if (!Array.isArray(q.options) || q.options.length === 0) return null;
			if (q.options.length > MAX_OPTIONS_PER_QUESTION) return null;
			const drafts: AskOptionDraft[] = [];
			for (const rawOption of q.options) {
				const draft = normalizeAskOptionInput(rawOption);
				if (!draft) return null;
				drafts.push(draft);
			}
			const seenOpts = new Set<string>();
			for (const draft of drafts) {
				const lower = draft.label.toLowerCase();
				if (seenOpts.has(lower)) return null;
				seenOpts.add(lower);
			}
			options = toCanonicalOptions(cleanId, drafts);
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
}

/**
 * Parse a raw model completion (text) into validated questions. The envelope
 * must be `{ "questions": [...] }`; the array rules live in
 * `validateAskQuestions` so both boundaries cannot drift apart.
 */
export function parseAskOptionsJson(jsonString: string): AskQuestion[] | null {
	try {
		const parsed = JSON.parse(jsonString) as { questions?: unknown };
		return validateAskQuestions(parsed?.questions);
	} catch {
		return null;
	}
}
