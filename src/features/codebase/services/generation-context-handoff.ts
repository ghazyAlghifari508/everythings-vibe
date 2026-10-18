import { z } from "zod";
import {
	CODEBASE_ASK_HANDOFF_MAX_ANSWERS,
	CODEBASE_ASK_HANDOFF_MAX_OPTIONS,
	CODEBASE_ASK_HANDOFF_MAX_PROMPT_CHARS,
	CODEBASE_ASK_HANDOFF_MAX_STATE_CHARS,
} from "@/features/codebase/types/codebase-constants";
import { MAX_PROMPT_LENGTH } from "@/lib/constants";
import { truncateText } from "./generation-context-build";

// === Ask handoff validation (pure) ===
// Authoritative server-side copy of Ask answers/compiled prompt for
// existing-codebase projects. Bounded so refresh/multi-device restore stays
// cheap; sessionStorage remains for UI continuity.

export const askHandoffAnswerSchema = z.object({
	question: z.string().min(1).max(500),
	answer: z.string().min(1).max(2000),
});

export const askHandoffQuestionSchema = z.object({
	id: z.string().min(1).max(128),
	question: z.string().min(1).max(500),
	type: z.enum(["select", "text", "multiselect"]),
	options: z.array(z.string().min(1).max(100)).max(12).optional(),
	recommended: z.number().int().min(0).max(11).optional(),
	recommendationReason: z.string().min(1).max(400).optional(),
});

export const askHandoffNonTechAnswerSchema = z.object({
	value: z.string().default(""),
	isCustom: z.boolean().default(false),
	skipped: z.boolean().default(false),
	values: z.array(z.string()).optional(),
});

export const askHandoffTechAnswersSchema = z.object({
	frontend: z.string().optional(),
	backend: z.string().optional(),
	fullstackFramework: z.string().optional(),
	database: z.string().optional(),
	deployment: z.string().optional(),
});

export const askHandoffStateSchema = z.object({
	prompt: z
		.string()
		.min(1)
		.max(MAX_PROMPT_LENGTH * 2),
	platform: z.enum(["web", "mobile"]).optional(),
	session: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
	questions: z.array(askHandoffQuestionSchema).max(24).optional(),
	nonTechAnswers: z
		.record(z.string(), askHandoffNonTechAnswerSchema)
		.optional(),
	techAnswers: askHandoffTechAnswersSchema.optional(),
	skippedTech: z.array(z.string().max(64)).max(12).optional(),
});

export type AskHandoffState = z.infer<typeof askHandoffStateSchema>;

export const askHandoffSchema = z.object({
	projectId: z.string().min(1),
	answers: z
		.array(askHandoffAnswerSchema)
		.max(CODEBASE_ASK_HANDOFF_MAX_ANSWERS * 2)
		.default([]),
	compiledPrompt: z
		.string()
		.max(CODEBASE_ASK_HANDOFF_MAX_PROMPT_CHARS * 2)
		.optional(),
	snapshotId: z.string().min(1).nullable().optional(),
	state: askHandoffStateSchema.optional(),
});

export type AskHandoff = z.infer<typeof askHandoffSchema>;

/** Bound the restorable Ask UI snapshot: question/option counts capped,
 *  long strings truncated, and the serialized total kept under budget. */
export function sanitizeAskHandoffState(
	state: AskHandoffState,
): AskHandoffState {
	const questions = (state.questions ?? [])
		.slice(0, CODEBASE_ASK_HANDOFF_MAX_ANSWERS)
		.map((q) => ({
			id: truncateText(q.id, 128),
			question: truncateText(q.question, 500),
			type: q.type,
			...(q.options
				? {
						options: q.options
							.slice(0, CODEBASE_ASK_HANDOFF_MAX_OPTIONS)
							.map((o) => truncateText(o, 100)),
					}
				: {}),
			// A recommendation is only meaningful when it indexes a surviving
			// option; otherwise it is dropped on restore.
			...(q.recommended !== undefined &&
			q.options &&
			q.recommended >= 0 &&
			q.recommended < q.options.length
				? { recommended: q.recommended }
				: {}),
			...(q.recommendationReason
				? { recommendationReason: truncateText(q.recommendationReason, 400) }
				: {}),
		}));
	const clean: AskHandoffState = {
		prompt: truncateText(state.prompt, MAX_PROMPT_LENGTH),
		...(state.platform ? { platform: state.platform } : {}),
		...(state.session
			? { session: (state.session === 3 ? 2 : state.session) as 1 | 2 }
			: {}),
		questions,
	};
	if (state.nonTechAnswers && typeof state.nonTechAnswers === "object") {
		clean.nonTechAnswers = state.nonTechAnswers;
	}
	if (state.techAnswers && typeof state.techAnswers === "object") {
		clean.techAnswers = state.techAnswers;
	}
	if (state.skippedTech) {
		clean.skippedTech = state.skippedTech.slice(0, 12);
	}
	// Total-size guard: drop the heavy free-form maps first if oversized.
	let serialized = JSON.stringify(clean);
	if (serialized.length > CODEBASE_ASK_HANDOFF_MAX_STATE_CHARS) {
		delete clean.nonTechAnswers;
		delete clean.techAnswers;
		serialized = JSON.stringify(clean);
	}
	if (serialized.length > CODEBASE_ASK_HANDOFF_MAX_STATE_CHARS) {
		clean.questions = [];
	}
	return clean;
}

export function sanitizeAskHandoff(input: AskHandoff): AskHandoff {
	return {
		projectId: input.projectId,
		answers: (input.answers ?? []).slice(0, CODEBASE_ASK_HANDOFF_MAX_ANSWERS),
		...(input.compiledPrompt
			? {
					compiledPrompt: truncateText(
						input.compiledPrompt,
						CODEBASE_ASK_HANDOFF_MAX_PROMPT_CHARS,
					),
				}
			: {}),
		...(input.snapshotId ? { snapshotId: input.snapshotId } : {}),
		...(input.state ? { state: sanitizeAskHandoffState(input.state) } : {}),
	};
}

/** Neutral structural rendering of stored answers (no secrets involved —
 *  answers are user-provided product preferences only). */
export function buildAskHandoffPrompt(
	answers: ReadonlyArray<{ question: string; answer: string }>,
): string {
	if (answers.length === 0) return "-";
	return answers.map((a) => `- ${a.question}: ${a.answer}`).join("\n");
}

/** Loose parse of the jsonb answers column: malformed entries are dropped,
 *  never thrown, so a corrupt handoff degrades to empty answers. */
export function parseStoredHandoffAnswers(
	value: unknown,
): Array<{ question: string; answer: string }> {
	if (!Array.isArray(value)) return [];
	const out: Array<{ question: string; answer: string }> = [];
	for (const entry of value) {
		if (
			typeof entry === "object" &&
			entry !== null &&
			typeof (entry as { question?: unknown }).question === "string" &&
			typeof (entry as { answer?: unknown }).answer === "string"
		) {
			const question = (entry as { question: string }).question.trim();
			const answer = (entry as { answer: string }).answer.trim();
			if (question && answer) out.push({ question, answer });
		}
	}
	return out.slice(0, CODEBASE_ASK_HANDOFF_MAX_ANSWERS);
}
