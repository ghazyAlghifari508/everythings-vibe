// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	resolveScrapeOrbState,
	SCRAPE_ACTIVITY_DONE_COPY,
	SCRAPE_ACTIVITY_WAITING_COPY,
	ScrapeActivityLine,
} from "../components/scrape-progress-activity";
import { installScrapeOrbEnvironment } from "./scrape-activity-orb-env";

installScrapeOrbEnvironment();

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

function orbState(container: HTMLElement): string | null {
	return (
		container
			.querySelector("[data-activity-orb]")
			?.getAttribute("data-activity-orb") ?? null
	);
}

function timerText(container: HTMLElement): string | null {
	return container.querySelector('[role="timer"]')?.textContent ?? null;
}

function advance(ms: number) {
	act(() => {
		vi.advanceTimersByTime(ms);
	});
}

describe("queued runs stay honest and still", () => {
	it("waits with honest copy and a waiting orb, no spinner and no clock", () => {
		const { container } = render(
			<ScrapeActivityLine
				status="queued"
				stageStartedAt="2026-01-01T00:00:00Z"
			/>,
		);
		const line = container.querySelector("[data-activity-line]");
		expect(line?.getAttribute("data-activity-state")).toBe("queued");
		expect(line?.textContent).toContain(SCRAPE_ACTIVITY_WAITING_COPY);
		expect(orbState(container)).toBe("waiting");
		expect(container.querySelector("[data-activity-orb] > svg")).not.toBeNull();
		expect(container.querySelector("[data-activity-spinner]")).toBeNull();
		expect(container.querySelector("[data-working]")).toBeNull();
		expect(container.querySelector('[role="timer"]')).toBeNull();
	});
});

describe("running runs report the backend activity", () => {
	it("shows one orb beside the reported activity and no spinner", () => {
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
		expect(container.querySelectorAll("[data-activity-orb]")).toHaveLength(1);
		expect(orbState(container)).toBe("working");
		expect(container.querySelector("[data-activity-orb] > svg")).not.toBeNull();
		expect(container.querySelectorAll("[data-activity-spinner]")).toHaveLength(
			0,
		);
		expect(container.textContent).toContain("Menyusun analisis desain");
	});

	it("keeps every spinner out of the activity line", () => {
		const { container } = render(
			<ScrapeActivityLine
				status="generating"
				activity="Menyusun analisis desain"
			/>,
		);
		const line = container.querySelector("[data-activity-line]");
		expect(line?.querySelector('[class*="animate-spin"]')).toBeNull();
		expect(line?.querySelector("[data-activity-spinner]")).toBeNull();
		expect(line?.querySelector("[data-activity-orb]")).not.toBeNull();
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
		// A new activity string must not spawn a second indicator.
		expect(container.querySelectorAll("[data-activity-orb]")).toHaveLength(1);
		expect(container.querySelectorAll("[data-activity-spinner]")).toHaveLength(
			0,
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
		expect(container.querySelector("[data-activity-orb]")).toBeNull();
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
		expect(container.querySelector("[data-activity-orb]")).toBeNull();
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
		// A stalled run is never dressed up as healthy reasoning.
		expect(container.querySelector("[data-activity-orb]")).toBeNull();
		expect(container.querySelector("[data-working]")).toBeNull();
		expect(container.querySelector('[role="timer"]')).toBeNull();
	});
});

describe("status to orb state mapping", () => {
	it("maps each stage to the work that stage really does", () => {
		expect(resolveScrapeOrbState("queued")).toBe("waiting");
		expect(resolveScrapeOrbState("capturing")).toBe("using");
		expect(resolveScrapeOrbState("extracting")).toBe("working");
		expect(resolveScrapeOrbState("generating")).toBe("reasoning");
		expect(resolveScrapeOrbState("saving")).toBe("working");
	});

	it("claims reasoning only for the AI synthesis stage", () => {
		const reasoning = (
			["queued", "capturing", "extracting", "generating", "saving"] as const
		).filter((status) => resolveScrapeOrbState(status) === "reasoning");
		expect(reasoning).toEqual(["generating"]);
	});

	it("leaves completed and failed without an orb", () => {
		expect(resolveScrapeOrbState("completed")).toBeNull();
		expect(resolveScrapeOrbState("failed")).toBeNull();
	});

	it("renders the mapped orb for every running stage", () => {
		for (const [status, expected] of [
			["capturing", "using"],
			["extracting", "working"],
			["generating", "reasoning"],
			["saving", "working"],
		] as const) {
			const { container } = render(
				<ScrapeActivityLine status={status} activity="Aktivitas" />,
			);
			expect(orbState(container)).toBe(expected);
			cleanup();
		}
	});
});

describe("long-running work stays honest", () => {
	it("keeps one real label and one clock for two minutes of synthesis", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
		const { container } = render(
			<ScrapeActivityLine
				status="generating"
				activity="Menyusun analisis desain"
				stageStartedAt="2026-01-01T00:00:00.000Z"
			/>,
		);
		advance(120_000);

		// The label is the backend's own activity: it neither rotates on a timer
		// nor drifts into invented sub-steps, and the orb keeps the same state.
		expect(container.textContent).toContain("Menyusun analisis desain");
		expect(container.querySelectorAll("[data-activity-orb]")).toHaveLength(1);
		expect(orbState(container)).toBe("reasoning");
		expect(timerText(container)).toBe("120.0s");
	});
});
