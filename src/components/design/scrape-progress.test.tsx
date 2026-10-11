// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
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
