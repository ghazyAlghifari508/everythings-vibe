// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScrapeProgress } from "./scrape-progress";

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

it("keeps authoritative activity unchanged as measured time advances", () => {
	vi.useFakeTimers();
	render(
		<ScrapeProgress
			mode="design"
			status="generating"
			activity="Checking evidence"
			activityStartedAt={new Date(Date.now() - 12000).toISOString()}
		/>,
	);
	expect(Number.parseFloat(screen.getByRole("timer").textContent ?? "")).toBe(
		12,
	);
	act(() => vi.advanceTimersByTime(5000));
	expect(Number.parseFloat(screen.getByRole("timer").textContent ?? "")).toBe(
		17,
	);
	expect(screen.getAllByText("Checking evidence")).toHaveLength(2);
});

it("has exactly one failure reason and one functional retry", () => {
	const retry = vi.fn();
	render(
		<ScrapeProgress
			mode="images"
			status="failed"
			errorMessage="Asset verification failed"
			onRetry={retry}
			partialResults={2}
		/>,
	);
	expect(screen.getAllByRole("alert")).toHaveLength(1);
	expect(screen.getAllByRole("button")).toHaveLength(1);
	fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
	expect(retry).toHaveBeenCalledTimes(1);
	expect(screen.queryByRole("timer")).toBeNull();
});

it("does not fabricate counters when no counters have been persisted", () => {
	render(<ScrapeProgress mode="images" status="capturing" />);
	expect(screen.queryByText("0")).toBeNull();
	expect(screen.queryByText(/%/)).toBeNull();
});

it("disables retry while request is pending", () => {
	const retry = vi.fn();
	render(
		<ScrapeProgress mode="crawl" status="failed" onRetry={retry} isRetrying />,
	);
	fireEvent.click(screen.getByRole("button"));
	expect(retry).not.toHaveBeenCalled();
});

it("does not keep a timer running after terminal status", () => {
	vi.useFakeTimers();
	const { rerender, container } = render(
		<ScrapeProgress
			status="capturing"
			activityStartedAt={new Date().toISOString()}
		/>,
	);
	rerender(
		<ScrapeProgress
			status="completed"
			activityStartedAt={new Date().toISOString()}
		/>,
	);
	expect(screen.queryByRole("timer")).toBeNull();
	const text = container.textContent;
	act(() => vi.advanceTimersByTime(10000));
	expect(container.textContent).toBe(text);
});

describe("restored processing workspace", () => {
	it("shows a spinner for the live stage instead of only a pulsing bullet", () => {
		const { container } = render(
			<ScrapeProgress mode="design" status="generating" />,
		);
		const spinners = container.querySelectorAll('[class*="animate-spin"]');
		expect(spinners.length).toBeGreaterThanOrEqual(2);
	});

	it("animates only the active stage segment of the progress bar", () => {
		const { container } = render(
			<ScrapeProgress mode="design" status="extracting" />,
		);
		const segments = container.querySelectorAll("[data-active-stage-segment]");
		expect(segments).toHaveLength(1);
		expect(segments[0]?.className).toContain("animate-scrape-progress");
	});

	it("stops animating once the run reaches a terminal status", () => {
		const { container } = render(
			<ScrapeProgress mode="design" status="completed" />,
		);
		expect(
			container.querySelectorAll("[data-active-stage-segment]"),
		).toHaveLength(0);
		expect(container.querySelectorAll('[class*="animate-spin"]')).toHaveLength(
			0,
		);
	});

	it("keeps the two-column layout with the activity panel beside the stages", () => {
		const { container } = render(
			<ScrapeProgress mode="design" status="capturing" />,
		);
		const grid = container.firstElementChild;
		expect(grid?.className).toContain(
			"lg:grid-cols-[minmax(0,45fr)_minmax(0,55fr)]",
		);
		expect(screen.getByText("Aktivitas pemrosesan")).toBeDefined();
		expect(
			screen.getByRole("region", { name: /progres DESIGN\.md/i }),
		).toBeDefined();
	});

	it("reports a real activity message through the shared ThoughtLine", () => {
		render(
			<ScrapeProgress
				mode="design"
				status="generating"
				activity="Menyusun tabel dari evidence visual"
			/>,
		);
		expect(
			screen.getAllByText("Menyusun tabel dari evidence visual").length,
		).toBeGreaterThan(0);
	});

	it("tells the truth while the job is still queued", () => {
		render(<ScrapeProgress mode="design" status="queued" />);
		expect(screen.getAllByText(/menunggu worker/i).length).toBeGreaterThan(0);
		expect(screen.queryByText(/menganalisis/i)).toBeNull();
	});

	it("surfaces the worker health message while queued", () => {
		render(
			<ScrapeProgress
				mode="design"
				status="queued"
				workerHealth="Belum ada worker yang mengambil job ini."
			/>,
		);
		expect(
			screen.getByText("Belum ada worker yang mengambil job ini."),
		).toBeDefined();
	});

	it("marks completed stages and keeps upcoming stages neutral", () => {
		const { container } = render(
			<ScrapeProgress mode="design" status="extracting" />,
		);
		// Two earlier stages are done, the active one spins, the rest stay plain.
		const list = screen.getByRole("list", { name: "Tahapan pemrosesan" });
		const items = list.querySelectorAll("li");
		expect(items).toHaveLength(6);
		expect(items[0]?.querySelector("svg")).not.toBeNull();
		expect(items[1]?.querySelector("svg")).not.toBeNull();
		expect(
			items[2]?.querySelector("[data-active-stage-marker]"),
		).not.toBeNull();
		expect(items[3]?.querySelector("svg")).toBeNull();
		expect(container.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
	});

	it("keeps a crawl stage list honest about its own stages", () => {
		render(<ScrapeProgress mode="crawl" status="extracting" />);
		const list = screen.getByRole("list", { name: "Tahapan pemrosesan" });
		expect(list.querySelectorAll("li")).toHaveLength(4);
	});
});
