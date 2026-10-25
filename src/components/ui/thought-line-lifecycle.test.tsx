// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
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

const STEPS = ["step-one", "step-two", "step-three"];

function renderLine(
	props: Partial<React.ComponentProps<typeof ThoughtLine>> = {},
) {
	return render(
		<ThoughtLine
			working
			label="ScrapeLabel"
			doneLabel="ScrapeLabel selesai"
			{...props}
		/>,
	);
}

function readTimer(container: HTMLElement): number {
	return Number.parseFloat(
		container.querySelector('[role="timer"]')?.textContent ?? "",
	);
}

describe("ThoughtLine timing lifecycle", () => {
	it("keeps the measured duration when a completed line remounts", () => {
		const settled = {
			working: false,
			label: "Menyusun PRD",
			doneLabel: "PRD selesai",
			startedAt: 1_000,
			finishedAt: 19_400,
		};
		const first = render(<ThoughtLine {...settled} />);
		expect(first.container.querySelector('[role="timer"]')?.textContent).toBe(
			"18.4s",
		);
		first.unmount();
		const second = render(<ThoughtLine {...settled} />);
		expect(second.container.querySelector('[role="timer"]')?.textContent).toBe(
			"18.4s",
		);
		act(() => {
			vi.advanceTimersByTime(30_000);
		});
		expect(second.container.querySelector('[role="timer"]')?.textContent).toBe(
			"18.4s",
		);
	});

	it("re-anchors the clock on a stage change without keeping stale time", () => {
		const { rerender, container } = renderLine({
			startedAt: Date.now() - 5_000,
		});
		act(() => {
			vi.advanceTimersByTime(500);
		});
		const before = readTimer(container);
		expect(before).toBeGreaterThanOrEqual(5);
		rerender(
			<ThoughtLine
				working
				label="ScrapeLabel"
				doneLabel="ScrapeLabel selesai"
				startedAt={Date.now() - 1_000}
			/>,
		);
		act(() => {
			vi.advanceTimersByTime(200);
		});
		const after = readTimer(container);
		expect(after).toBeGreaterThanOrEqual(1);
		expect(after).toBeLessThan(before);
	});

	it("keeps accruing real elapsed time across repeated renders", () => {
		const startedAt = Date.now();
		const { rerender, container } = renderLine({ startedAt });
		act(() => {
			vi.advanceTimersByTime(1_000);
		});
		const first = readTimer(container);
		expect(first).toBeGreaterThanOrEqual(1);
		for (let index = 0; index < 4; index += 1) {
			rerender(
				<ThoughtLine
					working
					label="ScrapeLabel"
					doneLabel="ScrapeLabel selesai"
					startedAt={startedAt}
				/>,
			);
			act(() => {
				vi.advanceTimersByTime(500);
			});
		}
		const second = readTimer(container);
		expect(second).toBeGreaterThan(first);
		expect(second).toBeGreaterThanOrEqual(3);
	});

	it("tears down the tick interval and the label observer on unmount", () => {
		const disconnectSpy = vi.fn();
		vi.stubGlobal(
			"ResizeObserver",
			class {
				observe() {}
				unobserve() {}
				disconnect() {
					disconnectSpy();
				}
			},
		);
		const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
		const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
		const { unmount } = renderLine({ steps: STEPS });
		const tickIndex = setIntervalSpy.mock.calls.findIndex(
			(call) => call[1] === 100,
		);
		const tickId = setIntervalSpy.mock.results[tickIndex]?.value;
		expect(tickId).toBeDefined();
		unmount();
		expect(clearIntervalSpy).toHaveBeenCalledWith(tickId);
		expect(disconnectSpy).toHaveBeenCalled();
	});
});
