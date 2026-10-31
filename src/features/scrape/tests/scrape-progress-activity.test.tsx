// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	SCRAPE_ACTIVITY_DONE_COPY,
	SCRAPE_ACTIVITY_WAITING_COPY,
	ScrapeActivityLine,
} from "../components/scrape-progress-activity";

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

function timerText(container: HTMLElement): string | null {
	return container.querySelector('[role="timer"]')?.textContent ?? null;
}

function advance(ms: number) {
	act(() => {
		vi.advanceTimersByTime(ms);
	});
}

describe("queued runs stay honest and still", () => {
	it("waits with copy and no loading accent or clock", () => {
		const { container } = render(
			<ScrapeActivityLine
				status="queued"
				stageStartedAt="2026-01-01T00:00:00Z"
			/>,
		);
		const line = container.querySelector("[data-activity-line]");
		expect(line?.getAttribute("data-activity-state")).toBe("queued");
		expect(line?.textContent).toContain(SCRAPE_ACTIVITY_WAITING_COPY);
		expect(container.querySelector("[data-activity-spinner]")).toBeNull();
		expect(container.querySelector("[data-working]")).toBeNull();
		expect(container.querySelector('[role="timer"]')).toBeNull();
	});
});

describe("running runs report the backend activity", () => {
	it("shows one circular accent beside the reported activity", () => {
		const { container } = render(
			<ScrapeActivityLine
				status="extracting"
				activity="Menyusun analisis desain"
				fallbackLabel="Memeriksa hasil"
			/>,
		);
		expect(
			container
				.querySelector("[data-activity-state]")
				?.getAttribute("data-activity-state"),
		).toBe("running");
		expect(container.querySelectorAll("[data-activity-spinner]")).toHaveLength(
			1,
		);
		expect(container.textContent).toContain("Menyusun analisis desain");
	});

	it("shimmers the activity text only while the stage is running", () => {
		const { container } = render(
			<ScrapeActivityLine status="extracting" activity="Memeriksa gaya" />,
		);
		expect(container.querySelectorAll("[data-shimmer]")).toHaveLength(1);
		cleanup();
		const done = render(<ScrapeActivityLine status="completed" />);
		expect(done.container.querySelectorAll("[data-shimmer]")).toHaveLength(1);
		// The shimmer only paints while the shared line is in its working state.
		expect(done.container.querySelector("[data-working]")).toBeNull();
	});

	it("swaps the copy on the next report without adding indicators", () => {
		const { container, rerender } = render(
			<ScrapeActivityLine
				status="extracting"
				activity="Mengambil tampilan halaman"
			/>,
		);
		expect(container.textContent).toContain("Mengambil tampilan halaman");

		rerender(
			<ScrapeActivityLine
				status="extracting"
				activity="Memeriksa gaya dan komponen"
			/>,
		);
		expect(container.textContent).toContain("Memeriksa gaya dan komponen");
		expect(container.textContent).not.toContain("Mengambil tampilan halaman");
		expect(container.querySelectorAll("[data-activity-spinner]")).toHaveLength(
			1,
		);
	});

	it("falls back to the reported stage label when no activity arrived", () => {
		const { container } = render(
			<ScrapeActivityLine
				status="capturing"
				fallbackLabel="Mengambil halaman"
			/>,
		);
		expect(container.textContent).toContain("Mengambil halaman");
	});

	it("keeps long activity copy whole instead of truncating it", () => {
		const long = `${"Memeriksa komponen dan gaya visual halaman ".repeat(6)}selesai`;
		const { container } = render(
			<ScrapeActivityLine status="extracting" activity={long} />,
		);
		expect(container.textContent).toContain(long);
		expect(container.textContent).not.toContain("…");
	});
});

describe("the clock measures the stage, not the activity string", () => {
	it("keeps counting when only the activity label changes", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
		const { container, rerender } = render(
			<ScrapeActivityLine
				status="extracting"
				activity="Mengambil tampilan halaman"
				activityStartedAt="2026-01-01T00:00:00.000Z"
			/>,
		);
		advance(3000);
		expect(timerText(container)).toBe("3.0s");

		rerender(
			<ScrapeActivityLine
				status="extracting"
				activity="Memeriksa gaya dan komponen"
				activityStartedAt="2026-01-01T00:00:00.000Z"
			/>,
		);
		advance(1000);
		expect(timerText(container)).toBe("4.0s");
	});

	it("ignores a later activity timestamp while the stage is unchanged", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
		const { container, rerender } = render(
			<ScrapeActivityLine
				status="extracting"
				activity="Memeriksa gaya dan komponen"
				activityStartedAt="2026-01-01T00:00:00.000Z"
			/>,
		);
		advance(2000);
		expect(timerText(container)).toBe("2.0s");

		// A new activity write also rewrites activityStartedAt; the stage did not
		// move, so the clock must not jump back to zero.
		rerender(
			<ScrapeActivityLine
				status="extracting"
				activity="Menyusun analisis desain"
				activityStartedAt="2026-01-01T00:00:09.000Z"
			/>,
		);
		expect(timerText(container)).toBe("2.0s");
	});

	it("re-anchors when the stage itself advances", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
		const { container, rerender } = render(
			<ScrapeActivityLine
				status="extracting"
				activity="Memeriksa gaya dan komponen"
				activityStartedAt="2026-01-01T00:00:00.000Z"
			/>,
		);
		advance(4000);
		expect(timerText(container)).toBe("4.0s");

		rerender(
			<ScrapeActivityLine
				status="generating"
				activity="Menyusun analisis desain"
				activityStartedAt="2026-01-01T00:00:04.000Z"
			/>,
		);
		expect(timerText(container)).toBe("0.0s");
		advance(1500);
		expect(timerText(container)).toBe("1.5s");
	});

	it("prefers the persisted stage start over the activity start", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:10Z"));
		const { container } = render(
			<ScrapeActivityLine
				status="extracting"
				activity="Memeriksa gaya dan komponen"
				stageStartedAt="2026-01-01T00:00:00.000Z"
				activityStartedAt="2026-01-01T00:00:09.000Z"
			/>,
		);
		expect(timerText(container)).toBe("10.0s");
	});

	it("keeps the measured stage time across unmount and remount", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:05Z"));
		const first = render(
			<ScrapeActivityLine
				status="extracting"
				activity="Memeriksa gaya dan komponen"
				stageStartedAt="2026-01-01T00:00:00.000Z"
			/>,
		);
		expect(timerText(first.container)).toBe("5.0s");
		first.unmount();

		vi.setSystemTime(new Date("2026-01-01T00:00:07Z"));
		const second = render(
			<ScrapeActivityLine
				status="extracting"
				activity="Menyusun analisis desain"
				stageStartedAt="2026-01-01T00:00:00.000Z"
			/>,
		);
		expect(timerText(second.container)).toBe("7.0s");
	});
});

describe("terminal and stalled runs stop animating", () => {
	it("settles on a static done line", () => {
		const { container } = render(
			<ScrapeActivityLine
				status="completed"
				activity="Menyimpan hasil"
				stageStartedAt="2026-01-01T00:00:00Z"
			/>,
		);
		const line = container.querySelector("[data-activity-line]");
		expect(line?.getAttribute("data-activity-state")).toBe("completed");
		expect(line?.textContent).toContain(SCRAPE_ACTIVITY_DONE_COPY);
		expect(container.querySelector("[data-activity-spinner]")).toBeNull();
		expect(
			container.querySelector("[data-activity-done-marker]"),
		).not.toBeNull();
		expect(container.querySelector("[data-working]")).toBeNull();
		expect(container.querySelector('[role="timer"]')).toBeNull();
	});

	it("leaves the failure reason to the progress panel", () => {
		const { container } = render(
			<ScrapeActivityLine status="failed" activity="Membuka website" />,
		);
		expect(container.querySelector("[data-activity-line]")).toBeNull();
		expect(container.querySelector("[data-activity-spinner]")).toBeNull();
	});

	it("reports the server stall instead of shimmering", () => {
		const stall =
			"Pemrosesan berhenti mengirim pembaruan. Sistem akan mencoba melanjutkan proses ini secara otomatis.";
		const { container } = render(
			<ScrapeActivityLine
				status="extracting"
				activity="Memeriksa gaya dan komponen"
				stageStartedAt="2026-01-01T00:00:00Z"
				stalledMessage={stall}
			/>,
		);
		const line = container.querySelector("[data-activity-line]");
		expect(line?.getAttribute("data-activity-state")).toBe("stalled");
		expect(line?.textContent).toBe(stall);
		expect(container.querySelector("[data-activity-spinner]")).toBeNull();
		expect(container.querySelector("[data-working]")).toBeNull();
		expect(container.querySelector('[role="timer"]')).toBeNull();
	});
});
