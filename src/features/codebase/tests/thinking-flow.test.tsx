// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentThinking } from "@/components/ui/agent-thinking";
import {
	activitiesFromOperation,
	appendRunThinking,
	type CodebaseRunState,
	isRunWorking,
	operationSettleEpoch,
	recordOperationActivities,
	recordRunActivity,
	runConfirmGenerate,
	runDurationSeconds,
	setRunPhase,
	settleRun,
	settleRunIfCurrent,
	shouldAutoRevealArtifact,
	startRun,
} from "@/features/codebase/services/chat-flow";
import { consumeSseStream } from "@/lib/sse-consume";
import { CodebaseChatWorkspace } from "../components/chat/codebase-chat-workspace";

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
		expect(prdStage?.textContent).toContain("Berikutnya: PRD");
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
		expect(acStage?.textContent).toContain("Berikutnya: Acceptance Criteria");
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
			"PRD selesai",
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

		// Pure request status, no fake chain of thought
		expect(run.activity).toBe(
			"Menyusun pertanyaan klarifikasi dari prompt dan konteks repository.",
		);
		expect(run.thinkingText).toBe("");
		expect(isRunWorking(run)).toBe(true);

		// Settles cleanly on response
		const finished = settleRun(run, "done", 15_200);
		expect(finished?.status).toBe("done");
		expect(runDurationSeconds(finished)).toBe(5.2);
	});

	// 9. No fake progress transition
	it("only advances to generating phase on authentic onDelta signal, never on synthetic timer", () => {
		const initialRun = startRun("prd", 1000);
		expect(initialRun.phase).toBe("thinking");

		// Receiving thinking reasoning chunks keeps phase at thinking
		const withThinking = appendRunThinking(
			initialRun,
			"Thinking about auth routes...",
		);
		expect(withThinking).not.toBeNull();
		expect(withThinking?.phase).toBe("thinking");
		expect(withThinking?.thinkingText).toBe("Thinking about auth routes...");

		// Phase advances to generating ONLY when setRunPhase is explicitly triggered by onDelta
		const generatingRun = setRunPhase(withThinking, "generating");
		expect(generatingRun).not.toBeNull();
		expect(generatingRun?.phase).toBe("generating");
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

describe("P3 Authentic thinking, activity history and stale-run safety", () => {
	const iso = (epoch: number) => new Date(epoch).toISOString();

	// 9. Real activity events appear in the correct order
	it("logs only confirmed backend events, in the order they were observed", () => {
		const run = startRun("questions", 1_000);
		expect(run.activities).toEqual([]);

		// A queued operation proves acceptance only; no generation has begun.
		const queued = recordOperationActivities(
			run,
			{ createdAt: iso(1_100), startedAt: null, status: "queued" },
			run.requestId,
		);
		expect(queued?.activities.map((entry) => entry.id)).toEqual([
			"request.accepted",
		]);

		const runningRun = recordOperationActivities(
			queued,
			{ createdAt: iso(1_100), startedAt: iso(1_400), status: "running" },
			run.requestId,
		);
		expect(runningRun?.activities.map((entry) => entry.id)).toEqual([
			"request.accepted",
			"generation.started",
		]);

		// Re-observing the same operation must not duplicate its events.
		const reobserved = recordOperationActivities(
			runningRun,
			{ createdAt: iso(1_100), startedAt: iso(1_400), status: "running" },
			run.requestId,
		);
		expect(reobserved?.activities).toHaveLength(2);

		const persisted = recordRunActivity(
			reobserved,
			"result.persisted",
			2_100,
			run.requestId,
		);
		expect(persisted?.activities.map((entry) => entry.id)).toEqual([
			"request.accepted",
			"generation.started",
			"result.persisted",
		]);
	});

	it("never invents events for an operation the client never saw running", () => {
		const run = startRun("questions", 1_000);
		const queuedOnly = recordOperationActivities(
			run,
			{ createdAt: iso(1_100), startedAt: null, status: "queued" },
			run.requestId,
		);
		const ids = queuedOnly?.activities.map((entry) => entry.id) ?? [];

		expect(ids).not.toContain("generation.started");
		expect(ids).not.toContain("result.persisted");
	});

	// 8. No mock activity rotation
	it("adds no further events while the same operation keeps reporting the same state", () => {
		const run = recordRunActivity(
			startRun("prd", 1_000),
			"request.accepted",
			1_100,
		);
		if (!run) throw new Error("run must be running");

		const stillQueued = recordOperationActivities(
			run,
			{ createdAt: iso(1_100), startedAt: null, status: "queued" },
			run.requestId,
		);

		expect(stillQueued?.activities.map((entry) => entry.id)).toEqual([
			"request.accepted",
		]);
	});

	// 10. Stale operation events cannot change current status
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

	it("ignores activity events that arrive after the run settled", () => {
		const settled = settleRun(startRun("prd", 1_000), "done", 4_000);
		const late = recordRunActivity(
			settled,
			"result.persisted",
			5_000,
			settled?.requestId,
		);

		expect(late).toBe(settled);
		expect(settled?.activities).toEqual([]);
	});

	it("ignores activity events addressed to a different request", () => {
		const current = startRun("prd", 2_000);
		const other = startRun("questions", 1_000);

		const ignored = recordRunActivity(
			current,
			"generation.started",
			3_000,
			other.requestId,
		);

		expect(ignored).toBe(current);
		expect(current.activities).toEqual([]);
	});

	it("replays only the events a persisted operation actually proves", () => {
		expect(
			activitiesFromOperation({
				createdAt: iso(1_000),
				startedAt: null,
				status: "queued",
			}).map((entry) => entry.id),
		).toEqual(["request.accepted"]);

		expect(
			activitiesFromOperation({
				createdAt: iso(1_000),
				startedAt: iso(1_500),
				status: "completed",
			}).map((entry) => entry.id),
		).toEqual(["request.accepted", "generation.started"]);
	});

	it("reports the operation's own duration on remount, not the time since the page opened", () => {
		const operation = {
			createdAt: iso(1_000_000),
			startedAt: iso(1_001_000),
			finishedAt: iso(1_005_000),
			status: "completed",
		};
		vi.spyOn(Date, "now").mockReturnValue(9_000_000);

		const hydrated = settleRun(
			startRun("questions", Date.parse(operation.startedAt)),
			"done",
			operationSettleEpoch(operation),
		);

		expect(runDurationSeconds(hydrated)).toBe(4);
	});

	it("falls back to the client clock when the operation has no recorded settle time", () => {
		vi.spyOn(Date, "now").mockReturnValue(7_500);
		expect(operationSettleEpoch({ finishedAt: null })).toBe(7_500);
	});

	// 6. Completed questions no longer show running state
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

	// 7. No duplicated Thinking after stage transition
	it("renders one thinking indicator with distinct thinking and generating labels", () => {
		const run = setRunPhase(startRun("prd", 1_000), "generating");
		render(
			<CodebaseChatWorkspace
				featureName="Search"
				messages={[]}
				questions={[]}
				answers={{}}
				run={run}
			/>,
		);

		expect(screen.getAllByTestId("agent-thinking")).toHaveLength(1);
		const thinking =
			screen.getByTestId("codebase-run-thinking").textContent ?? "";
		expect(thinking).toContain("Menyusun PRD");
		expect(thinking).toContain("Menulis PRD");
	});

	// 1 + 2. Click and keyboard toggle the details; 11. an empty trace renders no control
	it("exposes the activity disclosure only when a trace exists", () => {
		const { rerender } = render(
			<CodebaseChatWorkspace
				featureName="Search"
				messages={[]}
				questions={[]}
				answers={{}}
				run={startRun("questions", 1_000)}
			/>,
		);

		const toggle = screen.getByRole("button", { name: "Aktivitas" });
		expect(toggle.getAttribute("aria-expanded")).toBe("true");
		fireEvent.click(toggle);
		expect(toggle.getAttribute("aria-expanded")).toBe("false");
		fireEvent.click(toggle);
		expect(toggle.getAttribute("aria-expanded")).toBe("true");

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
