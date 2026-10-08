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

function activeSlotText(): string {
	return (
		screen.getByRole("status", { name: "Aktivitas berlangsung" }).textContent ??
		""
	);
}

function authoritativeStage(container: HTMLElement): string {
	return container.querySelector('[aria-current="step"]')?.textContent ?? "";
}
function progressSegmentStates(container: HTMLElement): string[] {
	return Array.from(
		container.querySelectorAll("[data-segment-state]"),
		(segment) => segment.getAttribute("data-segment-state") ?? "",
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
		expect(
			screen.getByRole("progressbar", { name: "Kemajuan pemrosesan" }),
		).toBeDefined();
	});

	it("renders indeterminate stage-aligned progress without a numeric value", () => {
		const { container } = render(
			<ScrapeProgress
				mode="html"
				status="capturing"
				sourceUrl="https://www.notion.com/"
				domain="www.notion.com"
			/>,
		);
		const progressbar = screen.getByRole("progressbar", {
			name: "Kemajuan pemrosesan",
		});
		expect(progressbar.getAttribute("aria-valuenow")).toBeNull();
		expect(progressbar.textContent).not.toMatch(/%/);
		expect(progressSegmentStates(container)).toEqual([
			"complete",
			"active",
			"upcoming",
			"upcoming",
			"upcoming",
		]);
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

	it("keeps backend activity static while dots and the active stage stay in motion", () => {
		const props = {
			mode: "design" as const,
			status: "generating" as const,
			sourceUrl: "https://www.notion.com/",
			domain: "www.notion.com",
			activity: "Memvalidasi DESIGN.md",
			activityStartedAt: new Date(Date.now() - 3000).toISOString(),
		};
		const { container, rerender } = render(<ScrapeProgress {...props} />);
		const activityBefore = activeSlotText();
		act(() => {
			vi.advanceTimersByTime(120000);
		});
		rerender(<ScrapeProgress {...props} />);
		expect(activeSlotText()).toBe(activityBefore);
		expect(container.querySelectorAll("[data-activity-dot]")).toHaveLength(3);
		expect(container.querySelectorAll("[data-stage-motion]")).toHaveLength(2);
	});

	it("marks activity dots decorative so their animation is not announced", () => {
		const { container } = render(
			<ScrapeProgress
				mode="design"
				status="generating"
				sourceUrl="https://www.notion.com/"
				activity="Memvalidasi DESIGN.md"
			/>,
		);
		expect(
			container.querySelector('[aria-hidden="true"] [data-activity-dot]'),
		).not.toBeNull();
	});

	it("preserves the persisted stage position when only activity metadata changes", () => {
		const { container, rerender } = render(
			<ScrapeProgress
				mode="design"
				status="generating"
				sourceUrl="https://www.notion.com/"
				activity="Memvalidasi DESIGN.md"
			/>,
		);
		const segmentsBefore = progressSegmentStates(container);
		rerender(
			<ScrapeProgress
				mode="design"
				status="generating"
				sourceUrl="https://www.notion.com/"
				activity="Menyusun token yang belum lengkap"
			/>,
		);
		expect(authoritativeStage(container)).toBe("Menyusun DESIGN.md");
		expect(progressSegmentStates(container)).toEqual(segmentsBefore);
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
		expect(
			container.querySelector('[role="timer"]')?.getAttribute("aria-live"),
		).toBeNull();
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

	it("preserves activity and persisted timer across a remount", () => {
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
		const initialTimer = Number.parseFloat(
			first.container.querySelector('[role="timer"]')?.textContent ?? "",
		);
		act(() => {
			vi.advanceTimersByTime(1200);
		});
		const polledTimer = Number.parseFloat(
			first.container.querySelector('[role="timer"]')?.textContent ?? "",
		);
		expect(polledTimer).toBeGreaterThan(initialTimer);
		const slotText = activeSlotText();
		first.unmount();
		const remounted = render(
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
		expect(
			Number.parseFloat(
				remounted.container.querySelector('[role="timer"]')?.textContent ?? "",
			),
		).toBeGreaterThanOrEqual(polledTimer);
	});
	it("stops the active timer on failure while preserving retry", () => {
		const onRetry = vi.fn();
		const { container } = render(
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
		expect(container.querySelectorAll("[data-activity-dot]")).toHaveLength(0);
		expect(container.querySelectorAll("[data-stage-motion]")).toHaveLength(0);
		fireEvent.click(screen.getByRole("button", { name: /Coba lagi/i }));
		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	it("stops all progress motion on completion", () => {
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
		expect(container.querySelectorAll("[data-activity-dot]")).toHaveLength(0);
		expect(container.querySelectorAll("[data-stage-motion]")).toHaveLength(0);
		expect(screen.getByText(/siap digunakan/i)).toBeDefined();
		expect(screen.getAllByText("Selesai")).toHaveLength(2);
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
		render(
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
			screen.getByRole("progressbar", { name: "Kemajuan pemrosesan" }),
		).toBeDefined();
	});

	it("keeps stage completion and current position tied to persisted status", () => {
		const { container } = render(
			<ScrapeProgress
				mode="design"
				status="extracting"
				sourceUrl="https://www.notion.com/"
				domain="www.notion.com"
			/>,
		);
		const stages = Array.from(container.querySelectorAll("ol li"), (item) =>
			item.getAttribute("data-stage-state"),
		);
		expect(stages).toEqual([
			"complete",
			"complete",
			"active",
			"upcoming",
			"upcoming",
			"upcoming",
		]);
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
