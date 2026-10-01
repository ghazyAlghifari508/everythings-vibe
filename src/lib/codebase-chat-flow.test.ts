import { describe, expect, test } from "vitest";
import {
	areAllQuestionsAnswered,
	buildFeatureMessage,
	nextQuestionIndex,
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
