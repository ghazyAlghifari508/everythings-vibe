// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentThinking, type AgentThinkingActivity } from "./agent-thinking";

const ACCEPTED: AgentThinkingActivity = {
	id: "request.accepted",
	label: "Permintaan diterima server",
};
const GENERATING: AgentThinkingActivity = {
	id: "generation.started",
	label: "Model mulai menghasilkan respons",
};

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

	it("collapses and expands the activity details on click", () => {
		render(
			<AgentThinking
				status="running"
				thinkingLabel="Menyusun PRD"
				activities={[ACCEPTED]}
				startedAt={1000}
			/>,
		);

		const toggle = screen.getByRole("button", { name: "Aktivitas" });
		expect(toggle.getAttribute("aria-expanded")).toBe("true");
		expect(screen.getByText(ACCEPTED.label)).toBeDefined();

		fireEvent.click(toggle);
		expect(toggle.getAttribute("aria-expanded")).toBe("false");
		expect(screen.queryByText(ACCEPTED.label)).toBeNull();

		fireEvent.click(toggle);
		expect(toggle.getAttribute("aria-expanded")).toBe("true");
		expect(screen.getByText(ACCEPTED.label)).toBeDefined();
	});

	it("toggles the activity details with Enter and Space", async () => {
		const user = userEvent.setup();
		render(
			<AgentThinking
				status="running"
				thinkingLabel="Menyusun PRD"
				activities={[ACCEPTED]}
				startedAt={1000}
			/>,
		);

		await user.tab();
		const toggle = screen.getByRole("button", { name: "Aktivitas" });
		expect(toggle).toBe(document.activeElement);

		await user.keyboard("{Enter}");
		expect(toggle.getAttribute("aria-expanded")).toBe("false");
		await user.keyboard(" ");
		expect(toggle.getAttribute("aria-expanded")).toBe("true");
	});

	it("keeps a user-collapsed disclosure collapsed while the timer keeps ticking", () => {
		vi.useFakeTimers();
		vi.setSystemTime(1_000);
		render(
			<AgentThinking
				status="running"
				thinkingLabel="Menyusun PRD"
				activities={[ACCEPTED]}
				startedAt={1_000}
			/>,
		);

		const toggle = screen.getByRole("button", { name: "Aktivitas" });
		fireEvent.click(toggle);
		expect(toggle.getAttribute("aria-expanded")).toBe("false");

		// The elapsed clock repaints every 200ms; none of those ticks may reopen
		// the disclosure the user just closed.
		act(() => {
			vi.advanceTimersByTime(1_000);
		});

		expect(toggle.getAttribute("aria-expanded")).toBe("false");
		expect(screen.queryByText(ACCEPTED.label)).toBeNull();
		vi.useRealTimers();
	});

	it("keeps the run in flight and the timer advancing after collapsing", () => {
		vi.useFakeTimers();
		vi.setSystemTime(1_000);
		render(
			<AgentThinking
				status="running"
				thinkingLabel="Menyusun PRD"
				activities={[ACCEPTED]}
				startedAt={1_000}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Aktivitas" }));
		act(() => {
			vi.advanceTimersByTime(1_400);
		});

		expect(screen.getByRole("timer").textContent).toBe("1.4s");
		expect(screen.getByTestId("agent-thinking").textContent).toContain(
			"Menyusun PRD...",
		);
		vi.useRealTimers();
	});

	it("advances the timer only while running", () => {
		vi.useFakeTimers();
		vi.setSystemTime(5_000);
		const { rerender } = render(
			<AgentThinking
				status="running"
				thinkingLabel="Menyusun PRD"
				startedAt={5_000}
			/>,
		);

		act(() => {
			vi.advanceTimersByTime(2_000);
		});
		expect(screen.getByRole("timer").textContent).toBe("2.0s");

		rerender(
			<AgentThinking
				status="done"
				doneLabel="PRD selesai"
				startedAt={5_000}
				finishedAt={7_000}
			/>,
		);
		act(() => {
			vi.advanceTimersByTime(5_000);
		});

		expect(screen.getByRole("timer").textContent).toBe("2.0s");
		vi.useRealTimers();
	});

	it("renders confirmed activity events in observation order", () => {
		render(
			<AgentThinking
				status="running"
				thinkingLabel="Menyusun PRD"
				activities={[ACCEPTED, GENERATING]}
				startedAt={1000}
			/>,
		);

		const labels = screen
			.getAllByRole("listitem")
			.map((item) => item.textContent);
		expect(labels).toEqual([ACCEPTED.label, GENERATING.label]);
	});

	it("never adds activity entries on its own as time passes", () => {
		vi.useFakeTimers();
		vi.setSystemTime(1_000);
		render(
			<AgentThinking
				status="running"
				thinkingLabel="Menyusun PRD"
				activities={[ACCEPTED]}
				startedAt={1_000}
			/>,
		);

		act(() => {
			vi.advanceTimersByTime(45_000);
		});

		const labels = screen
			.getAllByRole("listitem")
			.map((item) => item.textContent);
		expect(labels).toEqual([ACCEPTED.label]);
		vi.useRealTimers();
	});

	it("lets the user expand a completed run that recorded real activity", () => {
		render(
			<AgentThinking
				status="done"
				doneLabel="PRD selesai"
				activities={[ACCEPTED]}
				startedAt={1000}
				finishedAt={4200}
			/>,
		);

		expect(screen.queryByText(ACCEPTED.label)).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "Aktivitas" }));
		expect(screen.getByText(ACCEPTED.label)).toBeDefined();
	});

	it("does not render an expandable control for an empty activity trace", () => {
		render(
			<AgentThinking
				status="done"
				doneLabel="Pertanyaan siap"
				activities={[]}
				startedAt={1000}
				finishedAt={4200}
			/>,
		);

		expect(screen.queryByRole("button", { name: /Aktivitas/i })).toBeNull();
		expect(screen.queryByRole("listitem")).toBeNull();
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
