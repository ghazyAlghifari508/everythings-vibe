import { describe, expect, test, vi } from "vitest";
import {
	areAllQuestionsAnswered,
	buildFeatureMessage,
	mapAskQuestionsToAdaptive,
	nextQuestionIndex,
	parseRestoredAnswers,
	parseRestoredQuestions,
	restoreAskState,
	runConfirmGenerate,
	serializeAskQuestions,
} from "@/features/codebase/services/chat-flow";

const questions = [{ id: "q1" }, { id: "q2" }, { id: "q3" }];

describe("nextQuestionIndex", () => {
	test("returns zero when nothing is answered", () => {
		expect(nextQuestionIndex({}, questions)).toBe(0);
	});

	test("advances past answered questions in order", () => {
		expect(nextQuestionIndex({ q1: "a" }, questions)).toBe(1);
		expect(nextQuestionIndex({ q1: "a", q2: "b" }, questions)).toBe(2);
	});

	test("returns -1 when every question is answered", () => {
		expect(nextQuestionIndex({ q1: "a", q2: "b", q3: "c" }, questions)).toBe(
			-1,
		);
	});
});

describe("areAllQuestionsAnswered", () => {
	test("is false until every id has a non-blank answer", () => {
		expect(areAllQuestionsAnswered({ q1: "a" }, questions)).toBe(false);
		expect(
			areAllQuestionsAnswered({ q1: "a", q2: " ", q3: "c" }, questions),
		).toBe(false);
	});

	test("is true when every id is answered", () => {
		expect(
			areAllQuestionsAnswered({ q1: "a", q2: "b", q3: "c" }, questions),
		).toBe(true);
	});
});

describe("buildFeatureMessage", () => {
	test("joins non-blank answers after the feature prefix", () => {
		expect(
			buildFeatureMessage("Toko", { q1: " cepat ", q2: " ", q3: "aman" }),
		).toBe("Rencanakan fitur Toko: cepat aman");
	});

	test("falls back to prefix only when answers are blank", () => {
		expect(buildFeatureMessage("Toko", {})).toBe("Rencanakan fitur Toko");
	});
});

describe("mapAskQuestionsToAdaptive", () => {
	test("preserves question type and never turns every question into a select", () => {
		const mapped = mapAskQuestionsToAdaptive([
			{
				id: "store",
				question: "Simpan di mana?",
				type: "select",
				options: [
					{ id: "store-opt1", label: "Lokal" },
					{ id: "store-opt2", label: "Server" },
				],
			},
			{ id: "name", question: "Nama fitur?", type: "text" },
			{
				id: "surfaces",
				question: "Permukaan mana?",
				type: "multiselect",
				options: [
					{ id: "surfaces-opt1", label: "Kartu" },
					{ id: "surfaces-opt2", label: "Detail" },
				],
			},
		]);
		expect(mapped.map((q) => q.type)).toEqual([
			"select",
			"text",
			"multiselect",
		]);
	});

	test("carries each option's description into the UI model", () => {
		const [mapped] = mapAskQuestionsToAdaptive([
			{
				id: "store",
				question: "Simpan di mana?",
				type: "select",
				options: [
					{
						id: "store-opt1",
						label: "Lokal",
						description: "Tersimpan di perangkat user.",
					},
					{ id: "store-opt2", label: "Server" },
				],
			},
		]);
		expect(mapped.options[0].description).toBe("Tersimpan di perangkat user.");
		expect(mapped.options[1]).not.toHaveProperty("description");
	});

	test("only marks the explicitly recommended option, never the first", () => {
		const [mapped] = mapAskQuestionsToAdaptive([
			{
				id: "store",
				question: "Simpan di mana?",
				type: "select",
				options: [
					{ id: "store-opt1", label: "Lokal" },
					{ id: "store-opt2", label: "Server" },
				],
				recommended: 1,
				recommendationReason: "Repo memakai penyimpanan lokal.",
			},
		]);
		expect(mapped.options.map((o) => o.recommended)).toEqual([false, true]);
		expect(mapped.recommendedOptionId).toBe("store-opt2");
		expect(mapped.recommendationReason).toBe("Repo memakai penyimpanan lokal.");
	});

	test("carries no recommendation when the server sent none", () => {
		const [mapped] = mapAskQuestionsToAdaptive([
			{
				id: "store",
				question: "Simpan di mana?",
				type: "select",
				options: [
					{ id: "store-opt1", label: "Lokal" },
					{ id: "store-opt2", label: "Server" },
				],
			},
		]);
		expect(mapped.options.some((o) => o.recommended)).toBe(false);
		expect(mapped.recommendedOptionId).toBeUndefined();
		expect(mapped.recommendationReason).toBeUndefined();
	});

	test("never recommends an option on a multiselect question", () => {
		const [mapped] = mapAskQuestionsToAdaptive([
			{
				id: "surfaces",
				question: "Permukaan mana?",
				type: "multiselect",
				options: [
					{ id: "surfaces-opt1", label: "Kartu" },
					{ id: "surfaces-opt2", label: "Detail" },
				],
				recommended: 0,
				recommendationReason: "Ada.",
			},
		]);
		expect(mapped.options.some((o) => o.recommended)).toBe(false);
		expect(mapped.recommendedOptionId).toBeUndefined();
	});
});

describe("runConfirmGenerate", () => {
	test("never generates the feature when the handoff did not save", async () => {
		const generateFeature = vi.fn(async () => ({ status: 200 }));
		const reloadFeatureTree = vi.fn(async () => ({ ok: true }));
		const outcome = await runConfirmGenerate({
			saveHandoff: async () => false,
			generateFeature,
			reloadFeatureTree,
		});
		expect(outcome).toEqual({ kind: "handoff_failed" });
		expect(generateFeature).not.toHaveBeenCalled();
		expect(reloadFeatureTree).not.toHaveBeenCalled();
	});

	test("does not advance on a 200 unless the tree is actually persisted", async () => {
		const outcome = await runConfirmGenerate({
			saveHandoff: async () => true,
			generateFeature: async () => ({ status: 200 }),
			reloadFeatureTree: async () => null,
		});
		expect(outcome).toEqual({ kind: "not_persisted" });
	});

	test("reports the concurrent-generation 409 without advancing", async () => {
		const reloadFeatureTree = vi.fn(async () => ({ ok: true }));
		const outcome = await runConfirmGenerate({
			saveHandoff: async () => true,
			generateFeature: async () => ({ status: 409 }),
			reloadFeatureTree,
		});
		expect(outcome).toEqual({ kind: "generating" });
		expect(reloadFeatureTree).not.toHaveBeenCalled();
	});

	test("reports a transport failure (status 0) as a spec failure", async () => {
		const outcome = await runConfirmGenerate({
			saveHandoff: async () => true,
			generateFeature: async () => ({ status: 0 }),
			reloadFeatureTree: async () => ({ ok: true }),
		});
		expect(outcome).toEqual({ kind: "spec_failed" });
	});

	test("succeeds only when generation persisted and the tree reloads", async () => {
		const outcome = await runConfirmGenerate({
			saveHandoff: async () => true,
			generateFeature: async () => ({ status: 200 }),
			reloadFeatureTree: async () => ({ features: [] }),
		});
		expect(outcome).toEqual({ kind: "success" });
	});
});

describe("ask handoff round-trip", () => {
	const questions = mapAskQuestionsToAdaptive([
		{
			id: "store",
			question: "Simpan di mana?",
			type: "select",
			options: [
				{ id: "store-opt1", label: "Lokal" },
				{ id: "store-opt2", label: "Server" },
			],
			recommended: 0,
			recommendationReason: "Repo memakai penyimpanan lokal.",
		},
		{
			id: "surfaces",
			question: "Permukaan mana?",
			type: "multiselect",
			options: [
				{ id: "surfaces-opt1", label: "Kartu" },
				{ id: "surfaces-opt2", label: "Detail" },
			],
		},
		{ id: "notes", question: "Catatan?", type: "text" },
	]);

	test("serializes question type, options, and recommendation", () => {
		const serialized = serializeAskQuestions(questions);
		expect(serialized[0]).toMatchObject({
			type: "select",
			options: [{ label: "Lokal" }, { label: "Server" }],
			recommended: 0,
			recommendationReason: "Repo memakai penyimpanan lokal.",
		});
		expect(serialized[1]).toMatchObject({
			type: "multiselect",
			options: [{ label: "Kartu" }, { label: "Detail" }],
		});
		expect(serialized[2]).toMatchObject({ type: "text" });
		expect(serialized[2]).not.toHaveProperty("options");
	});

	test("restores question semantics and answers across a refresh", () => {
		const serialized = serializeAskQuestions(questions);
		const restored = restoreAskState(serialized, [
			{ question: "Simpan di mana?", answer: "Lokal" },
			{ question: "Permukaan mana?", answer: "Kartu, Detail" },
		]);
		expect(restored.questions.map((q) => q.type)).toEqual([
			"select",
			"multiselect",
			"text",
		]);
		expect(restored.answers).toEqual({
			store: "Lokal",
			surfaces: "Kartu, Detail",
		});
	});

	test("keeps every option's description across a serialize/restore cycle", () => {
		const rich = mapAskQuestionsToAdaptive([
			{
				id: "search",
				question: "Informasi apa yang dicari?",
				type: "select",
				options: [
					{
						id: "search-opt1",
						label: "Judul dan deskripsi",
						description: "Pencarian mencakup nama dan ringkasan.",
					},
					{
						id: "search-opt2",
						label: "Judul saja",
						description: "Hanya nama proyek yang dicocokkan.",
					},
				],
				recommended: 1,
				recommendationReason: "Analisis menunjukkan pencarian judul.",
			},
			{ id: "notes", question: "Catatan?", type: "text" },
		]);
		const restored = restoreAskState(serializeAskQuestions(rich), []);
		expect(restored.questions[0].options.map((o) => o.description)).toEqual([
			"Pencarian mencakup nama dan ringkasan.",
			"Hanya nama proyek yang dicocokkan.",
		]);
		expect(restored.questions[0].recommendedOptionId).toBe("search-opt2");
	});

	test("restores legacy string options without inventing a description", () => {
		const restored = restoreAskState(
			[
				{
					id: "store",
					question: "Simpan di mana?",
					type: "select",
					options: ["Lokal", "Server"],
					recommended: 1,
					recommendationReason: "Repo memakai penyimpanan server.",
				},
			],
			[{ question: "Simpan di mana?", answer: "Server" }],
		);
		expect(restored.questions[0].options).toEqual([
			{ id: "store-opt1", label: "Lokal", recommended: false },
			{ id: "store-opt2", label: "Server", recommended: true },
		]);
		expect(restored.questions[0].options[1]).not.toHaveProperty("description");
		expect(restored.questions[0].recommendedOptionId).toBe("store-opt2");
		expect(restored.answers).toEqual({ store: "Server" });
	});

	test("a reordered display array cannot move the saved answer or the recommendation", () => {
		const serialized = serializeAskQuestions(questions);
		// FIX 02 renders the recommendation first by sorting a COPY. Restoring from
		// the canonical order must still resolve the same option labels.
		const first = restoreAskState(serialized, [
			{ question: "Simpan di mana?", answer: "Lokal" },
		]);
		const shuffled = restoreAskState(
			[
				{
					...serialized[0],
					options: [...(serialized[0].options ?? [])].reverse(),
					recommended: 1,
				},
			],
			[{ question: "Simpan di mana?", answer: "Lokal" }],
		);
		expect(first.answers.store).toBe("Lokal");
		expect(shuffled.answers.store).toBe("Lokal");
		expect(shuffled.questions[0].recommendedOptionId).toBe("store-opt2");
	});

	test("a defensive parse keeps valid entries and drops malformed ones", () => {
		const parsed = parseRestoredQuestions([
			{ id: "ok", question: "Q?", type: "text" },
			{ id: "bad", question: "Q?", type: "slider" },
			{ nope: true },
		]);
		expect(parsed).toEqual([{ id: "ok", question: "Q?", type: "text" }]);
		expect(
			parseRestoredAnswers([
				{ question: "Q?", answer: "A" },
				{ question: "", answer: "A" },
			]),
		).toEqual([{ question: "Q?", answer: "A" }]);
	});

	test("parseRestoredQuestions accepts both stored option forms and drops junk", () => {
		const parsed = parseRestoredQuestions([
			{
				id: "mixed",
				question: "Q?",
				type: "select",
				options: [
					"teks lama",
					{ label: "Judul", description: "Deskripsi." },
					{ label: "   " },
					42,
					{ description: "tanpa judul" },
				],
			},
		]);
		expect(parsed[0].options).toEqual([
			{ label: "teks lama" },
			{ label: "Judul", description: "Deskripsi." },
		]);
	});
});
