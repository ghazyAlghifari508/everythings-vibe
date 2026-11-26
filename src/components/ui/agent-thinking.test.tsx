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
import { AgentThinking } from "./agent-thinking";

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

	it("keeps the timer frozen and does not tick after finishedAt is set", () => {
		vi.useFakeTimers();
		const startedAt = 10_000;
		const finishedAt = 14_200; // 4.2s

		render(
			<AgentThinking
				status="done"
				doneLabel="PRD siap"
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

	it("freezes the timer after a failure instead of keeping it running", () => {
		vi.useFakeTimers();
		const startedAt = 4_000;
		render(
			<AgentThinking
				status="failed"
				failedLabel="Gagal menyusun task"
				error="Worker berhenti"
				startedAt={startedAt}
				finishedAt={9_200}
			/>,
		);

		const timer = screen.getByRole("timer");
		expect(timer.textContent).toBe("5.2s");

		act(() => {
			vi.advanceTimersByTime(20_000);
		});
		expect(timer.textContent).toBe("5.2s");
		vi.useRealTimers();
	});

	// Also covers a cancelled run: the workspace settles a cancelled operation as a
	// failure carrying "Dibatalkan.", so its duration must freeze the same way.
	it("freezes the timer after a cancellation reported as a failure", () => {
		vi.useFakeTimers();
		render(
			<AgentThinking
				status="failed"
				failedLabel="Gagal menyusun PRD"
				error="Dibatalkan."
				startedAt={1_000}
				finishedAt={3_000}
			/>,
		);

		const timer = screen.getByRole("timer");
		expect(timer.textContent).toBe("2.0s");
		act(() => {
			vi.advanceTimersByTime(15_000);
		});
		expect(timer.textContent).toBe("2.0s");
		vi.useRealTimers();
	});

	it("starts the timer from the operation start, not from mount", () => {
		vi.useFakeTimers();
		vi.setSystemTime(50_000);
		render(
			<AgentThinking
				status="running"
				thinkingLabel="Menyusun PRD"
				startedAt={44_000}
			/>,
		);

		// The operation had already been running for six seconds when it mounted.
		expect(screen.getByRole("timer").textContent).toBe("6.0s");
		vi.useRealTimers();
	});

	it("does not reset the elapsed time on an ordinary rerender", () => {
		vi.useFakeTimers();
		vi.setSystemTime(1_000);
		const { rerender } = render(
			<AgentThinking
				status="running"
				thinkingLabel="Menyusun PRD"
				startedAt={1_000}
			/>,
		);

		act(() => {
			vi.advanceTimersByTime(1_400);
		});
		expect(screen.getByRole("timer").textContent).toBe("1.4s");

		rerender(
			<AgentThinking
				status="running"
				thinkingLabel="Menyusun PRD"
				startedAt={1_000}
			/>,
		);
		expect(screen.getByRole("timer").textContent).toBe("1.4s");
		vi.useRealTimers();
	});

	it("exposes exactly one primary Orb while a run is in flight", () => {
		const { container } = render(
			<AgentThinking
				status="running"
				thinkingLabel="Menyusun PRD"
				thinkingText="Menimbang struktur dokumen"
				startedAt={1000}
			/>,
		);

		expect(container.querySelectorAll("[data-orb]")).toHaveLength(1);
		expect(screen.getAllByTestId("agent-thinking-indicator")).toHaveLength(1);
	});

	it("never renders a second animated indicator when the activity is expanded", () => {
		const { container } = render(
			<AgentThinking
				status="running"
				thinkingLabel="Menyusun PRD"
				thinkingText="Menimbang struktur dokumen"
				startedAt={1000}
			/>,
		);

		const toggle = screen.getByRole("button", { name: "Aktivitas" });
		fireEvent.click(toggle); // collapse
		expect(container.querySelectorAll("[data-orb]")).toHaveLength(1);
		fireEvent.click(toggle); // expand again
		expect(container.querySelectorAll("[data-orb]")).toHaveLength(1);
	});

	it("shows real provider reasoning details and toggles them on click", () => {
		render(
			<AgentThinking
				status="running"
				thinkingLabel="Menyusun PRD"
				thinkingText="Menimbang struktur dokumen dari konteks repository"
				startedAt={1000}
			/>,
		);

		const toggle = screen.getByRole("button", { name: "Aktivitas" });
		expect(toggle.getAttribute("aria-expanded")).toBe("true");
		expect(
			screen.getByText("Menimbang struktur dokumen dari konteks repository"),
		).toBeDefined();

		fireEvent.click(toggle);
		expect(toggle.getAttribute("aria-expanded")).toBe("false");
		expect(
			screen.queryByText("Menimbang struktur dokumen dari konteks repository"),
		).toBeNull();

		fireEvent.click(toggle);
		expect(toggle.getAttribute("aria-expanded")).toBe("true");
		expect(
			screen.getByText("Menimbang struktur dokumen dari konteks repository"),
		).toBeDefined();
	});

	it("toggles the details with Enter and Space", async () => {
		const user = userEvent.setup();
		render(
			<AgentThinking
				status="running"
				thinkingLabel="Menyusun PRD"
				thinkingText="Menimbang struktur dokumen"
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
				thinkingText="Menimbang struktur dokumen"
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
		expect(screen.queryByText("Menimbang struktur dokumen")).toBeNull();
		vi.useRealTimers();
	});

	it("keeps the run in flight and the timer advancing after collapsing", () => {
		vi.useFakeTimers();
		vi.setSystemTime(1_000);
		render(
			<AgentThinking
				status="running"
				thinkingLabel="Menyusun PRD"
				thinkingText="Menimbang struktur dokumen"
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
				doneLabel="PRD siap"
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

	it("renders no disclosure control when there is nothing genuine to show", () => {
		render(
			<AgentThinking
				status="running"
				thinkingLabel="Menyusun pertanyaan klarifikasi"
				startedAt={1_000}
			/>,
		);

		expect(screen.queryByRole("button", { name: "Aktivitas" })).toBeNull();
		expect(screen.queryByRole("listitem")).toBeNull();
	});

	it("treats blank or whitespace reasoning as no disclosure at all", () => {
		render(
			<AgentThinking
				status="done"
				doneLabel="Task siap"
				thinkingText={"   \n  "}
				startedAt={1000}
				finishedAt={4200}
			/>,
		);

		expect(screen.queryByRole("button", { name: "Aktivitas" })).toBeNull();
	});

	it("never renders transport or generic AI copy", () => {
		const { container } = render(
			<AgentThinking
				status="running"
				thinkingLabel="Menyusun PRD"
				thinkingText="Menimbang struktur dokumen"
				startedAt={1000}
			/>,
		);

		for (const copy of TRANSPORT_COPY) {
			expect(container.textContent).not.toContain(copy);
		}
	});

	it("synthesizes no extra detail rows as time passes", () => {
		vi.useFakeTimers();
		vi.setSystemTime(1_000);
		render(
			<AgentThinking
				status="running"
				thinkingLabel="Menyusun PRD"
				thinkingText="Menimbang struktur dokumen"
				startedAt={1_000}
			/>,
		);

		act(() => {
			vi.advanceTimersByTime(1_000);
		});

		expect(screen.queryAllByRole("listitem")).toHaveLength(0);
		expect(screen.getByText("Menimbang struktur dokumen")).toBeDefined();
		vi.useRealTimers();
	});

	it("collapses expandable details on settle", () => {
		const { rerender } = render(
			<AgentThinking
				status="running"
				thinkingLabel="Thinking"
				thinkingText="Analisis dependensi arsitektur..."
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
				startedAt={1000}
				finishedAt={3000}
			/>,
		);

		// Once done, details auto-collapse
		expect(screen.queryByText("Analisis dependensi arsitektur...")).toBeNull();
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

	// Keeps every existing consumer working: the legacy working/failed flags still
	// drive the same three states as the newer status prop.
	it("keeps the legacy working/failed flags compatible", () => {
		const { rerender } = render(
			<AgentThinking working thinkingLabel="Menyusun PRD" startedAt={1000} />,
		);
		expect(screen.getByTestId("agent-thinking").textContent).toContain(
			"Menyusun PRD...",
		);

		rerender(
			<AgentThinking
				failed
				failedLabel="Gagal menyusun PRD"
				error="Timeout"
				startedAt={1000}
				finishedAt={2000}
			/>,
		);
		expect(screen.getByTestId("agent-thinking").textContent).toContain(
			"Gagal menyusun PRD",
		);

		rerender(
			<AgentThinking working={false} doneLabel="PRD siap" startedAt={1000} />,
		);
		expect(screen.getByTestId("agent-thinking").textContent).toContain(
			"PRD siap",
		);
	});

	it("renders nothing while idle", () => {
		const { container } = render(<AgentThinking status="idle" />);
		expect(
			container.querySelector("[data-testid='agent-thinking']"),
		).toBeNull();
	});
});
