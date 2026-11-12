// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceHandoffPersistence } from "../hooks/use-workspace-handoff-persistence";
import type { AdaptiveQuestion } from "../services/chat-flow";

/**
 * Regression: background generation legitimately rewrites the handoff row, so a
 * client that still holds the pre-generation version must not lose the user's
 * answer. The save adopts the server's reported version and retries once.
 */

const questions: AdaptiveQuestion[] = [
	{
		id: "q1",
		title: "Apa arsitektur data?",
		type: "select",
		options: [
			{ id: "q1-opt1", label: "Relasional", recommended: true },
			{ id: "q1-opt2", label: "Dokumen" },
		],
	},
];

const answers = { q1: "Relasional" };

interface SaveBody {
	action?: string;
	handoff?: { expectedUpdatedAt?: string };
}

type SaveOutcome = { ok: boolean; error?: string; code?: string; status?: number };

function setup(options: { saveResponse: (attempt: number) => Response }) {
	const saveBodies: SaveBody[] = [];
	let saveAttempt = 0;
	let restoreCalls = 0;
	vi.stubGlobal(
		"fetch",
		vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			const body = init?.body
				? (JSON.parse(String(init.body)) as SaveBody)
				: {};
			if (body.action === "get-handoff") {
				restoreCalls += 1;
				return Response.json({
					handoff: {
						projectId: "proj-1",
						updatedAt: "2026-01-01T00:00:00.000Z",
						answers: [],
						state: {
							prompt: "Fitur baru",
							platform: "web",
							session: 1,
							questions: [],
						},
					},
				});
			}
			saveBodies.push(body);
			saveAttempt += 1;
			return options.saveResponse(saveAttempt);
		}),
	);
	const hook = renderHook(() =>
		useWorkspaceHandoffPersistence({
			effectiveFeatureId: "proj-1",
			readOnly: false,
			chatAnswers: answers,
			aiQuestions: questions,
			lastFeaturePrompt: "Fitur baru",
			setAiQuestions: vi.fn(),
			setChatAnswers: vi.fn(),
			setLastFeaturePrompt: vi.fn(),
			requestEpochRef: { current: 1 },
			activeProjectRef: { current: "proj-1" },
		}),
	);
	return {
		hook,
		saveBodies,
		saveAttempts: () => saveAttempt,
		/** Resolves once the restore read landed and its state writes flushed. */
		waitForRestore: async () => {
			await waitFor(() => expect(restoreCalls).toBe(1));
			await act(async () => {});
		},
		save: async (): Promise<SaveOutcome> => {
			let outcome: SaveOutcome | null = null;
			await act(async () => {
				outcome = await hook.result.current.saveAnswers(answers, questions);
			});
			if (!outcome) throw new Error("saveAnswers did not resolve");
			return outcome;
		},
	};
}

beforeEach(() => {
	vi.restoreAllMocks();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("handoff save version recovery", () => {
	it("adopts the server version and retries once when the baseline is stale", async () => {
		const { hook, saveBodies, saveAttempts, waitForRestore, save } = setup({
			saveResponse: (attempt) =>
				attempt === 1
					? Response.json(
							{
								error: "stale",
								code: "HANDOFF_STALE",
								updatedAt: "2026-01-02T00:00:00.000Z",
							},
							{ status: 409 },
						)
					: Response.json({
							saved: true,
							updatedAt: "2026-01-03T00:00:00.000Z",
						}),
		});
		await waitForRestore();

		const outcome = await save();

		expect(outcome.ok).toBe(true);
		expect(saveAttempts()).toBe(2);
		expect(saveBodies[0]?.handoff?.expectedUpdatedAt).toBe(
			"2026-01-01T00:00:00.000Z",
		);
		expect(saveBodies[1]?.handoff?.expectedUpdatedAt).toBe(
			"2026-01-02T00:00:00.000Z",
		);
		expect(hook.result.current.saveStatus).toBe("saved");
	});

	it("surfaces the error without retrying when the handoff is genuinely locked", async () => {
		const { hook, saveAttempts, waitForRestore, save } = setup({
			saveResponse: () =>
				Response.json(
					{ error: "Klarifikasi sudah dikunci.", code: "HANDOFF_LOCKED" },
					{ status: 409 },
				),
		});
		await waitForRestore();

		const outcome = await save();

		expect(outcome.ok).toBe(false);
		expect(saveAttempts()).toBe(1);
		expect(hook.result.current.saveStatus).toBe("error");
		expect(hook.result.current.saveError).toContain("Klarifikasi sudah dikunci.");
	});
});
