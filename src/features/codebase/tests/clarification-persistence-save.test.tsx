// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceFeatureGeneration } from "../hooks/use-workspace-feature-generation";
import { useWorkspaceQuestions } from "../hooks/use-workspace-questions";
import {
	type AdaptiveQuestion,
	type CodebaseRunState,
	restoreAskState,
	serializeAskQuestions,
} from "../services/chat-flow";
import { buildAskHandoffAnswers } from "../utils/workspace-contracts";

const sampleQuestions: AdaptiveQuestion[] = [
	{
		id: "q1",
		title: "Apa arsitektur data?",
		type: "select",
		options: [
			{ id: "q1-opt1", label: "Relasional", recommended: true },
			{ id: "q1-opt2", label: "Dokumen" },
		],
	},
	{
		id: "q2",
		title: "Metode autentikasi?",
		type: "select",
		options: [
			{ id: "q2-opt1", label: "Session Cookie" },
			{ id: "q2-opt2", label: "JWT Bearer" },
		],
	},
	{
		id: "q3",
		title: "Framework styling?",
		type: "select",
		options: [
			{ id: "q3-opt1", label: "Tailwind CSS" },
			{ id: "q3-opt2", label: "CSS Modules" },
		],
	},
	{
		id: "q4",
		title: "Permukaan yang terpengaruh?",
		type: "multiselect",
		options: [
			{ id: "q4-opt1", label: "Dashboard" },
			{ id: "q4-opt2", label: "Mobile View" },
		],
	},
	{
		id: "q5",
		title: "Catatan arsitektur tambahan?",
		type: "text",
		options: [],
	},
];

const fiveAnswers: Record<string, string> = {
	q1: "Relasional",
	q2: "JWT Bearer",
	q3: "Tailwind CSS",
	q4: "Dashboard, Mobile View",
	q5: "Gunakan connection pool",
};

beforeEach(() => {
	vi.restoreAllMocks();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("Clarification Persistence & Answer Safety", () => {
	it("1. Save jawaban gagal -> lima jawaban tetap utuh", async () => {
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			const body = init?.body ? JSON.parse(String(init.body)) : {};
			if (body.action === "save-handoff") {
				return new Response(
					JSON.stringify({
						error: "Database unavailable",
						code: "PERSISTENCE_FAILED",
					}),
					{ status: 500, headers: { "Content-Type": "application/json" } },
				);
			}
			return Response.json({});
		});
		vi.stubGlobal("fetch", fetchMock);

		let runState: CodebaseRunState | null = null;
		const setRun = (fn: unknown) => {
			runState =
				typeof fn === "function"
					? (fn as (c: CodebaseRunState | null) => CodebaseRunState | null)(
							runState,
						)
					: (fn as CodebaseRunState | null);
		};

		const { result } = renderHook(() =>
			useWorkspaceQuestions("proj-1", setRun),
		);

		act(() => {
			result.current.setAiQuestions(sampleQuestions);
			for (const [id, ans] of Object.entries(fiveAnswers)) {
				result.current.handleSubmitAnswer(id, ans);
			}
		});

		expect(Object.keys(result.current.chatAnswers)).toHaveLength(5);
		expect(result.current.chatAnswers).toEqual(fiveAnswers);

		await act(async () => {
			const outcome = await result.current.saveAnswers();
			expect(outcome.ok).toBe(false);
			expect(outcome.code).toBe("PERSISTENCE_FAILED");
		});

		// Answers in state must NEVER be wiped on save failure
		expect(result.current.chatAnswers).toEqual(fiveAnswers);
		expect(result.current.saveStatus).toBe("error");
		expect(result.current.saveError).toContain("Jawaban gagal disimpan");
	});

	it("2. Retry save tidak memanggil question generation", async () => {
		const fetchCalls: string[] = [];
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			const body = init?.body ? JSON.parse(String(init.body)) : {};
			fetchCalls.push(body.action ?? "generate_questions");
			if (body.action === "save-handoff") return Response.json({ saved: true });
			return Response.json({});
		});
		vi.stubGlobal("fetch", fetchMock);

		const { result } = renderHook(() =>
			useWorkspaceQuestions("proj-1", vi.fn()),
		);
		act(() => {
			result.current.setAiQuestions(sampleQuestions);
			result.current.setChatAnswers(fiveAnswers);
		});

		await act(async () => {
			const res = await result.current.saveAnswers();
			expect(res.ok).toBe(true);
		});

		expect(fetchCalls).not.toContain("generate_questions");
		expect(fetchCalls.filter((c) => c === "save-handoff")).toHaveLength(1);
		expect(result.current.chatAnswers).toEqual(fiveAnswers);
	});

	it("3. Retry Feature tidak membuat pertanyaan baru", async () => {
		const fetchCalls: string[] = [];
		let generateAttempt = 0;
		const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
			const body = init?.body ? JSON.parse(String(init.body)) : {};
			fetchCalls.push(
				body.action ??
					(url.includes("/api/codebase/generation")
						? "generate_feature"
						: "unknown"),
			);
			if (body.action === "save-handoff") return Response.json({ saved: true });
			if (url.includes("/api/codebase/generation")) {
				generateAttempt += 1;
				if (generateAttempt === 1) {
					return new Response(
						JSON.stringify({
							error: "Feature generation failed",
							code: "MODEL_TIMEOUT",
						}),
						{ status: 504, headers: { "Content-Type": "application/json" } },
					);
				}
				return Response.json({
					operation: {
						id: "op-1",
						projectId: "proj-1",
						stage: "feature",
						status: "completed",
						result: { featureTree: { phases: [] } },
						error: null,
						errorCode: null,
						artifactId: "art-1",
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
						startedAt: new Date().toISOString(),
						finishedAt: new Date().toISOString(),
					},
				});
			}
			return Response.json({});
		});
		vi.stubGlobal("fetch", fetchMock);

		const activeProjectIdRef = { current: "proj-1" };
		const refreshFeatureTree = vi.fn(async () =>
			generateAttempt > 1 ? ({ phases: [] } as unknown as object) : null,
		);

		const { result } = renderHook(() =>
			useWorkspaceFeatureGeneration({
				effectiveFeatureId: "proj-1",
				activeProjectIdRef,
				chatAnswers: fiveAnswers,
				aiQuestions: sampleQuestions,
				lastFeaturePrompt: "Fitur baru",
				featureName: "Fitur Baru",
				codebaseName: "Repo",
				refreshFeatureTree: refreshFeatureTree as unknown as (
					id: string | null,
				) => Promise<null>,
				pushAssistantMessage: vi.fn(),
				openArtifactPreview: vi.fn(),
				setPipelineStage: vi.fn(),
				setStageError: vi.fn(),
				setRun: vi.fn(),
			}),
		);

		await act(async () => {
			await result.current.handleConfirmGenerate();
		});
		expect(result.current.specError).toBeTruthy();

		await act(async () => {
			await result.current.handleConfirmGenerate();
		});

		expect(fetchCalls).not.toContain("generate_questions");
		expect(fetchCalls.filter((c) => c === "generate_feature")).toHaveLength(2);
	});

	it("4. Successful save dapat direstore dari persisted storage", () => {
		const serializedQuestions = serializeAskQuestions(sampleQuestions);
		const handoffAnswers = buildAskHandoffAnswers(fiveAnswers, sampleQuestions);

		const restored = restoreAskState(serializedQuestions, handoffAnswers);

		expect(restored.questions).toHaveLength(5);
		expect(restored.questions.map((q) => q.id)).toEqual([
			"q1",
			"q2",
			"q3",
			"q4",
			"q5",
		]);
		expect(restored.answers).toEqual(fiveAnswers);
	});

	it("5. Jawaban 'Lainnya' tetap tersimpan", () => {
		const questionsWithCustom: AdaptiveQuestion[] = [
			{
				id: "q_custom",
				title: "Pilih platform?",
				type: "select",
				options: [
					{ id: "q_custom-opt1", label: "AWS" },
					{ id: "q_custom-opt2", label: "GCP" },
				],
			},
			{
				id: "q_multi_custom",
				title: "Modul yang dipakai?",
				type: "multiselect",
				options: [
					{ id: "q_multi_custom-opt1", label: "Auth" },
					{ id: "q_multi_custom-opt2", label: "Billing" },
				],
			},
		];

		const customAnswers = {
			q_custom: "On-Premise Private Cloud",
			q_multi_custom: "Auth, Billing, Custom Analytics Engine",
		};

		const serialized = serializeAskQuestions(questionsWithCustom);
		const answersList = buildAskHandoffAnswers(
			customAnswers,
			questionsWithCustom,
		);

		const restored = restoreAskState(serialized, answersList);
		expect(restored.answers.q_custom).toBe("On-Premise Private Cloud");
		expect(restored.answers.q_multi_custom).toBe(
			"Auth, Billing, Custom Analytics Engine",
		);
	});

	it("6. Retry tidak menghasilkan duplicate projects", async () => {
		let projectCreationCalls = 0;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				if (url.includes("/features") && !url.includes("generate")) {
					projectCreationCalls += 1;
					return Response.json({ projectId: "proj-1" });
				}
				if (url.includes("ask/options")) return Response.json({ saved: true });
				return Response.json({ featureTree: { phases: [] } });
			}),
		);

		const activeProjectIdRef = { current: "proj-1" };
		const { result } = renderHook(() =>
			useWorkspaceFeatureGeneration({
				effectiveFeatureId: "proj-1",
				activeProjectIdRef,
				chatAnswers: fiveAnswers,
				aiQuestions: sampleQuestions,
				lastFeaturePrompt: "Fitur baru",
				featureName: "Fitur Baru",
				codebaseName: "Repo",
				refreshFeatureTree: vi.fn(
					async () => ({ phases: [] }) as unknown as null,
				),
				pushAssistantMessage: vi.fn(),
				openArtifactPreview: vi.fn(),
				setPipelineStage: vi.fn(),
				setStageError: vi.fn(),
				setRun: vi.fn(),
			}),
		);

		await act(async () => {
			await result.current.handleConfirmGenerate();
		});
		await act(async () => {
			await result.current.handleConfirmGenerate();
		});

		expect(projectCreationCalls).toBe(0);
	});
});
