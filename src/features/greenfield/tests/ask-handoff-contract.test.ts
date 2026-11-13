import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

const mocks = vi.hoisted(() => ({
	select: vi.fn(),
	save: vi.fn(),
	snapshot: vi.fn(),
}));
vi.mock("@/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/features/codebase/services/generation-context", () => ({
	saveAskHandoff: mocks.save,
	resolveActiveSnapshotId: mocks.snapshot,
}));

import {
	orderOptionsForDisplay,
	parseRestoredQuestions,
	restoreAskState,
} from "@/features/codebase/services/chat-flow-questions";
import {
	askHandoffSchema,
	sanitizeAskHandoff,
} from "@/features/codebase/services/generation-context-handoff";
import {
	mapAskQuestionsForHandoff,
	persistAskHandoffAndStep,
} from "../services/ask-options-helpers.server";
import { validateAskQuestions } from "../services/ask-service";

const legacy = [
	{
		id: "scope",
		question: "Scope?",
		type: "select",
		options: ["Title", "Summary"],
		recommended: 1,
		recommendationReason: "Indexed summary.",
	},
	{
		id: "filters",
		question: "Filters?",
		type: "multiselect",
		options: ["Category", "Tag"],
	},
	{ id: "notes", question: "Notes?", type: "text" },
];
const params = () => ({
	userId: "owner",
	projectId: "project",
	projectMode: "existing_codebase",
	prompt: "Add search",
	platform: "web",
	questions: validateAskQuestions(legacy) ?? [],
});

beforeEach(() => {
	vi.clearAllMocks();
	mocks.save.mockResolvedValue(undefined);
	mocks.snapshot.mockResolvedValue("snapshot");
	mocks.select.mockImplementation(() => {
		const chain = {
			from: () => chain,
			where: () => chain,
			limit: async () => [],
		};
		return chain;
	});
});

describe("generation to persisted handoff contract", () => {
	it("normalizes legacy strings before mapping instead of accessing an absent label", () => {
		const mapped = mapAskQuestionsForHandoff(legacy);
		expect(mapped[0].options).toEqual([
			{ label: "Title" },
			{ label: "Summary" },
		]);
		expect(mapped[0].recommended).toBe(1);
		expect(
			askHandoffSchema.safeParse({
				projectId: "project",
				state: { prompt: "Search", questions: mapped },
			}).success,
		).toBe(true);
	});

	it.each([
		undefined,
		null,
		4,
		"",
		" ",
	])("rejects invalid label %s with a structured validation error", (label) => {
		const input = [{ ...legacy[0], options: [{ label }] }, ...legacy.slice(1)];
		expect(() => mapAskQuestionsForHandoff(input)).toThrowError(ZodError);
	});

	it("rejects a mixed malformed set without partially persisting it", () => {
		expect(() =>
			mapAskQuestionsForHandoff([
				{ ...legacy[0], options: ["Title", null] },
				...legacy.slice(1),
			]),
		).toThrowError(ZodError);
	});

	it("preserves the entire accepted question and all twelve options through sanitization", () => {
		const input = legacy.map((q) =>
			q.id === "scope"
				? {
						...q,
						question: "Q".repeat(2000),
						options: Array.from({ length: 12 }, (_, i) => ({
							label: `Option ${i}`,
							description: "D".repeat(400),
						})),
						recommended: 11,
					}
				: q,
		);
		const canonical = validateAskQuestions(input);
		expect(canonical?.[0].options?.[11].id).toBe("scope-opt12");
		const clean = sanitizeAskHandoff(
			askHandoffSchema.parse({
				projectId: "project",
				state: {
					prompt: "Search",
					questions: mapAskQuestionsForHandoff(input),
				},
			}),
		);
		expect(validateAskQuestions(clean.state?.questions)).toEqual(canonical);
	});

	it("keeps the maximum escaped rich generation restorable instead of erasing questions", () => {
		const input = Array.from({ length: 10 }, (_, i) => ({
			id: `q${i}`,
			question: "\\".repeat(2000),
			type: "select",
			options: Array.from({ length: 12 }, (_, j) => ({
				label: `${j.toString().padStart(2, "0")}${"\\".repeat(98)}`,
				description: "\u0001".repeat(400),
			})),
		}));
		const canonical = validateAskQuestions(input);
		const clean = sanitizeAskHandoff(
			askHandoffSchema.parse({
				projectId: "project",
				state: {
					prompt: "Search",
					questions: mapAskQuestionsForHandoff(input),
				},
			}),
		);
		expect(validateAskQuestions(clean.state?.questions)).toEqual(canonical);
	});

	it("rejects an oversized persisted state rather than saving empty question evidence", () => {
		const questions = Array.from({ length: 24 }, (_, index) => ({
			id: `q${index}`,
			question: "\u0001".repeat(2000),
			type: "select" as const,
			options: Array.from({ length: 12 }, (_, option) => ({
				label: `${option}${"\u0001".repeat(98)}`,
				description: "\u0002".repeat(400),
			})),
		}));
		expect(() =>
			sanitizeAskHandoff({
				projectId: "project",
				answers: [],
				state: { prompt: "Search", questions },
			}),
		).toThrowError(
			expect.objectContaining({ code: "HANDOFF_VALIDATION_FAILED" }),
		);
	});

	it("restores legacy answers, custom values, types and recommendation identity after display sorting", () => {
		const restored = restoreAskState(parseRestoredQuestions(legacy), [
			{ question: "Scope?", answer: "Summary" },
			{ question: "Filters?", answer: "Category, Tag", questionId: "filters" },
			{ question: "Notes?", answer: "Custom answer", questionId: "notes" },
		]);
		const displayed = orderOptionsForDisplay(
			restored.questions[0].options,
			restored.questions[0].recommendedOptionId,
		);
		expect(displayed[0]).toMatchObject({ id: "scope-opt2", label: "Summary" });
		expect(restored.questions[0].options[0].id).toBe("scope-opt1");
		expect(restored.questions.map((q) => q.type)).toEqual([
			"select",
			"multiselect",
			"text",
		]);
		expect(restored.answers).toEqual({
			scope: "Summary",
			filters: "Category, Tag",
			notes: "Custom answer",
		});
	});

	it("does not shift a legacy recommendation onto a different surviving option", () => {
		const restored = restoreAskState(
			parseRestoredQuestions([
				{ ...legacy[0], options: [null, "Title", "Summary"], recommended: 1 },
			]),
			[],
		);
		expect(restored.questions[0].recommendedOptionId).toBe("scope-opt1");
		expect(restored.questions[0].options[0].label).toBe("Title");
	});
});

describe("initial handoff persistence", () => {
	it("awaits a successful save before resolving", async () => {
		await persistAskHandoffAndStep(params());
		const saved = mocks.save.mock.calls[0][1];
		expect(askHandoffSchema.safeParse(saved).success).toBe(true);
		expect(validateAskQuestions(saved.state.questions)).toEqual(
			params().questions,
		);
	});

	it("propagates save failure and does not advance the project", async () => {
		mocks.save.mockRejectedValueOnce(new Error("Storage unavailable"));
		await expect(persistAskHandoffAndStep(params())).rejects.toMatchObject({
			code: "PERSISTENCE_FAILED",
		});
		expect(mocks.select).not.toHaveBeenCalled();
	});

	it("propagates the lease fence without writing any handoff", async () => {
		const error = Object.assign(new Error("Lease expired"), {
			code: "LEASE_EXPIRED",
		});
		await expect(
			persistAskHandoffAndStep({
				...params(),
				beforePersist: () => {
					throw error;
				},
			}),
		).rejects.toBe(error);
		expect(mocks.save).not.toHaveBeenCalled();
	});

	it("does not force direct Greenfield generation to save a codebase handoff", async () => {
		await persistAskHandoffAndStep({ ...params(), projectMode: "greenfield" });
		expect(mocks.save).not.toHaveBeenCalled();
	});
});
