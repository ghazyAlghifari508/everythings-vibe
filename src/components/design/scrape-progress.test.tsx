// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
		container
			.querySelector('[role="progressbar"] > div')
			?.getAttribute("style") ?? ""
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
	it("shows the real backend activity, not synthetic rotating hints", () => {
		render(
			<ScrapeProgress
				mode="design"
				status="generating"
				sourceUrl="https://www.notion.com/"
				domain="www.notion.com"
				activity="Memvalidasi DESIGN.md"
			/>,
		);
		expect(activeSlotText()).toContain("Memvalidasi DESIGN.md");
	});

	it("does not rotate synthetic activity text while polling", () => {
		render(
			<ScrapeProgress
				mode="design"
				status="generating"
				sourceUrl="https://www.notion.com/"
				domain="www.notion.com"
				activity="Memvalidasi DESIGN.md"
				activityStartedAt={new Date(Date.now() - 3000).toISOString()}
			/>,
		);
		const before = activeSlotText();
		act(() => {
			vi.advanceTimersByTime(12000);
		});
		expect(activeSlotText()).toBe(before);
	});

	it("changes activity only when backend metadata changes", () => {
		const { rerender } = render(
			<ScrapeProgress
				mode="design"
				status="generating"
				sourceUrl="https://www.notion.com/"
				domain="www.notion.com"
				activity="Memvalidasi DESIGN.md"
			/>,
		);
		expect(activeSlotText()).toContain("Memvalidasi DESIGN.md");
		rerender(
			<ScrapeProgress
				mode="design"
				status="generating"
				sourceUrl="https://www.notion.com/"
				domain="www.notion.com"
				activity="Memperbaiki bagian DESIGN.md yang belum lengkap"
			/>,
		);
		expect(activeSlotText()).toContain(
			"Memperbaiki bagian DESIGN.md yang belum lengkap",
		);
	});

	it("keeps the same activity stable while polling with unchanged metadata", () => {
		const { rerender } = render(
			<ScrapeProgress
				mode="design"
				status="generating"
				sourceUrl="https://www.notion.com/"
				domain="www.notion.com"
				activity="Menyimpan hasil"
				activityStartedAt={new Date(Date.now() - 2000).toISOString()}
			/>,
		);
		const first = activeSlotText();
		rerender(
			<ScrapeProgress
				mode="design"
				status="saving"
				sourceUrl="https://www.notion.com/"
				domain="www.notion.com"
				activity="Menyimpan hasil"
				activityStartedAt={new Date(Date.now() - 2000).toISOString()}
			/>,
		);
		expect(activeSlotText()).toBe(first);
	});

	it("derives the activity timer from the persisted activity start", () => {
		const activityStartedAt = new Date(Date.now() - 14000).toISOString();
		const { container } = render(
			<ScrapeProgress
				mode="design"
				status="capturing"
				sourceUrl="https://www.notion.com/"
				domain="www.notion.com"
				activity="Membuka website"
				activityStartedAt={activityStartedAt}
			/>,
		);
		act(() => {
			vi.advanceTimersByTime(600);
		});
		const text = container.querySelector('[role="timer"]')?.textContent ?? "";
		const seconds = Number.parseFloat(text);
		expect(Number.isFinite(seconds)).toBe(true);
		expect(seconds).toBeGreaterThanOrEqual(14);
		expect(seconds).toBeLessThan(20);
	});

	it("falls back to stageStartedAt when no activity timestamp exists", () => {
		const stageStartedAt = new Date(Date.now() - 8000).toISOString();
		const { container } = render(
			<ScrapeProgress
				mode="design"
				status="capturing"
				sourceUrl="https://www.notion.com/"
				domain="www.notion.com"
				activity="Membuka website"
				stageStartedAt={stageStartedAt}
			/>,
		);
		act(() => {
			vi.advanceTimersByTime(400);
		});
		const text = container.querySelector('[role="timer"]')?.textContent ?? "";
		expect(Number.parseFloat(text)).toBeGreaterThanOrEqual(8);
	});

	it("keeps the authoritative stage fixed when only activity changes", () => {
		const { container, rerender } = render(
			<ScrapeProgress
				mode="design"
				status="generating"
				sourceUrl="https://www.notion.com/"
				domain="www.notion.com"
				activity="Memvalidasi DESIGN.md"
			/>,
		);
		const stageBefore = authoritativeStage(container);
		const fillBefore = progressbarFill(container);
		rerender(
			<ScrapeProgress
				mode="design"
				status="generating"
				sourceUrl="https://www.notion.com/"
				domain="www.notion.com"
				activity="2 bagian belum lengkap"
			/>,
		);
		expect(authoritativeStage(container)).toBe(stageBefore);
		expect(progressbarFill(container)).toBe(fillBefore);
	});

	it("advances the stage tracker only from real status changes", () => {
		const { container, rerender } = render(
			<ScrapeProgress
				mode="design"
				status="extracting"
				sourceUrl="https://www.notion.com/"
				domain="www.notion.com"
				activity="Menganalisis design system"
			/>,
		);
		expect(authoritativeStage(container)).toBe("Menganalisis visual");
		rerender(
			<ScrapeProgress
				mode="design"
				status="generating"
				sourceUrl="https://www.notion.com/"
				domain="www.notion.com"
				activity="Menghasilkan draft DESIGN.md"
			/>,
		);
		expect(authoritativeStage(container)).toBe("Menyusun DESIGN.md");
	});

	it("preserves activity and timer across a remount with the same persisted metadata", () => {
		const activityStartedAt = new Date(Date.now() - 5000).toISOString();
		const first = render(
			<ScrapeProgress
				mode="design"
				status="generating"
				sourceUrl="https://www.notion.com/"
				domain="www.notion.com"
				activity="Memvalidasi DESIGN.md"
				activityStartedAt={activityStartedAt}
			/>,
		);
		const slotText = activeSlotText();
		first.unmount();
		render(
			<ScrapeProgress
				mode="design"
				status="generating"
				sourceUrl="https://www.notion.com/"
				domain="www.notion.com"
				activity="Memvalidasi DESIGN.md"
				activityStartedAt={activityStartedAt}
			/>,
		);
		expect(activeSlotText()).toBe(slotText);
	});

	it("stops the active timer on failure while preserving retry", () => {
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
		expect(screen.queryByRole("timer")).toBeNull();
		const retryButton = screen.getByRole("button", { name: /Coba lagi/i });
		fireEvent.click(retryButton);
		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	it("stops the active timer on completion without further rotation", () => {
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
		expect(screen.queryByRole("timer")).toBeNull();
		expect(screen.getByText(/siap digunakan/i)).toBeDefined();
		expect(authoritativeStage(container)).toBe("Selesai");
		const settled = container.textContent;
		act(() => {
			vi.advanceTimersByTime(10000);
		});
		expect(container.textContent).toBe(settled);
	});

	it("renders no activity slot when the backend has not emitted one yet", () => {
		render(
			<ScrapeProgress
				mode="design"
				status="queued"
				sourceUrl="https://www.notion.com/"
				domain="www.notion.com"
			/>,
		);
		expect(
			screen.queryByRole("status", { name: "Aktivitas berlangsung" }),
		).toBeNull();
		expect(screen.queryByRole("timer")).toBeNull();
	});

	it("still shows browser captures through the same real activity path", () => {
		const { container } = render(
			<ScrapeProgress
				mode="html"
				status="capturing"
				sourceUrl="https://www.notion.com/"
				domain="www.notion.com"
				activity="Menangkap DOM hasil render"
			/>,
		);
		expect(activeSlotText()).toContain("Menangkap DOM hasil render");
		expect(screen.queryByText(/Menyusun DESIGN\.md/i)).toBeNull();
		expect(screen.queryByText(/\(\d+%/)).toBeNull();
		expect(
			container
				.querySelector('[role="progressbar"]')
				?.getAttribute("aria-valuenow"),
		).toBeNull();
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
