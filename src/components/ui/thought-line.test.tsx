// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";
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
	wrapper?: (children: ReactNode) => ReactNode,
) {
	const line = (
		<ThoughtLine
			working
			label="ScrapeLabel"
			doneLabel="ScrapeLabel selesai"
			{...props}
		/>
	);
	return render(wrapper ? wrapper(line) : line);
}

function hasAttr(element: Element | null, attribute: string): boolean {
	return element?.hasAttribute(attribute) ?? false;
}

describe("ThoughtLine work reporting", () => {
	it("reports the supplied real activity verbatim and never invents text", () => {
		renderLine({ activity: "Membuka website" });
		const working = document.querySelector(
			'[data-active=""].thought-line__text',
		);
		expect(working?.textContent).toBe("Membuka website");
		expect(document.body.textContent).not.toMatch(/menganalisis|reasoning/i);
	});

	it("keeps the last honest label when no activity detail exists", () => {
		renderLine({ activity: null });
		const working = document.querySelector(
			'[data-active=""].thought-line__text',
		);
		expect(working?.textContent).toBe("ScrapeLabel");
	});

	it("never rotates between invented messages on a timer", () => {
		renderLine({ activity: "Mengambil halaman" });
		const before = document.querySelector(
			'[data-active=""].thought-line__text',
		)?.textContent;
		act(() => {
			vi.advanceTimersByTime(30_000);
		});
		expect(
			document.querySelector('[data-active=""].thought-line__text')
				?.textContent,
		).toBe(before);
	});
});

describe("ThoughtLine settle contract", () => {
	it("cross-fades to the done label and freezes the measured timer", () => {
		const { rerender, container } = renderLine({
			activity: "Membuka website",
		});
		act(() => {
			vi.advanceTimersByTime(1500);
		});
		rerender(
			<ThoughtLine
				working={false}
				label="ScrapeLabel"
				doneLabel="ScrapeLabel selesai"
				activity="Membuka website"
			/>,
		);
		expect(container.textContent).toContain("ScrapeLabel selesai");
		const frozen = container.querySelector('[role="timer"]')?.textContent ?? "";
		act(() => {
			vi.advanceTimersByTime(10_000);
		});
		expect(container.querySelector('[role="timer"]')?.textContent).toBe(frozen);
	});

	it("fires onSettle once with the measured elapsed seconds", () => {
		const onSettle = vi.fn();
		const { rerender } = renderLine({ onSettle });
		act(() => {
			vi.advanceTimersByTime(2400);
		});
		rerender(
			<ThoughtLine
				working={false}
				label="ScrapeLabel"
				doneLabel="ScrapeLabel selesai"
				onSettle={onSettle}
			/>,
		);
		expect(onSettle).toHaveBeenCalledTimes(1);
		expect(onSettle.mock.calls[0]?.[0]).toBeGreaterThanOrEqual(2);
	});

	it("measures elapsed time from the real stage start, not from mount", () => {
		const startedAt = new Date(Date.now() - 14_000);
		const { container } = renderLine({ startedAt });
		act(() => {
			vi.advanceTimersByTime(600);
		});
		const seconds = Number.parseFloat(
			container.querySelector('[role="timer"]')?.textContent ?? "",
		);
		expect(Number.isFinite(seconds)).toBe(true);
		expect(seconds).toBeGreaterThanOrEqual(14);
		expect(seconds).toBeLessThan(20);
	});
});

describe("ThoughtLine trace folding", () => {
	it("renders the vertical step list and collapses it after settling", () => {
		const { container, rerender } = renderLine({ steps: STEPS });
		expect(container.querySelectorAll("li").length).toBe(3);
		expect(
			hasAttr(container.querySelector(".thought-line__trace"), "data-open"),
		).toBe(true);
		rerender(
			<ThoughtLine
				working={false}
				label="ScrapeLabel"
				doneLabel="ScrapeLabel selesai"
				steps={STEPS}
			/>,
		);
		expect(
			hasAttr(container.querySelector(".thought-line__trace"), "data-open"),
		).toBe(false);
	});

	it("tracks the real active step instead of assuming the last one", () => {
		const { container } = renderLine({ steps: STEPS, activeStep: 1 });
		const steps = container.querySelectorAll(".thought-line__step");
		expect(hasAttr(steps[0] ?? null, "data-done")).toBe(true);
		expect(hasAttr(steps[1] ?? null, "data-done")).toBe(false);
		expect(steps[1]?.querySelector(".thought-line__pulse")).not.toBeNull();
	});

	it("renders no trace at all when there is no real step or reasoning data", () => {
		const { container } = renderLine({});
		expect(container.querySelector(".thought-line__trace")).toBeNull();
		expect(screen.getByRole("status").textContent).toBe("ScrapeLabel");
	});

	it("shows model reasoning only when real thinking text is supplied", () => {
		const { container } = renderLine({ thinkingText: "menimbang bukti" });
		expect(container.textContent).toContain("Proses Berpikir Model");
		expect(container.querySelector("pre")?.textContent).toBe("menimbang bukti");
	});
});

describe("ThoughtLine presentation modes", () => {
	it("renders a bare inline line without card chrome or a step list", () => {
		const { container } = renderLine({
			bare: true,
			collapsible: false,
			steps: STEPS,
		});
		expect(container.querySelector(".thought-line--card")).toBeNull();
		expect(container.querySelectorAll("ol, ul, li").length).toBe(0);
		expect(container.querySelector('[role="timer"]')?.textContent).toBe("0.0s");
	});

	it("keeps one accessible live region for screen readers", () => {
		renderLine({ activity: "Memuat konten lazy-load" });
		const statuses = screen.getAllByRole("status");
		expect(statuses).toHaveLength(1);
		expect(statuses[0]?.textContent).toBe("Memuat konten lazy-load");
	});

	it("renders without motion when the user prefers reduced motion", () => {
		const { container } = renderLine(
			{ activity: "Mengambil halaman" },
			(line) => <MotionConfig reducedMotion="always">{line}</MotionConfig>,
		);
		expect(
			hasAttr(container.querySelector(".thought-line__breath"), "data-shimmer"),
		).toBe(false);
		expect(container.textContent).toContain("Mengambil halaman");
	});
});
