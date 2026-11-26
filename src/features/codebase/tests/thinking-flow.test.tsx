// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentThinking } from "@/components/ui/agent-thinking";
import {
	attemptStartEpoch,
	type CodebaseRunState,
	isRunWorking,
	operationSettleEpoch,
	queueRun,
	runConfirmGenerate,
	runDurationSeconds,
	settleRun,
	settleRunIfCurrent,
	shouldAutoRevealArtifact,
	startRun,
} from "@/features/codebase/services/chat-flow";
import { consumeSseStream } from "@/lib/sse-consume";
import { CodebaseChatWorkspace } from "../components/chat/codebase-chat-workspace";

/** Copy the rejected interface showed: none of it may reach the user again. */
const TRANSPORT_COPY = [
	"Permintaan diterima server",
	"Model mulai menghasilkan respons",
	"Hasil tersimpan di server",
	"Server sedang bekerja",
	"AI memproses pikiran",
	"Model sedang berpikir mendalam",
	"Sistem sedang melakukan optimalisasi",
];

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("P5 Unified Agent Thinking & Cardless Generation Workflow", () => {
	// 1. Running → Completed
	it("transitions cleanly from Running to Completed with accurate final timer", () => {
		const start = 100_000;
		let runState: CodebaseRunState | null = startRun("questions", start);

		const { rerender } = render(
			<AgentThinking
				status={runState.status}
				thinkingLabel="Menyusun pertanyaan klarifikasi"
				doneLabel="Pertanyaan siap"
				startedAt={runState.startedAt}
				finishedAt={runState.finishedAt}
			/>,
		);

		expect(screen.getByTestId("agent-thinking").textContent).toContain(
			"Menyusun pertanyaan klarifikasi...",
		);

		// Settle run at 108_200 (8.2s elapsed)
		runState = settleRun(runState, "done", 108_200);
		expect(runState?.status).toBe("done");
		expect(runDurationSeconds(runState)).toBe(8.2);

		rerender(
			<AgentThinking
				status={runState?.status}
				thinkingLabel="Menyusun pertanyaan klarifikasi"
				doneLabel="Pertanyaan siap"
				startedAt={runState?.startedAt}
				finishedAt={runState?.finishedAt}
			/>,
		);

		const thinking = screen.getByTestId("agent-thinking");
		expect(thinking.textContent).toContain("Pertanyaan siap");
		expect(screen.getByRole("timer").textContent).toBe("8.2s");
	});

	// 2. Running → Failed
	it("transitions from Running to Failed with error message and retry capability", () => {
		const onRetry = vi.fn();
		const start = 50_000;
		let runState: CodebaseRunState | null = startRun("prd", start);

		const { rerender } = render(
			<AgentThinking
				status={runState.status}
				thinkingLabel="Menyusun PRD"
				failedLabel="Gagal menyusun PRD"
				error={runState.error}
				onRetry={onRetry}
				startedAt={runState.startedAt}
				finishedAt={runState.finishedAt}
			/>,
		);

		expect(screen.getByTestId("agent-thinking").textContent).toContain(
			"Menyusun PRD...",
		);

		runState = settleRun(
			runState,
			"failed",
			53_500,
			"Model timeout saat menyusun PRD",
		);
		expect(runState?.status).toBe("failed");
		expect(runState?.error).toBe("Model timeout saat menyusun PRD");

		rerender(
			<AgentThinking
				status={runState?.status}
				thinkingLabel="Menyusun PRD"
				failedLabel="Gagal menyusun PRD"
				error={runState?.error}
				onRetry={onRetry}
				startedAt={runState?.startedAt}
				finishedAt={runState?.finishedAt}
			/>,
		);

		const thinking = screen.getByTestId("agent-thinking");
		expect(thinking.textContent).toContain("Gagal menyusun PRD");
		expect(screen.getByRole("timer").textContent).toBe("3.5s");
		expect(screen.getByRole("alert").textContent).toContain(
			"Model timeout saat menyusun PRD",
		);

		const retryBtn = screen.getByRole("button", { name: "Coba lagi" });
		act(() => {
			retryBtn.click();
		});
		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	// 3. Finished timer frozen
	it("freezes the timer strictly when finished and never drifts after completion", () => {
		vi.useFakeTimers();
		const startedAt = 10_000;
		const finishedAt = 16_500; // 6.5s

		const runState = settleRun(
			startRun("feature", startedAt),
			"done",
			finishedAt,
		);
		expect(runDurationSeconds(runState)).toBe(6.5);

		render(
			<AgentThinking
				status={runState?.status}
				doneLabel="Spesifikasi fitur siap"
				startedAt={runState?.startedAt}
				finishedAt={runState?.finishedAt}
			/>,
		);

		const timer = screen.getByRole("timer");
		expect(timer.textContent).toBe("6.5s");

		// Advance clock by 30 seconds
		act(() => {
			vi.advanceTimersByTime(30_000);
		});

		// Must remain exactly 6.5s
		expect(timer.textContent).toBe("6.5s");
		vi.useRealTimers();
	});

	// 4. Multiple sequential runs
	it("handles multiple sequential runs with independent start and finish epochs", () => {
		// Run 1: questions
		const run1 = settleRun(startRun("questions", 10_000), "done", 14_000);
		expect(run1?.stage).toBe("questions");
		expect(runDurationSeconds(run1)).toBe(4.0);

		// Run 2: feature
		const run2 = settleRun(startRun("feature", 20_000), "done", 25_500);
		expect(run2?.stage).toBe("feature");
		expect(runDurationSeconds(run2)).toBe(5.5);

		// Run 3: prd
		const run3 = settleRun(startRun("prd", 30_000), "done", 42_000);
		expect(run3?.stage).toBe("prd");
		expect(runDurationSeconds(run3)).toBe(12.0);

		// Run 4: ac
		const run4 = settleRun(startRun("ac", 50_000), "done", 58_200);
		expect(run4?.stage).toBe("ac");
		expect(runDurationSeconds(run4)).toBe(8.2);

		// Run 5: task
		const run5 = settleRun(startRun("task", 70_000), "done", 85_100);
		expect(run5?.stage).toBe("task");
		expect(runDurationSeconds(run5)).toBe(15.1);
	});

	// 5. Stage change
	it("renders cardless conversational CTAs on stage change without large container cards", () => {
		const onConfirmGenerate = vi.fn();
		const { rerender, container } = render(
			<CodebaseChatWorkspace
				featureName="Search"
				messages={[]}
				questions={[{ id: "q1", title: "Q1?", type: "text", options: [] }]}
				answers={{ q1: "Ans" }}
				stage="questions"
				onConfirmGenerate={onConfirmGenerate}
			/>,
		);

		// Questions completed: cardless CTA for feature specification
		const questionsComplete = container.querySelector(
			"[data-testid='codebase-questions-complete']",
		);
		expect(questionsComplete).not.toBeNull();
		expect(questionsComplete?.textContent).toContain("Buat Spesifikasi Fitur");
		expect(questionsComplete?.className).not.toContain("border-graphite");

		// Stage: feature -> offers PRD
		rerender(
			<CodebaseChatWorkspace
				featureName="Search"
				messages={[]}
				questions={[]}
				answers={{}}
				stage="feature"
				artifacts={[
					{
						id: "feature-1",
						fileName: "feature.md",
						fileSizeBytes: 200,
						badge: "FITUR",
						description: "Spesifikasi fitur",
					},
				]}
				onGeneratePrd={vi.fn()}
			/>,
		);

		const prdStage = container.querySelector(
			"[data-testid='codebase-stage-prd']",
		);
		expect(prdStage).not.toBeNull();
		expect(prdStage?.className).not.toContain("bg-obsidian");

		// Stage: prd -> offers AC
		rerender(
			<CodebaseChatWorkspace
				featureName="Search"
				messages={[]}
				questions={[]}
				answers={{}}
				stage="prd"
				artifacts={[
					{
						id: "prd-1",
						fileName: "PRD.md",
						fileSizeBytes: 1000,
						badge: "PRD",
						description: "Dokumen PRD",
					},
				]}
				onGenerateAc={vi.fn()}
			/>,
		);
		const acStage = container.querySelector(
			"[data-testid='codebase-stage-ac']",
		);
		expect(acStage).not.toBeNull();
	});

	// 6. Project switch
	it("resets run state on project switch so durations and status do not leak", () => {
		let currentRun: CodebaseRunState | null = settleRun(
			startRun("prd", 10_000),
			"done",
			18_000,
		);

		const { rerender } = render(
			<CodebaseChatWorkspace
				featureName="Feature A"
				messages={[]}
				questions={[]}
				answers={{}}
				run={currentRun}
			/>,
		);

		expect(screen.getByTestId("codebase-run-thinking").textContent).toContain(
			"PRD siap",
		);

		// Switch to Feature B -> run is reset to null
		currentRun = null;
		rerender(
			<CodebaseChatWorkspace
				featureName="Feature B"
				messages={[]}
				questions={[]}
				answers={{}}
				run={currentRun}
			/>,
		);

		expect(screen.queryByTestId("codebase-run-thinking")).toBeNull();
	});

	// 7. SSE error/abort
	it("correctly handles SSE stream failure and unexpected abort", async () => {
		// Test stream with error event
		const errorStream = new ReadableStream({
			start(controller) {
				const encoder = new TextEncoder();
				controller.enqueue(
					encoder.encode(
						'data: {"type":"error","error":"Model provider unavailable"}\n\n',
					),
				);
				controller.close();
			},
		});

		const errorResponse = new Response(errorStream, {
			headers: { "Content-Type": "text/event-stream" },
		});
		const errorResult = await consumeSseStream(errorResponse);
		expect(errorResult.error).toBe("Model provider unavailable");

		// Test stream ending without done event (truncated/aborted)
		const truncatedStream = new ReadableStream({
			start(controller) {
				const encoder = new TextEncoder();
				controller.enqueue(
					encoder.encode('data: {"type":"thinking","content":"analyzing"}\n\n'),
				);
				controller.close();
			},
		});

		const truncatedResponse = new Response(truncatedStream, {
			headers: { "Content-Type": "text/event-stream" },
		});
		const truncatedResult = await consumeSseStream(truncatedResponse);
		expect(truncatedResult.error).toBe(
			"Generasi terputus sebelum selesai. Coba lagi.",
		);
	});

	// 8. Non-streaming question endpoint
	it("handles non-streaming question generation without fake reasoning", () => {
		const startedAt = 10_000;
		const run = startRun("questions", startedAt);

		// Pure operation status: no chain of thought, no queued-phase guessing.
		expect(run.error).toBeNull();
		expect(isRunWorking(run)).toBe(true);

		// Settles cleanly on response
		const finished = settleRun(run, "done", 15_200);
		expect(finished?.status).toBe("done");
		expect(runDurationSeconds(finished)).toBe(5.2);
	});

	// 9. No fake progress transition
	it("never fabricates a thinking/generating phase the backend does not report", () => {
		const initialRun = startRun("prd", 1000);
		// The run state has no phase, activity or reasoning field to rotate on its
		// own: every render derives from the durable operation's real status.
		expect(Object.keys(initialRun).sort()).toEqual([
			"attempt",
			"error",
			"finishedAt",
			"operationId",
			"requestId",
			"stage",
			"startedAt",
			"status",
		]);

		render(
			<CodebaseChatWorkspace
				featureName="Search"
				messages={[]}
				questions={[]}
				answers={{}}
				run={initialRun}
			/>,
		);

		// One status line, one indicator, no phase line, no reasoning block. The
		// ticking clock is the only thing that changes while the run stays queued.
		const thinking = screen.getByTestId("codebase-run-thinking");
		expect(thinking.textContent).toContain("Menyusun PRD...");
		expect(thinking.querySelectorAll("[data-orb]")).toHaveLength(1);
		expect(thinking.querySelector("pre")).toBeNull();
		expect(screen.queryByRole("button", { name: "Aktivitas" })).toBeNull();
	});

	// 10. No duplicate generation
	it("disables generation buttons while request is in flight to prevent double submit", () => {
		const onConfirmGenerate = vi.fn();
		render(
			<CodebaseChatWorkspace
				featureName="Search"
				messages={[]}
				questions={[{ id: "q1", title: "Q1?", type: "text", options: [] }]}
				answers={{ q1: "Ans" }}
				stage="questions"
				isConfirming={true}
				onConfirmGenerate={onConfirmGenerate}
			/>,
		);

		const button = screen.getByRole("button", {
			name: /Menyusun spesifikasi/i,
		});
		expect(button).toBeDefined();
		expect((button as HTMLButtonElement).disabled).toBe(true);

		act(() => {
			button.click();
		});
		expect(onConfirmGenerate).not.toHaveBeenCalled();
	});

	// 11. Artifact only revealed after persistence
	it("enforces artifact reveal only after persistence is verified on the server", async () => {
		// When reloadFeatureTree returns null, outcome is not_persisted
		const outcomeNotPersisted = await runConfirmGenerate({
			saveHandoff: async () => true,
			generateFeature: async () => ({ status: 200 }),
			reloadFeatureTree: async () => null, // Server has not persisted yet
		});
		expect(outcomeNotPersisted.kind).toBe("not_persisted");

		// Only when reloadFeatureTree succeeds, outcome is success
		const outcomeSuccess = await runConfirmGenerate({
			saveHandoff: async () => true,
			generateFeature: async () => ({ status: 200 }),
			reloadFeatureTree: async () => ({ phases: [] }),
		});
		expect(outcomeSuccess.kind).toBe("success");

		// shouldAutoRevealArtifact enforces both persisted and userDidNotTakeOver
		expect(
			shouldAutoRevealArtifact({
				persisted: false,
				userTookOverCanvas: false,
			}),
		).toBe(false);

		expect(
			shouldAutoRevealArtifact({
				persisted: true,
				userTookOverCanvas: true,
			}),
		).toBe(false);

		expect(
			shouldAutoRevealArtifact({
				persisted: true,
				userTookOverCanvas: false,
			}),
		).toBe(true);
	});
});

describe("P7 one accurate operation status and stale-run safety", () => {
	const iso = (epoch: number) => new Date(epoch).toISOString();

	// 14. Queued operation does not fabricate reasoning
	it("shows one honest label for a RUNNING attempt and invents no activity", () => {
		const run = startRun("ac", 1_000);
		render(
			<CodebaseChatWorkspace
				featureName="Search"
				messages={[]}
				questions={[]}
				answers={{}}
				run={run}
			/>,
		);

		const thinking = screen.getByTestId("codebase-run-thinking");
		expect(thinking.textContent).toContain("Menyusun acceptance criteria...");
		expect(thinking.querySelectorAll("[data-orb]")).toHaveLength(1);
		// 4. No disclosure without genuine detail.
		expect(screen.queryByRole("button", { name: "Aktivitas" })).toBeNull();
		// 3. No transport or generic AI copy reaches the user.
		for (const copy of TRANSPORT_COPY) {
			expect(thinking.textContent).not.toContain(copy);
		}
	});

	it("shows a waiting state with no orb and no timer while the worker has not started", () => {
		// A queued operation is accepted work that no worker has claimed: claiming the
		// AI is composing questions here would be a fabricated signal.
		const queued = queueRun("questions");
		const { container } = render(
			<CodebaseChatWorkspace
				featureName="Search"
				messages={[]}
				questions={[]}
				answers={{}}
				run={queued}
			/>,
		);

		const thinking = screen.getByTestId("codebase-run-thinking");
		expect(thinking.textContent).toContain("Menunggu proses generasi");
		expect(thinking.textContent).not.toContain(
			"Menyusun pertanyaan klarifikasi",
		);
		expect(container.querySelectorAll("[data-orb]")).toHaveLength(0);
		expect(screen.queryByRole("timer")).toBeNull();
		expect(screen.queryByRole("button", { name: "Aktivitas" })).toBeNull();
	});

	// 17. No cross-operation state leakage
	it("drops a late settle carrying an earlier request id", () => {
		const earlier = startRun("questions", 1_000);
		const current = startRun("prd", 2_000);

		const stale = settleRunIfCurrent(
			current,
			earlier.requestId,
			"failed",
			3_000,
			"late failure from the previous request",
		);

		expect(stale).toBe(current);
		expect(current.status).toBe("running");
		expect(current.finishedAt).toBeNull();

		const own = settleRunIfCurrent(current, current.requestId, "done", 4_000);
		expect(own?.status).toBe("done");
		expect(runDurationSeconds(own)).toBe(2);
	});

	// 13. Refresh/reconnect restores real operation state
	it("rebuilds a reconnected operation from its own attempt and settle times", () => {
		const operation = {
			createdAt: iso(1_000_000),
			startedAt: iso(1_001_000),
			finishedAt: iso(1_005_000),
			status: "completed",
		};
		vi.spyOn(Date, "now").mockReturnValue(9_000_000);

		const hydrated = settleRun(
			startRun("questions", attemptStartEpoch(operation) ?? 0),
			"done",
			operationSettleEpoch(operation),
		);

		// The duration is the CURRENT attempt's own execution window, never the wait
		// from acceptance to completion and never the time since the browser reopened.
		expect(runDurationSeconds(hydrated)).toBe(4);
	});

	it("reports no attempt clock for an operation a worker has not claimed yet", () => {
		expect(
			attemptStartEpoch({
				status: "queued",
				createdAt: iso(1_000_000),
				startedAt: null,
			}),
		).toBeNull();
		expect(
			attemptStartEpoch({
				status: "running",
				createdAt: iso(1_000_000),
				startedAt: iso(1_002_000),
			}),
		).toBe(1_002_000);
	});

	it("falls back to the client clock when the operation has no recorded settle time", () => {
		vi.spyOn(Date, "now").mockReturnValue(7_500);
		expect(operationSettleEpoch({ finishedAt: null })).toBe(7_500);
		expect(
			attemptStartEpoch({
				status: "running",
				createdAt: null,
				startedAt: null,
			}),
		).toBeNull();
	});

	// 15. Completed operation shows the correct status, frozen timer
	it("renders settled questions as a compact summary instead of a running spinner", () => {
		const run = settleRun(startRun("questions", 10_000), "done", 15_200);
		render(
			<CodebaseChatWorkspace
				featureName="Search"
				messages={[]}
				questions={[]}
				answers={{}}
				run={run}
			/>,
		);

		const thinking =
			screen.getByTestId("codebase-run-thinking").textContent ?? "";
		expect(thinking).toContain("Pertanyaan siap");
		expect(thinking).not.toContain("Menyusun pertanyaan klarifikasi");
		expect(screen.getByRole("timer").textContent).toBe("5.2s");
	});

	// 1 + 2. One primary indicator for the active operation, and no second one
	it("keeps exactly one primary indicator with no duplicated thinking orb", () => {
		const run = startRun("prd", 1_000);
		const { container } = render(
			<CodebaseChatWorkspace
				featureName="Search"
				messages={[]}
				questions={[]}
				answers={{}}
				run={run}
			/>,
		);

		expect(screen.getAllByTestId("agent-thinking")).toHaveLength(1);
		expect(
			container.querySelectorAll(
				"[data-testid='codebase-run-thinking'] [data-orb]",
			),
		).toHaveLength(1);
		const thinking =
			screen.getByTestId("codebase-run-thinking").textContent ?? "";
		expect(thinking).toContain("Menyusun PRD...");
	});

	// 4. An empty detail set never produces a useless disclosure
	it("renders no Aktivitas disclosure for a workspace run at any status", () => {
		const { rerender } = render(
			<CodebaseChatWorkspace
				featureName="Search"
				messages={[]}
				questions={[]}
				answers={{}}
				run={startRun("questions", 1_000)}
			/>,
		);
		expect(screen.queryByRole("button", { name: "Aktivitas" })).toBeNull();

		rerender(
			<CodebaseChatWorkspace
				featureName="Search"
				messages={[]}
				questions={[]}
				answers={{}}
				run={settleRun(startRun("questions", 1_000), "done", 4_200)}
			/>,
		);
		expect(screen.queryByRole("button", { name: "Aktivitas" })).toBeNull();

		rerender(
			<CodebaseChatWorkspace
				featureName="Search"
				messages={[]}
				questions={[]}
				answers={{}}
				run={null}
			/>,
		);
		expect(screen.queryByRole("button", { name: "Aktivitas" })).toBeNull();
	});

	// State D: one contextual failure disclosure, never the same error twice
	it("shows a failed stage error exactly once and never as a running state", () => {
		const prdRun = settleRun(
			startRun("prd", 1_000),
			"failed",
			4_000,
			"Model timeout saat menyusun PRD",
		);
		const { rerender } = render(
			<CodebaseChatWorkspace
				featureName="Search"
				messages={[]}
				questions={[]}
				answers={{}}
				run={prdRun}
			/>,
		);

		expect(screen.getAllByRole("alert")).toHaveLength(1);
		const thinking =
			screen.getByTestId("codebase-run-thinking").textContent ?? "";
		expect(thinking).toContain("Gagal menyusun PRD");
		expect(thinking).not.toContain("Menyusun PRD...");

		// The feature stage owns its failure at the spec section instead.
		const featureRun = settleRun(
			startRun("feature", 1_000),
			"failed",
			4_000,
			"Spesifikasi fitur gagal dibuat",
		);
		rerender(
			<CodebaseChatWorkspace
				featureName="Search"
				messages={[]}
				questions={[]}
				answers={{}}
				run={featureRun}
			/>,
		);

		expect(screen.getAllByRole("alert")).toHaveLength(1);
	});

	// 4 + 5. Timer advances only while running and freezes at completion
	it("ties duration to the run's own timestamps across a stage change", () => {
		const questionRun = settleRun(
			startRun("questions", 10_000),
			"done",
			13_000,
		);
		expect(runDurationSeconds(questionRun)).toBe(3);
		expect(isRunWorking(questionRun)).toBe(false);

		const prdRun = startRun("prd", 40_000);
		expect(isRunWorking(prdRun)).toBe(true);
		expect(runDurationSeconds(prdRun)).toBeNull();
		expect(runDurationSeconds(settleRun(prdRun, "done", 41_500))).toBe(1.5);
	});
});
