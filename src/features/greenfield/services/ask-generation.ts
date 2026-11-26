import { extractJson } from "@/lib/services/json-extract";
import {
	type AskQuestion,
	describeOptionContractMiss,
	parseAskOptionsJson,
} from "./ask-service";

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
		"2. Jumlah pertanyaan wajib 3-10. Pertahankan isi dan bahasa yang valid; ubah jumlah hanya bila di luar rentang tersebut, tetap berdasarkan kebutuhan user.",
		"3. type wajib select, text, atau multiselect. select/multiselect wajib options (1-12; utamakan 3-5). text tanpa options.",
		"Batas: id unik maks 128 karakter, question maks 2000, label maks 100, description maks 400. Label opsi tidak boleh duplikat. recommended hanya untuk select, indeks 0-based dalam options, disertai recommendationReason maks 400 karakter; omit keduanya jika tidak ada bukti.",
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
