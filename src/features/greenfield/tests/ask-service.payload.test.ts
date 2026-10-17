import { describe, expect, it } from "vitest";
import {
	type AskQuestion,
	buildAskOptionsRepairPrompt,
	classifyAskOptionsOutput,
	parseAskOptionsJson,
	validateAskQuestions,
} from "@/features/greenfield/services/ask-service";

/**
 * Regression contract for the `/api/ask/options` payload boundary.
 *
 * The workspace used to call the JSON-envelope parser on the bare `questions`
 * array it received, which can never succeed (the envelope parser requires
 * `{ questions: [...] }`). Every valid server response was therefore rejected
 * with "AI menghasilkan format tidak valid". These tests pin both halves:
 * the array validator accepts the server payload, and the envelope parser
 * still refuses anything that is not the model's documented shape.
 */

const validQuestions: AskQuestion[] = [
	{
		id: "scope",
		question: "Modul mana yang perlu diubah?",
		type: "select",
		options: ["Modul A", "Modul B"],
		recommended: 0,
		recommendationReason: "Analisis menunjukkan modul A memegang alur ini.",
	},
	{ id: "notes", question: "Catatan tambahan?", type: "text" },
	{
		id: "surfaces",
		question: "Permukaan UI mana?",
		type: "multiselect",
		options: ["A", "B"],
	},
];

describe("validateAskQuestions (server payload boundary)", () => {
	it("accepts the exact array shape /api/ask/options returns", () => {
		expect(validateAskQuestions(validQuestions)).toEqual(validQuestions);
	});

	it("rejects a bare array through the envelope parser, proving the old bug", () => {
		// This is the call the workspace used to make. It must stay a miss:
		// the envelope parser is for raw model text, not for a payload.
		expect(parseAskOptionsJson(JSON.stringify(validQuestions))).toBeNull();
	});

	it("accepts the envelope parser on the same content in its documented shape", () => {
		expect(
			parseAskOptionsJson(JSON.stringify({ questions: validQuestions })),
		).toEqual(validQuestions);
	});

	it("rejects malformed entries instead of partially trusting them", () => {
		expect(
			validateAskQuestions([
				{ id: "a", question: "Valid?", type: "text" },
				{ id: "b", question: "Valid?", type: "select" },
				{ id: "c", question: "Valid?", type: "text" },
			]),
		).toBeNull();
		expect(
			validateAskQuestions([
				{ id: "a", question: "Valid?", type: "text" },
				{ id: "b", question: "Valid?", type: "unsupported" },
				{ id: "c", question: "Valid?", type: "text" },
			]),
		).toBeNull();
	});

	it("rejects counts outside the documented 3-10 tier", () => {
		expect(validateAskQuestions([])).toBeNull();
		expect(
			validateAskQuestions([
				{ id: "a", question: "Valid?", type: "text" },
				{ id: "b", question: "Valid?", type: "text" },
			]),
		).toBeNull();
		expect(
			validateAskQuestions(
				Array.from({ length: 11 }, (_, i) => ({
					id: `q${i}`,
					question: "Valid?",
					type: "text",
				})),
			),
		).toBeNull();
	});

	it("drops an out-of-range or reason-less recommendation", () => {
		const result = validateAskQuestions([
			{
				id: "a",
				question: "Pilih?",
				type: "select",
				options: ["X", "Y"],
				recommended: 5,
				recommendationReason: "Alasan.",
			},
			{
				id: "b",
				question: "Pilih?",
				type: "select",
				options: ["X", "Y"],
				recommended: 0,
			},
			{ id: "c", question: "Valid?", type: "text" },
		]);
		expect(result?.[0]).toEqual({
			id: "a",
			question: "Pilih?",
			type: "select",
			options: ["X", "Y"],
		});
		expect(result?.[1]).toEqual({
			id: "b",
			question: "Pilih?",
			type: "select",
			options: ["X", "Y"],
		});
	});

	it("rejects non-array payloads outright", () => {
		expect(validateAskQuestions(null)).toBeNull();
		expect(validateAskQuestions({ questions: validQuestions })).toBeNull();
		expect(validateAskQuestions("[]")).toBeNull();
	});
});

describe("ask options failure classification (diagnostics only)", () => {
	it("separates unparseable text from schema misses", () => {
		expect(classifyAskOptionsOutput("not json at all")).toBe("invalid_json");
		expect(classifyAskOptionsOutput("")).toBe("invalid_json");
		// Valid JSON in the wrong shape is a schema miss, not a parse failure.
		expect(classifyAskOptionsOutput("[]")).toBe("schema");
		expect(classifyAskOptionsOutput(JSON.stringify({ questions: [] }))).toBe(
			"schema",
		);
		expect(
			classifyAskOptionsOutput(
				JSON.stringify({
					questions: [{ id: "a", question: "Q?", type: "text" }],
				}),
			),
		).toBe("schema");
	});

	it("never echoes a successful payload as a failure", () => {
		expect(
			classifyAskOptionsOutput(JSON.stringify({ questions: validQuestions })),
		).toBe("schema");
	});
});

describe("bounded repair prompt", () => {
	it("restates the contract without supplying questions or options", () => {
		const prompt = buildAskOptionsRepairPrompt({
			raw: '{"questions": "nope"}',
			reason: "schema",
		});
		expect(prompt).toContain("questions");
		expect(prompt).toContain("select|text|multiselect");
		expect(prompt).toContain("Perbaiki dan kirim ulang HANYA JSON valid");
		// The repair must instruct preservation, never invention.
		expect(prompt).toContain("jangan menambah atau menghapus pertanyaan");
	});

	it("bounds the rejected output it hands back", () => {
		const prompt = buildAskOptionsRepairPrompt({
			raw: "x".repeat(50_000),
			reason: "invalid_json",
			maxRawChars: 100,
		});
		expect(prompt).toContain("...(dipotong)");
		expect(prompt.length).toBeLessThan(1_000);
	});
});
