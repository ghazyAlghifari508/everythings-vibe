import { describe, expect, it } from "vitest";
import { generateValidatedAskQuestions } from "../services/ask-generation";
import {
	normalizeAskOptionInput,
	validateAskQuestions,
} from "../services/ask-service";

const rich = [
	{
		id: "scope",
		question: "Scope?",
		type: "select",
		options: [
			{ label: "Title", description: "Matches the project name only." },
			{
				label: "Summary",
				description: "Also matches the indexed project summary.",
			},
		],
		recommended: 1,
		recommendationReason: "Summary is indexed.",
	},
	{
		id: "filters",
		question: "Filters?",
		type: "multiselect",
		options: [
			{ label: "Tags", description: "Allows several tags at once." },
			{ label: "Category", description: "Narrows results to a category." },
		],
	},
	{ id: "notes", question: "Notes?", type: "text" },
];

async function generate(payloads: unknown[], requireOptionDescriptions = true) {
	let calls = 0;
	const diagnostics: unknown[] = [];
	const result = await generateValidatedAskQuestions({
		messages: [],
		requireOptionDescriptions,
		collect: async () => ({
			ok: true,
			text: JSON.stringify({ questions: payloads[calls++] }),
			finishReason: "stop",
		}),
		onDiagnostic: (record) => diagnostics.push(record),
	});
	return { result, calls, diagnostics };
}

describe("Existing Codebase generation contract", () => {
	it("accepts rich options with exact canonical recommendation identity", async () => {
		const { result, calls } = await generate([rich]);
		expect(result).toEqual({ ok: true, questions: validateAskQuestions(rich) });
		expect(calls).toBe(1);
	});

	it.each([
		undefined,
		null,
		"",
		" ",
		42,
		"D".repeat(401),
		"Title",
	])("repairs missing or invalid description %s once", async (description) => {
		const invalid = [
			{ ...rich[0], options: [{ label: "Title", description }] },
			...rich.slice(1),
		];
		const { result, calls, diagnostics } = await generate([invalid, rich]);
		expect(result).toEqual({ ok: true, questions: validateAskQuestions(rich) });
		expect(calls).toBe(2);
		expect(diagnostics).toEqual([
			{
				stage: "initial",
				category: "schema",
				finishReason: "stop",
				rawLength: JSON.stringify({ questions: invalid }).length,
			},
		]);
	});

	it("fails visibly if the bounded schema repair remains malformed", async () => {
		const { result, calls } = await generate([
			[null, {}, 3],
			[null, {}, 3],
		]);
		expect(result).toMatchObject({
			ok: false,
			code: "QUESTION_FORMAT_INVALID",
			status: 500,
		});
		expect(calls).toBe(2);
	});

	it.each([
		-1,
		2,
		1.5,
		"1",
		null,
	])("never invents a recommendation from invalid index %s", (recommended) => {
		const parsed = validateAskQuestions([
			{ ...rich[0], recommended },
			...rich.slice(1),
		]);
		expect(parsed?.[0].recommended).toBeUndefined();
		expect(parsed?.[0].recommendationReason).toBeUndefined();
	});

	it("rejects malformed rich labels without substituting empty text", () => {
		for (const label of [null, undefined, 1, "", " ", "L".repeat(101)]) {
			expect(
				normalizeAskOptionInput({ label, description: "Changes scope." }),
			).toBeNull();
		}
	});

	it("keeps legacy Greenfield string options valid without a repair", async () => {
		const legacy = rich.map((q) => ({
			...q,
			...(q.options ? { options: q.options.map((o) => o.label) } : {}),
		}));
		const { result, calls } = await generate([legacy], false);
		expect(result).toEqual({
			ok: true,
			questions: validateAskQuestions(legacy),
		});
		expect(calls).toBe(1);
	});
});
