// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scrapeActivityHints } from "@/lib/scrape-activity-hints";
import { ScrapeProgress } from "./scrape-progress";

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

function progressbarFill(container: HTMLElement): string {
	return (
		container.querySelector('[role="progressbar"] > div')?.getAttribute("style") ??
		""
	);
}

function activeSlotText(): string {
	return (
		screen.getByRole("status", { name: "Aktivitas berlangsung" }).textContent ??
		""
	);
}

function authoritativeStage(container: HTMLElement): string {
	return (
		container
			.querySelector('[role="progressbar"]')
			?.getAttribute("aria-valuetext") ?? ""
	);
}

describe("ScrapeProgress", () => {
	it("shows one rotating activity slot for DESIGN capturing without a fake percentage", () => {
		const { container } = render(
			<ScrapeProgress
				mode="design"
				status="capturing"
				sourceUrl="https://www.notion.com/"
				domain="www.notion.com"
			/>,
		);
		expect(authoritativeStage(container)).toBe("Mengambil halaman");
		expect(activeSlotText()).toContain(
			scrapeActivityHints("design", "capturing")[0],
		);
		expect(container.querySelectorAll("ol, ul").length).toBeGreaterThan(0);
		expect(
			container.querySelectorAll('[aria-label="Aktivitas berlangsung"]').length,
		).toBe(1);
		expect(screen.queryByText(/\(\d+%/)).toBeNull();
		expect(
			container
				.querySelector('[role="progressbar"]')
				?.getAttribute("aria-valuenow"),
		).toBeNull();
	});

	it("keeps the real stage and progress bar fixed while hints rotate", () => {
		const { container } = render(
			<ScrapeProgress
				mode="design"
				status="capturing"
				sourceUrl="https://www.notion.com/"
				domain="www.notion.com"
			/>,
		);
		const stageBefore = authoritativeStage(container);
		const fillBefore = progressbarFill(container);
		const hintBefore = activeSlotText();
		act(() => {
			vi.advanceTimersByTime(9500);
		});
		expect(authoritativeStage(container)).toBe(stageBefore);
		expect(progressbarFill(container)).toBe(fillBefore);
		expect(activeSlotText()).not.toBe(hintBefore);
		expect(activeSlotText()).toContain("...");
	});

	it("swaps the hint set when the server status changes", () => {
		const { container, rerender } = render(
			<ScrapeProgress
				mode="design"
				status="extracting"
				sourceUrl="https://www.notion.com/"
				domain="www.notion.com"
			/>,
		);
		expect(
			scrapeActivityHints("design", "extracting"),
		).toContain(activeSlotText());
		rerender(
			<ScrapeProgress
				mode="design"
				status="generating"
				sourceUrl="https://www.notion.com/"
				domain="www.notion.com"
			/>,
		);
		expect(
			scrapeActivityHints("design", "generating"),
		).toContain(activeSlotText());
		expect(authoritativeStage(container)).toBe("Menyusun DESIGN.md");
	});

	it("derives the activity timer from the persisted stage start", () => {
		const stageStartedAt = new Date(Date.now() - 14_000).toISOString();
		const { container } = render(
			<ScrapeProgress
				mode="design"
				status="capturing"
				sourceUrl="https://www.notion.com/"
				domain="www.notion.com"
				stageStartedAt={stageStartedAt}
			/>,
		);
		act(() => {
			vi.advanceTimersByTime(600);
		});
		const text =
			container.querySelector('[role="timer"]')?.textContent ?? "";
		const seconds = Number.parseFloat(text);
		expect(Number.isFinite(seconds)).toBe(true);
		expect(seconds).toBeGreaterThanOrEqual(14);
		expect(seconds).toBeLessThan(20);
	});

	it("shows browser-rendering copy for HTML capturing and no generating stage", () => {
		const { container } = render(
			<ScrapeProgress
				mode="html"
				status="capturing"
				sourceUrl="https://www.notion.com/"
				domain="www.notion.com"
			/>,
		);
		expect(
			scrapeActivityHints("html", "capturing"),
		).toContain(activeSlotText());
		expect(screen.queryByText(/Menyusun DESIGN\.md/i)).toBeNull();
		expect(screen.queryByText(/\(\d+%/)).toBeNull();
		expect(
			container
				.querySelector('[role="progressbar"]')
				?.getAttribute("aria-valuenow"),
		).toBeNull();
	});

	it("stops activity on failure while preserving retry", () => {
		const onRetry = vi.fn();
		render(
			<ScrapeProgress
				mode="html"
				status="failed"
				sourceUrl="https://www.notion.com/"
				domain="www.notion.com"
				errorMessage="Gagal memproses HTML website."
				onRetry={onRetry}
			/>,
		);
		expect(
			screen.queryByRole("status", { name: "Aktivitas berlangsung" }),
		).toBeNull();
		const retryButton = screen.getByRole("button", { name: /Coba lagi/i });
		fireEvent.click(retryButton);
		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	it("settles activity on completion without further rotation", () => {
		const { container } = render(
			<ScrapeProgress
				mode="design"
				status="completed"
				sourceUrl="https://www.notion.com/"
				domain="www.notion.com"
			/>,
		);
		expect(
			screen.queryByRole("status", { name: "Aktivitas berlangsung" }),
		).toBeNull();
		expect(screen.getByText(/siap digunakan/i)).toBeDefined();
		expect(authoritativeStage(container)).toBe("Selesai");
		const settled = container.textContent;
		act(() => {
			vi.advanceTimersByTime(10000);
		});
		expect(container.textContent).toBe(settled);
	});

	it("uses the website name as the progress heading, not the raw domain", () => {
		render(
			<ScrapeProgress
				mode="design"
				status="queued"
				sourceUrl="https://www.notion.com/"
				domain="www.notion.com"
			/>,
		);
		expect(screen.getByRole("heading", { name: "Notion" })).toBeDefined();
	});
});
