import { describe, expect, test, vi } from "vitest";
import {
	areAllQuestionsAnswered,
	buildFeatureMessage,
	mapAskQuestionsToAdaptive,
	nextQuestionIndex,
	runConfirmGenerate,
} from "./codebase-chat-flow";

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
				options: ["Lokal", "Server"],
			},
			{ id: "name", question: "Nama fitur?", type: "text" },
			{
				id: "surfaces",
				question: "Permukaan mana?",
				type: "multiselect",
				options: ["Kartu", "Detail"],
			},
		]);
		expect(mapped.map((q) => q.type)).toEqual([
			"select",
			"text",
			"multiselect",
		]);
	});

	test("only marks the explicitly recommended option, never the first", () => {
		const [mapped] = mapAskQuestionsToAdaptive([
			{
				id: "store",
				question: "Simpan di mana?",
				type: "select",
				options: ["Lokal", "Server"],
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
				options: ["Lokal", "Server"],
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
				options: ["Kartu", "Detail"],
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
