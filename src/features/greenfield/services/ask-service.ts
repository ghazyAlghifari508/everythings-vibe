/**
 * Ask-flow question parsing - mirrors task-service.ts's parseTaskJson
 * strict-validation pattern (reject malformed shape, no partial trust).
 */
import { extractJson } from "@/lib/services/json-extract";

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
export function normalizeAskOptionInput(input: unknown): AskOptionDraft | null {
	if (typeof input === "string") {
		const label = input.trim();
		if (!label || label.length > MAX_OPTION_CHARS) return null;
		return { label };
	}
	if (typeof input !== "object" || input === null) return null;
	const record = input as Record<string, unknown>;
	if (typeof record.label !== "string") return null;
	const label = record.label.trim();
	if (!label || label.length > MAX_OPTION_CHARS) return null;
	if (record.description === undefined || record.description === null) {
		return { label };
	}
	if (typeof record.description !== "string") return null;
	const description = record.description.trim();
	if (!description || description.length > MAX_OPTION_DESC_CHARS) return null;
	if (description.toLowerCase() === label.toLowerCase()) return null;
	return { label, description };
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

// === Bounded repair + diagnostics ===
// The parser above is the contract. When a completion misses it, the caller may
// run exactly ONE correction request (mirroring the codebase-analysis repair):
// the rejected output is handed back with the failing locations and the shape
// rules, and the SAME strict parser runs again. The repair never supplies
// questions, options, or recommendations of its own — it only restates the
// contract, so a model that cannot comply fails visibly instead of the UI
// receiving invented content.

export type AskOptionsFailureReason = "invalid_json" | "schema";

/** Why a completion failed, derived from the completion itself. */
export function classifyAskOptionsOutput(raw: string): AskOptionsFailureReason {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return "invalid_json";
	}
	if (typeof parsed !== "object" || parsed === null) return "invalid_json";
	return "schema";
}

const REPAIR_MAX_RAW_CHARS = 6000;

/**
 * Correction request for a completion that missed the output contract. The
 * excerpt is bounded and carries no server-side secrets (it is the model's own
 * prior text), and the rules restate the schema without adding content.
 */
export function buildAskOptionsRepairPrompt(input: {
	raw: string;
	reason: AskOptionsFailureReason;
	maxRawChars?: number;
	/** Existing-Codebase mode: every option must carry a description too. */
	requireOptionDescriptions?: boolean;
}): string {
	const maxRawChars = input.maxRawChars ?? REPAIR_MAX_RAW_CHARS;
	const excerpt =
		input.raw.length > maxRawChars
			? `${input.raw.slice(0, maxRawChars)}\n...(dipotong)`
			: input.raw;
	const optionShape = input.requireOptionDescriptions
		? '{ "label": "Judul opsi", "description": "Apa yang berubah bila opsi ini dipilih" }'
		: '"Opsi singkat"';
	return [
		"Output sebelumnya tidak memenuhi kontrak JSON. Perbaiki dan kirim ulang HANYA JSON valid, tanpa teks lain.",
		`Kegagalan: ${input.reason}`,
		"Bentuk yang diwajibkan:",
		`{ "questions": [ { "id": "snake_case_id", "question": "Pertanyaan?", "type": "select|text|multiselect", "options": [ ${optionShape} ] } ] }`,
		"Output sebelumnya (dipotong):",
		excerpt,
		"Peraturan perbaikan:",
		"1. Output HANYA JSON valid sesuai bentuk di atas.",
		"2. Pertahankan jumlah, isi, dan bahasa pertanyaan yang sudah ada — jangan menambah atau menghapus pertanyaan untuk mengisi kekurangan.",
		"3. type wajib salah satu dari select, text, multiselect. select dan multiselect wajib punya options berisi minimal 3 opsi.",
		...(input.requireOptionDescriptions
			? [
					"4. SETIAP opsi wajib punya label dan description. description menjelaskan dampak, cakupan, atau batas pilihan, bukan mengulang label, dan bukan kalimat promosi.",
					"5. Jangan menambahkan komentar, penjelasan, atau markdown di luar JSON.",
				]
			: [
					"4. Jangan menambahkan komentar, penjelasan, atau markdown di luar JSON.",
				]),
	].join("\n");
}

// === Bounded repair orchestration (pure, injectable) ===
// Mirrors `generateValidatedAnalysis` in codebase-analysis.ts so both AI
// boundaries share one shape: collect once, parse strictly, and on a fixable
// contract miss run exactly ONE repair pass that restates the contract. A
// provider/transport failure is never repaired here — it propagates as-is so
// the caller can report the real cause.

export interface AskOptionsMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

export type AskOptionsCollectionFailure = {
	kind: "aborted" | "too_long" | "truncated";
	message: string;
};

export type AskOptionsCollection =
	| { ok: true; text: string; finishReason: string | undefined }
	| { ok: false; failure: AskOptionsCollectionFailure };

export type AskOptionsOutcome =
	| { ok: true; questions: AskQuestion[] }
	| {
			ok: false;
			code: "QUESTION_GENERATION_FAILED" | "QUESTION_FORMAT_INVALID";
			status: 499 | 500;
			message: string;
	  };

export interface AskOptionsDiagnostic {
	stage: "initial" | "repair";
	category: AskOptionsFailureReason;
	finishReason?: string;
	rawLength: number;
}

export interface GenerateValidatedAskQuestionsInput {
	/** One full model pass over the supplied conversation. */
	collect: (messages: AskOptionsMessage[]) => Promise<AskOptionsCollection>;
	messages: AskOptionsMessage[];
	/** Existing-Codebase contract: an option without a description counts as a
	 *  contract miss, so the bounded repair pass runs instead of shipping a
	 *  half-explained list. Greenfield leaves this off. */
	requireOptionDescriptions?: boolean;
	/** Optional structured diagnostic sink; never receives model text. */
	onDiagnostic?: (record: AskOptionsDiagnostic) => void;
}

export async function generateValidatedAskQuestions(
	input: GenerateValidatedAskQuestionsInput,
): Promise<AskOptionsOutcome> {
	const first = await input.collect(input.messages);
	if (!first.ok) {
		return {
			ok: false,
			code: "QUESTION_GENERATION_FAILED",
			status: first.failure.kind === "aborted" ? 499 : 500,
			message: first.failure.message,
		};
	}

	const contractMiss = (questions: AskQuestion[]): boolean =>
		Boolean(input.requireOptionDescriptions) &&
		describeOptionContractMiss(questions) !== null;

	const firstExtracted = extractJson(first.text);
	const firstQuestions = parseAskOptionsJson(firstExtracted);
	if (firstQuestions && !contractMiss(firstQuestions)) {
		return { ok: true, questions: firstQuestions };
	}

	const reason = classifyAskOptionsOutput(firstExtracted);
	input.onDiagnostic?.({
		stage: "initial",
		category: reason,
		...(first.finishReason !== undefined
			? { finishReason: first.finishReason }
			: {}),
		rawLength: first.text.length,
	});

	const repaired = await input.collect([
		...input.messages,
		{
			role: "user",
			content: buildAskOptionsRepairPrompt({
				raw: first.text,
				reason,
				...(input.requireOptionDescriptions
					? { requireOptionDescriptions: true }
					: {}),
			}),
		},
	]);
	if (!repaired.ok) {
		return {
			ok: false,
			code: "QUESTION_GENERATION_FAILED",
			status: repaired.failure.kind === "aborted" ? 499 : 500,
			message: repaired.failure.message,
		};
	}

	const repairedExtracted = extractJson(repaired.text);
	const repairedQuestions = parseAskOptionsJson(repairedExtracted);
	if (repairedQuestions && !contractMiss(repairedQuestions)) {
		return { ok: true, questions: repairedQuestions };
	}

	input.onDiagnostic?.({
		stage: "repair",
		category: classifyAskOptionsOutput(repairedExtracted),
		...(repaired.finishReason !== undefined
			? { finishReason: repaired.finishReason }
			: {}),
		rawLength: repaired.text.length,
	});
	return {
		ok: false,
		code: "QUESTION_FORMAT_INVALID",
		status: 500,
		message:
			"AI belum menghasilkan pertanyaan yang valid setelah perbaikan. Coba lagi.",
	};
}
