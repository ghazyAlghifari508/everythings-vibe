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
		expect(screen.queryByText(/\(\d+%/)).toBeNull();
	});
	const stageCases = [
		{
			mode: "design",
			status: "queued",
			position: "1",
			total: "6",
			label: "Menunggu",
		},
		{
			mode: "design",
			status: "capturing",
			position: "2",
			total: "6",
			label: "Mengambil halaman",
		},
		{
			mode: "design",
			status: "extracting",
			position: "3",
			total: "6",
			label: "Menganalisis visual",
		},
		{
			mode: "design",
			status: "generating",
			position: "4",
			total: "6",
			label: "Menyusun DESIGN.md",
		},
		{
			mode: "design",
			status: "saving",
			position: "5",
			total: "6",
			label: "Menyimpan hasil",
		},
		{
			mode: "html",
			status: "queued",
			position: "1",
			total: "5",
			label: "Menunggu",
		},
		{
			mode: "html",
			status: "capturing",
			position: "2",
			total: "5",
			label: "Mengambil halaman",
		},
		{
			mode: "html",
			status: "extracting",
			position: "3",
			total: "5",
			label: "Menyiapkan preview",
		},
		{
			mode: "html",
			status: "saving",
			position: "4",
			total: "5",
			label: "Menyimpan index.html",
		},
	] as const;

	it.each(
		stageCases,
	)("reports the persisted $mode stage $status as position $position of $total", ({
		mode,
		status,
		position,
		total,
		label,
	}) => {
		render(<ScrapeProgress mode={mode} status={status} />);
		const progressbar = screen.getByRole("progressbar");
		expect(progressbar.getAttribute("aria-valuenow")).toBe(position);
		expect(progressbar.getAttribute("aria-valuemax")).toBe(total);
		expect(progressbar.getAttribute("aria-valuemin")).toBe("1");
		expect(
			screen.getByText(label, { selector: 'li[aria-current="step"] span' }),
		).toBeDefined();
	});

	it("keeps the active dots and persisted timer through long unchanged activity", () => {
		const activityStartedAt = new Date(Date.now() - 12_000).toISOString();
		const { container, rerender } = render(
			<ScrapeProgress
				mode="design"
				status="generating"
				activity="Memvalidasi DESIGN.md"
				activityStartedAt={activityStartedAt}
			/>,
		);
		const activity = screen.getByRole("status", {
			name: "Aktivitas berlangsung",
		});
		const indicator = container.querySelector(
			'[data-testid="scrape-active-indicator"]',
		);
		expect(activity.textContent).toBe("Memvalidasi DESIGN.md");
		expect(indicator?.children).toHaveLength(3);
		expect(indicator?.getAttribute("aria-hidden")).toBe("true");
		act(() => vi.advanceTimersByTime(60_000));
		rerender(
			<ScrapeProgress
				mode="design"
				status="generating"
				activity="Memvalidasi DESIGN.md"
				activityStartedAt={activityStartedAt}
			/>,
		);
		expect(
			container.querySelector('[data-testid="scrape-active-indicator"]')
				?.children,
		).toHaveLength(3);
		const timer = screen.getByRole("timer");
		expect(Number.parseFloat(timer.textContent ?? "")).toBeGreaterThanOrEqual(
			72,
		);
		expect(timer.getAttribute("aria-live")).toBeNull();
		expect(activity.getAttribute("aria-live")).toBe("polite");
	});

	it("uses reduced-motion variants for the active bar and dots", () => {
		const { container } = render(
			<ScrapeProgress mode="design" status="capturing" />,
		);
		const progressbar = screen.getByRole("progressbar");
		const activeSegment = progressbar.querySelector(
			"[data-active-stage-segment]",
		);
		const indicator = container.querySelector(
			'[data-testid="scrape-active-indicator"]',
		);
		expect(activeSegment?.className).toContain("motion-safe:");
		expect(activeSegment?.className).toContain("motion-reduce:animate-none");
		expect(indicator?.children).toHaveLength(3);
		for (const dot of indicator?.children ?? []) {
			expect(dot.className).toContain("motion-safe:animate-pulse");
			expect(dot.className).toContain("motion-reduce:animate-none");
		}
		const activeStage = container.querySelector('[aria-current="step"]');
		expect(activeStage?.querySelector("svg")?.getAttribute("class")).toContain(
			"motion-safe:animate-spin",
		);
		expect(activeStage?.querySelector("svg")?.getAttribute("class")).toContain(
			"motion-reduce:animate-none",
		);
	});

	it("disables retry spinner motion for reduced motion preferences", () => {
		render(
			<ScrapeProgress
				mode="html"
				status="failed"
				errorMessage="Gagal memproses HTML website."
				onRetry={() => {}}
				isRetrying
			/>,
		);
		expect(
			screen
				.getByRole("button", { name: /Coba lagi/i })
				.querySelector("svg")
				?.getAttribute("class"),
		).toContain("motion-reduce:animate-none");
	});

	it("does not keep an active progress indicator after a terminal state", () => {
		const { container, rerender } = render(
			<ScrapeProgress
				mode="design"
				status="generating"
				activity="Menyusun dokumen"
				activityStartedAt={new Date().toISOString()}
			/>,
		);
		rerender(<ScrapeProgress mode="design" status="completed" />);
		const progressbar = screen.getByRole("progressbar");
		expect(progressbar.getAttribute("aria-valuenow")).toBe(
			progressbar.getAttribute("aria-valuemax"),
		);
		expect(progressbar.querySelector("[data-active-stage-segment]")).toBeNull();
		expect(
			container.querySelector('[data-testid="scrape-active-indicator"]'),
		).toBeNull();
		expect(screen.queryByRole("timer")).toBeNull();
		rerender(<ScrapeProgress mode="design" status="failed" />);
		expect(screen.queryByRole("progressbar")).toBeNull();
		expect(
			container.querySelector('[data-testid="scrape-active-indicator"]'),
		).toBeNull();
		expect(screen.queryByRole("timer")).toBeNull();
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
		expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
			"2",
		);
	});

	it("keeps completed stage labels muted while the active stage stays strongest", () => {
		const { container } = render(
			<ScrapeProgress
				mode="design"
				status="extracting"
				sourceUrl="https://www.notion.com/"
				domain="www.notion.com"
			/>,
		);
		const items = container.querySelectorAll("ol li");
		expect(items.length).toBeGreaterThanOrEqual(4);
		for (const done of [items[0], items[1]]) {
			expect(done.className).toContain("text-fog");
			expect(done.className).not.toContain("emerald");
			const icon = done.querySelector("svg");
			expect(icon?.getAttribute("class") ?? "").toContain("text-emerald-500");
		}
		const active = items[2];
		expect(active.className).toContain("text-snow");
		expect(active.className).toContain("font-semibold");
		const future = items[3];
		expect(future.className).toContain("text-fog/60");
		expect(future.className).not.toContain("emerald");
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
