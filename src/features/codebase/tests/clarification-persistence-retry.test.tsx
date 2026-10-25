// @vitest-environment jsdom
import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodebaseChatWorkspace } from "../components/chat/codebase-chat-workspace";
import { useWorkspaceFeatureGeneration } from "../hooks/use-workspace-feature-generation";
import { useWorkspaceQuestions } from "../hooks/use-workspace-questions";
import {
	type AdaptiveQuestion,
	mapAskQuestionsToAdaptive,
	restoreAskState,
	runConfirmGenerate,
	serializeAskQuestions,
} from "../services/chat-flow";
import { describeHandoffSaveFailure } from "../utils/workspace-contracts";

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
		title: "Catatan arsitektur tambahan?",
		type: "text",
		options: [],
	},
];

const sampleAnswers: Record<string, string> = {
	q1: "Relasional",
	q2: "Connection pooling aktif",
};

beforeEach(() => {
	vi.restoreAllMocks();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("Clarification Stage-Aware Retry & Error Contract", () => {
	it("7. Error lama hilang setelah retry dimulai", async () => {
		let callCount = 0;
		const activeProjectIdRef = { current: "proj-1" };
		const setRun = vi.fn();

		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				callCount += 1;
				if (callCount === 1) {
					return new Response(JSON.stringify({ error: "Fail 1" }), {
						status: 500,
					});
				}
				return Response.json({ featureTree: { phases: [] } });
			}),
		);

		const { result } = renderHook(() =>
			useWorkspaceFeatureGeneration({
				effectiveFeatureId: "proj-1",
				activeProjectIdRef,
				chatAnswers: sampleAnswers,
				aiQuestions: sampleQuestions,
				lastFeaturePrompt: "Fitur baru",
				featureName: "Fitur Baru",
				codebaseName: "Repo",
				refreshFeatureTree: vi.fn(async () =>
					callCount > 1 ? ({ phases: [] } as unknown as null) : null,
				),
				pushAssistantMessage: vi.fn(),
				openArtifactPreview: vi.fn(),
				setPipelineStage: vi.fn(),
				setStageError: vi.fn(),
				setRun,
			}),
		);

		await act(async () => {
			await result.current.handleConfirmGenerate();
		});
		expect(result.current.specError).toBeTruthy();

		await act(async () => {
			await result.current.handleConfirmGenerate();
		});

		expect(result.current.specError).toBeNull();
		const runningRunCalls = setRun.mock.calls.filter(
			(call) => typeof call[0] === "object" && call[0]?.status === "running",
		);
		expect(runningRunCalls.length).toBeGreaterThanOrEqual(2);
		expect(runningRunCalls[1][0].error).toBeNull();
	});

	it("8. Tombol generate biasa tidak muncul bersamaan dengan retry aktif", () => {
		render(
			<CodebaseChatWorkspace
				featureName="Demo"
				messages={[]}
				questions={sampleQuestions}
				answers={sampleAnswers}
				stage="questions"
				specError="Spesifikasi fitur gagal dibuat. Coba lagi."
				onRetryGenerate={vi.fn()}
				onConfirmGenerate={vi.fn()}
			/>,
		);

		// Single primary action: retry alert is visible, normal complete button is hidden
		expect(screen.getByTestId("codebase-spec-error")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Coba lagi" })).toBeTruthy();
		expect(screen.queryByTestId("codebase-questions-complete")).toBeNull();
		expect(
			screen.queryByRole("button", { name: "Buat Spesifikasi Fitur" }),
		).toBeNull();
	});

	it("9. HTTP 400/401/404/409/429/500 dipetakan dengan benar", () => {
		expect(
			describeHandoffSaveFailure(400, "HANDOFF_VALIDATION_FAILED"),
		).toContain("Jawaban tidak valid");
		expect(describeHandoffSaveFailure(401, "SESSION_EXPIRED")).toContain(
			"Sesi Anda telah berakhir",
		);
		expect(describeHandoffSaveFailure(404, "PROJECT_NOT_FOUND")).toContain(
			"tidak ditemukan",
		);
		expect(describeHandoffSaveFailure(409, "HANDOFF_LOCKED")).toContain(
			"dikunci",
		);
		expect(describeHandoffSaveFailure(429, "RATE_LIMITED")).toContain(
			"Terlalu banyak permintaan",
		);
		expect(describeHandoffSaveFailure(500, "PERSISTENCE_FAILED")).toContain(
			"Jawaban gagal disimpan",
		);
		expect(describeHandoffSaveFailure(0, "NETWORK_UNAVAILABLE")).toContain(
			"Jaringan terputus",
		);
	});

	it("10. Delayed responses tidak menimpa data project berbeda", async () => {
		let finishProjA: (res: Response) => void = () => {};
		const delayedProjA = new Promise<Response>((resolve) => {
			finishProjA = resolve;
		});

		vi.stubGlobal(
			"fetch",
			vi.fn((_url: string, init?: RequestInit) => {
				const body = init?.body ? JSON.parse(String(init.body)) : {};
				if (body.action === "get-handoff" && body.projectId === "proj-A") {
					return delayedProjA;
				}
				return Promise.resolve(Response.json({}));
			}),
		);

		const { result, rerender } = renderHook(
			({ id }: { id: string | null }) => useWorkspaceQuestions(id, vi.fn()),
			{ initialProps: { id: "proj-A" as string | null } },
		);

		rerender({ id: "proj-B" });

		await act(async () => {
			finishProjA(
				Response.json({
					handoff: {
						answers: [
							{
								question: "Apa arsitektur data?",
								answer: "Wrong Project A Data",
							},
						],
						state: {
							questions: [
								{
									id: "q1",
									question: "Apa arsitektur data?",
									type: "select",
								},
							],
						},
					},
				}),
			);
		});

		expect(result.current.chatAnswers).toEqual({});
	});

	it("11. Double click tidak menghasilkan duplicate requests", async () => {
		let generateCalls = 0;
		let releaseGenerate: () => void = () => {};
		const inFlight = new Promise<Response>((resolve) => {
			releaseGenerate = () =>
				resolve(Response.json({ featureTree: { phases: [] } }));
		});

		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				if (url.includes("features/generate")) {
					generateCalls += 1;
					return inFlight;
				}
				return Response.json({ saved: true });
			}),
		);

		const activeProjectIdRef = { current: "proj-1" };
		const { result } = renderHook(() =>
			useWorkspaceFeatureGeneration({
				effectiveFeatureId: "proj-1",
				activeProjectIdRef,
				chatAnswers: sampleAnswers,
				aiQuestions: sampleQuestions,
				lastFeaturePrompt: "Fitur baru",
				featureName: "Fitur Baru",
				codebaseName: "Repo",
				refreshFeatureTree: vi.fn(async () =>
					generateCalls > 0 ? ({ phases: [] } as unknown as null) : null,
				),
				pushAssistantMessage: vi.fn(),
				openArtifactPreview: vi.fn(),
				setPipelineStage: vi.fn(),
				setStageError: vi.fn(),
				setRun: vi.fn(),
			}),
		);

		act(() => {
			void result.current.handleConfirmGenerate();
			void result.current.handleConfirmGenerate();
		});

		await act(async () => {
			releaseGenerate();
		});

		expect(generateCalls).toBe(1);
	});

	it("12. Server berhasil menyimpan tetapi respons hilang -> retry melakukan reconciliation", async () => {
		const generateMock = vi.fn(async () => ({ status: 504 }));
		const reloadFeatureTree = vi.fn(async () => ({
			phases: [{ name: "Existing Phase" }],
		}));

		const outcome = await runConfirmGenerate({
			checkExistingFeatureTree: reloadFeatureTree,
			saveHandoff: async () => true,
			generateFeature: generateMock,
			reloadFeatureTree,
		});

		expect(outcome).toEqual({ kind: "success" });
		expect(generateMock).not.toHaveBeenCalled();
	});

	it("13. Existing greenfield Ask flow tidak mengalami regresi", () => {
		const greenfieldRawQuestions = [
			{
				id: "gf1",
				question: "Tujuan aplikasi?",
				type: "select" as const,
				options: ["Bisnis", "Personal"],
				recommended: 0,
			},
		];
		const mapped = mapAskQuestionsToAdaptive(greenfieldRawQuestions);
		expect(mapped[0].title).toBe("Tujuan aplikasi?");
		expect(mapped[0].options[0].recommended).toBe(true);

		const serialized = serializeAskQuestions(mapped);
		expect(serialized[0].recommended).toBe(0);

		const restored = restoreAskState(serialized, [
			{ question: "Tujuan aplikasi?", answer: "Bisnis" },
		]);
		expect(restored.answers.gf1).toBe("Bisnis");
	});
});
