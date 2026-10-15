// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentThinking } from "./agent-thinking";

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("AgentThinking Component", () => {
	it("renders running state with timer and thinking label", () => {
		const now = 100_000;
		vi.spyOn(Date, "now").mockReturnValue(now + 3500);

		render(
			<AgentThinking
				status="running"
				thinkingLabel="Thinking"
				startedAt={now}
			/>,
		);

		const thinking = screen.getByTestId("agent-thinking");
		expect(thinking.textContent).toContain("Thinking...");
		const timer = screen.getByRole("timer");
		expect(timer.textContent).toBe("3.5s");

		vi.restoreAllMocks();
	});

	it("renders completed state with frozen duration", () => {
		const startedAt = 10_000;
		const finishedAt = 18_400; // 8.4s

		render(
			<AgentThinking
				status="done"
				doneLabel="Pertanyaan siap"
				startedAt={startedAt}
				finishedAt={finishedAt}
			/>,
		);

		const thinking = screen.getByTestId("agent-thinking");
		expect(thinking.textContent).toContain("Pertanyaan siap");
		const timer = screen.getByRole("timer");
		expect(timer.textContent).toBe("8.4s");
	});

	it("timer remains frozen and does not tick after finishedAt is set", () => {
		vi.useFakeTimers();
		const startedAt = 10_000;
		const finishedAt = 14_200; // 4.2s

		render(
			<AgentThinking
				status="done"
				doneLabel="PRD selesai"
				startedAt={startedAt}
				finishedAt={finishedAt}
			/>,
		);

		const timer = screen.getByRole("timer");
		expect(timer.textContent).toBe("4.2s");

		// Advance timer by 10 seconds
		act(() => {
			vi.advanceTimersByTime(10_000);
		});

		// Must remain exactly 4.2s
		expect(timer.textContent).toBe("4.2s");
		vi.useRealTimers();
	});

	it("renders failed state with error message and retry button", () => {
		const onRetry = vi.fn();
		render(
			<AgentThinking
				status="failed"
				failedLabel="Gagal menyusun PRD"
				error="Konteks repositori belum siap"
				onRetry={onRetry}
				startedAt={1000}
				finishedAt={3500}
			/>,
		);

		const thinking = screen.getByTestId("agent-thinking");
		expect(thinking.textContent).toContain("Gagal menyusun PRD");
		expect(thinking.textContent).toContain("2.5s");
		expect(screen.getByRole("alert").textContent).toContain(
			"Konteks repositori belum siap",
		);

		const retryBtn = screen.getByRole("button", { name: "Coba lagi" });
		act(() => {
			retryBtn.click();
		});
		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	it("renders verified generating phase with completed thinking line and active generating line", () => {
		render(
			<AgentThinking
				status="running"
				phase="generating"
				thinkingLabel="Thinking"
				generatingLabel="Menyusun PRD..."
				startedAt={1000}
				finishedAt={4500}
			/>,
		);

		const thinking = screen.getByTestId("agent-thinking");
		expect(thinking.textContent).toContain("Thinking");
		expect(thinking.textContent).toContain("Menyusun PRD...");
	});

	it("collapses expandable details on settle", () => {
		const { rerender } = render(
			<AgentThinking
				status="running"
				thinkingLabel="Thinking"
				thinkingText="Analisis dependensi arsitektur..."
				activity="Menganalisis kebutuhan fitur..."
				startedAt={1000}
			/>,
		);

		// While running, details button is present and open
		const toggleBtn = screen.getByRole("button", { name: /Aktivitas/i });
		expect(toggleBtn).toBeDefined();
		expect(screen.getByText("Analisis dependensi arsitektur...")).toBeDefined();

		// Rerender as done
		rerender(
			<AgentThinking
				status="done"
				doneLabel="Selesai"
				thinkingText="Analisis dependensi arsitektur..."
				activity="Menganalisis kebutuhan fitur..."
				startedAt={1000}
				finishedAt={3000}
			/>,
		);

		// Once done, details auto-collapse
		expect(screen.queryByText("Analisis dependensi arsitektur...")).toBeNull();
	});

	it("does not render empty details dropdown if no activity and no thinkingText", () => {
		render(
			<AgentThinking
				status="running"
				thinkingLabel="Thinking"
				startedAt={1000}
			/>,
		);

		expect(screen.queryByRole("button", { name: /Aktivitas/i })).toBeNull();
	});

	it("fires onSettle once when status transitions from running to done", () => {
		const onSettle = vi.fn();
		const { rerender } = render(
			<AgentThinking
				status="running"
				thinkingLabel="Thinking"
				startedAt={1000}
				onSettle={onSettle}
			/>,
		);

		expect(onSettle).not.toHaveBeenCalled();

		rerender(
			<AgentThinking
				status="done"
				doneLabel="Selesai"
				startedAt={1000}
				finishedAt={4200}
				onSettle={onSettle}
			/>,
		);

		expect(onSettle).toHaveBeenCalledTimes(1);
		expect(onSettle).toHaveBeenCalledWith(3.2);
	});
});
