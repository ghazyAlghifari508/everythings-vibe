// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThoughtLine } from "./thought-line";

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

const HINTS = ["hint-first", "hint-second", "hint-third"];

function renderRotating(
	props: Partial<React.ComponentProps<typeof ThoughtLine>> = {},
) {
	return render(
		<ThoughtLine
			working
			label="ScrapeLabel"
			doneLabel="ScrapeLabel selesai"
			presentation="rotating"
			rotatingMessages={HINTS}
			{...props}
		/>,
	);
}

describe("ThoughtLine default presentation", () => {
	it("keeps stacked behavior: renders the vertical steps list", () => {
		const { container } = render(
			<ThoughtLine
				working
				label="Menyusun PRD"
				steps={["step-one", "step-two", "step-three"]}
				activeStep={1}
			/>,
		);
		expect(container.querySelectorAll("li").length).toBe(3);
		expect(
			screen.queryByRole("status", { name: "Aktivitas berlangsung" }),
		).toBeNull();
	});
});

describe("ThoughtLine bare presentation", () => {
	it("renders the activity line without the header row", () => {
		const { container } = render(
			<ThoughtLine
				working
				label="ScrapeLabel"
				doneLabel="ScrapeLabel selesai"
				presentation="rotating"
				rotatingMessages={HINTS}
				bare
			/>,
		);
		expect(screen.getAllByRole("status").length).toBe(1);
		expect(
			screen.getByRole("status", { name: "Aktivitas berlangsung" }).textContent,
		).toContain(HINTS[0]);
		expect(container.querySelector('[role="timer"]')?.textContent).toBe("0.0s");
		expect(container.querySelectorAll("ol, ul, li").length).toBe(0);
	});

	it("advances the bare line over time and empties it on settle", () => {
		const { container, rerender } = render(
			<ThoughtLine
				working
				label="ScrapeLabel"
				doneLabel="ScrapeLabel selesai"
				presentation="rotating"
				rotatingMessages={HINTS}
				bare
			/>,
		);
		act(() => {
			vi.advanceTimersByTime(3200);
		});
		expect(
			screen.getByRole("status", { name: "Aktivitas berlangsung" }).textContent,
		).toContain(HINTS[1]);
		rerender(
			<ThoughtLine
				working={false}
				label="ScrapeLabel"
				doneLabel="ScrapeLabel selesai"
				presentation="rotating"
				rotatingMessages={HINTS}
				bare
			/>,
		);
		expect(
			screen.queryByRole("status", { name: "Aktivitas berlangsung" }),
		).toBeNull();
		act(() => {
			vi.advanceTimersByTime(10000);
		});
		expect(container.textContent).toBe("");
	});
});

describe("ThoughtLine rotation stability", () => {
	it("keeps rotating across equivalent rerenders without restarting the cycle", () => {
		const renderRotatingClone = () =>
			render(
				<ThoughtLine
					working
					label="ScrapeLabel"
					doneLabel="ScrapeLabel selesai"
					presentation="rotating"
					rotatingMessages={[...HINTS]}
					rotationKey="generating"
				/>,
			);
		const { rerender } = renderRotatingClone();
		const rerenderClone = () =>
			rerender(
				<ThoughtLine
					working
					label="ScrapeLabel"
					doneLabel="ScrapeLabel selesai"
					presentation="rotating"
					rotatingMessages={[...HINTS]}
					rotationKey="generating"
				/>,
			);
		act(() => {
			vi.advanceTimersByTime(1000);
		});
		rerenderClone();
		act(() => {
			vi.advanceTimersByTime(1000);
		});
		rerenderClone();
		act(() => {
			vi.advanceTimersByTime(1200);
		});
		expect(
			screen.getByRole("status", { name: "Aktivitas berlangsung" }).textContent,
		).toContain(HINTS[1]);
		rerenderClone();
		act(() => {
			vi.advanceTimersByTime(3200);
		});
		expect(
			screen.getByRole("status", { name: "Aktivitas berlangsung" }).textContent,
		).toContain(HINTS[2]);
	});

	it("renders no activity slot when work never starts", () => {
		render(
			<ThoughtLine
				working={false}
				label="ScrapeLabel"
				doneLabel="ScrapeLabel selesai"
				presentation="rotating"
				rotatingMessages={HINTS}
			/>,
		);
		expect(
			screen.queryByRole("status", { name: "Aktivitas berlangsung" }),
		).toBeNull();
	});
});

describe("ThoughtLine rotating presentation", () => {
	it("renders exactly one activity slot and never a vertical list", () => {
		const { container } = renderRotating();
		expect(container.querySelectorAll("ol, ul, li").length).toBe(0);
		const slot = screen.getByRole("status", { name: "Aktivitas berlangsung" });
		expect(slot.textContent).toContain(HINTS[0]);
	});

	it("advances the single slot to the next message over time while working", () => {
		renderRotating();
		const slot = screen.getByRole("status", { name: "Aktivitas berlangsung" });
		expect(slot.textContent).toContain(HINTS[0]);
		act(() => {
			vi.advanceTimersByTime(3200);
		});
		expect(
			screen.getByRole("status", { name: "Aktivitas berlangsung" }).textContent,
		).toContain(HINTS[1]);
		act(() => {
			vi.advanceTimersByTime(3200);
		});
		expect(
			screen.getByRole("status", { name: "Aktivitas berlangsung" }).textContent,
		).toContain(HINTS[2]);
	});

	it("restarts the message cycle when the rotation key changes", () => {
		const { rerender } = renderRotating({ rotationKey: "capturing" });
		act(() => {
			vi.advanceTimersByTime(6400);
		});
		expect(
			screen.getByRole("status", { name: "Aktivitas berlangsung" }).textContent,
		).toContain(HINTS[2]);
		rerender(
			<ThoughtLine
				working
				label="ScrapeLabel"
				doneLabel="ScrapeLabel selesai"
				presentation="rotating"
				rotatingMessages={HINTS}
				rotationKey="extracting"
			/>,
		);
		expect(
			screen.getByRole("status", { name: "Aktivitas berlangsung" }).textContent,
		).toContain(HINTS[0]);
	});

	it("stops rotation and freezes the timer once work settles", () => {
		const { rerender, container } = renderRotating();
		act(() => {
			vi.advanceTimersByTime(1000);
		});
		const timer = container.querySelector('[role="timer"]');
		const frozen = timer?.textContent;
		rerender(
			<ThoughtLine
				working={false}
				label="ScrapeLabel"
				doneLabel="ScrapeLabel selesai"
				presentation="rotating"
				rotatingMessages={HINTS}
			/>,
		);
		expect(
			screen.queryByRole("status", { name: "Aktivitas berlangsung" }),
		).toBeNull();
		expect(screen.getByText(/ScrapeLabel selesai/i)).toBeDefined();
		act(() => {
			vi.advanceTimersByTime(10000);
		});
		expect(container.querySelector('[role="timer"]')?.textContent).toBe(frozen);
		expect(container.querySelectorAll("ol, ul, li").length).toBe(0);
	});

	it("derives the elapsed timer from the supplied stage start instead of mount", () => {
		const stageStart = Date.now() - 14_000;
		const { container } = renderRotating({ startedAt: stageStart });
		act(() => {
			vi.advanceTimersByTime(600);
		});
		const text = container.querySelector('[role="timer"]')?.textContent ?? "";
		const seconds = Number.parseFloat(text);
		expect(Number.isFinite(seconds)).toBe(true);
		expect(seconds).toBeGreaterThanOrEqual(14);
		expect(seconds).toBeLessThan(20);
	});

	it("renders a valid single slot on the reduced-motion path", () => {
		vi.stubGlobal("matchMedia", (query: string) => ({
			matches: query.includes("reduce"),
			media: query,
			addEventListener: () => {},
			removeEventListener: () => {},
			addListener: () => {},
			removeListener: () => {},
			dispatchEvent: () => false,
		}));
		const { container } = renderRotating();
		expect(container.querySelectorAll("ol, ul, li").length).toBe(0);
		expect(
			screen.getByRole("status", { name: "Aktivitas berlangsung" }).textContent,
		).toContain(HINTS[0]);
		act(() => {
			vi.advanceTimersByTime(3200);
		});
		expect(
			screen.getByRole("status", { name: "Aktivitas berlangsung" }).textContent,
		).toContain(HINTS[1]);
	});
});
