// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
	Link: ({ to, children, ...rest }: { to: string; children?: ReactNode }) =>
		createElement("a", { href: to, ...rest }, children),
}));

import { imageResultCounts } from "@/lib/scrape-images";
import { ScrapeProgress } from "../components/scrape-progress";

it("uses row counts rather than legacy saved metadata for partial image results", () => {
	const counts = imageResultCounts(
		[
			{ status: "completed", assetId: "bytes" },
			{ status: "completed", assetId: null },
			{ status: "failed" },
		],
		4,
	);
	const { container } = render(
		<ScrapeProgress
			mode="images"
			status="completed"
			imageOutcome="partial"
			savedImages={99}
			imageCounts={counts}
		/>,
	);
	const counters = Object.fromEntries(
		[...container.querySelectorAll("dl > div")].map((item) => [
			item.querySelector("dt")?.textContent,
			item.querySelector("dd")?.textContent,
		]),
	);
	expect(counters).toEqual({
		Ditemukan: "4",
		Tersimpan: "1",
		"Tautan terverifikasi": "1",
		Gagal: "1",
		Tertunda: "1",
	});
	expect(container.textContent).not.toContain("tersedia tetap tersimpan");
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

describe("connected vertical stepper", () => {
	it("marks the live stage with a real spinner, not the legacy dot", () => {
		const { container } = render(
			<ScrapeProgress mode="design" status="extracting" />,
		);
		expect(
			container.querySelector("[data-active-stage-spinner]"),
		).not.toBeNull();
		expect(container.querySelector("[data-active-stage-marker]")).toBeNull();
	});

	it("renders exactly one spinner while processing", () => {
		const { container } = render(
			<ScrapeProgress mode="design" status="generating" />,
		);
		expect(
			container.querySelectorAll("[data-active-stage-spinner]"),
		).toHaveLength(1);
	});

	it("removes the horizontal segmented progress bar entirely", () => {
		const { container } = render(
			<ScrapeProgress mode="design" status="extracting" />,
		);
		expect(
			container.querySelectorAll("[data-active-stage-segment]"),
		).toHaveLength(0);
		expect(container.textContent).not.toMatch(/\d+\s*%/);
	});

	it("connects every stage with one continuous connector per gap", () => {
		const { container } = render(
			<ScrapeProgress mode="design" status="extracting" />,
		);
		const list = screen.getByRole("list", { name: "Tahapan pemrosesan" });
		const items = list.querySelectorAll("li");
		const connectors = container.querySelectorAll("[data-step-connector]");
		expect(connectors).toHaveLength(items.length - 1);
		for (const connector of connectors) {
			expect(connector.getAttribute("data-connector-state")).toMatch(
				/^(done|active|pending)$/,
			);
		}
	});

	it("announces the live stage once through aria-current", () => {
		const { container } = render(
			<ScrapeProgress mode="design" status="extracting" />,
		);
		expect(container.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
	});

	it("marks completed stages and keeps upcoming stages neutral", () => {
		render(<ScrapeProgress mode="design" status="extracting" />);
		const list = screen.getByRole("list", { name: "Tahapan pemrosesan" });
		const items = list.querySelectorAll("li");
		expect(items).toHaveLength(6);
		expect(items[0]?.querySelector("svg")).not.toBeNull();
		expect(items[1]?.querySelector("svg")).not.toBeNull();
		expect(
			items[2]?.querySelector("[data-active-stage-spinner]"),
		).not.toBeNull();
		expect(items[3]?.querySelector("svg")).toBeNull();
		expect(items[3]?.querySelector("[data-active-stage-spinner]")).toBeNull();
	});

	it("stops the spinner once the run reaches a terminal status", () => {
		const { container } = render(
			<ScrapeProgress mode="design" status="completed" />,
		);
		expect(
			container.querySelectorAll("[data-active-stage-spinner]"),
		).toHaveLength(0);
	});
});

describe("honest stages per mode", () => {
	it("renders the full six stages for design mode", () => {
		render(<ScrapeProgress mode="design" status="extracting" />);
		expect(
			screen
				.getByRole("list", { name: "Tahapan pemrosesan" })
				.querySelectorAll("li"),
		).toHaveLength(6);
	});

	it("renders five stages for html mode", () => {
		render(<ScrapeProgress mode="html" status="extracting" />);
		expect(
			screen
				.getByRole("list", { name: "Tahapan pemrosesan" })
				.querySelectorAll("li"),
		).toHaveLength(5);
	});

	it("renders four stages for images mode", () => {
		render(<ScrapeProgress mode="images" status="extracting" />);
		expect(
			screen
				.getByRole("list", { name: "Tahapan pemrosesan" })
				.querySelectorAll("li"),
		).toHaveLength(4);
	});

	it("renders only the stages crawl actually persists", () => {
		render(<ScrapeProgress mode="crawl" status="capturing" />);
		expect(
			screen
				.getByRole("list", { name: "Tahapan pemrosesan" })
				.querySelectorAll("li"),
		).toHaveLength(3);
	});
});

describe("truthful activity", () => {
	it("shows a single waiting line while the job is still queued", () => {
		render(<ScrapeProgress mode="design" status="queued" />);
		expect(screen.getByText("Aktivitas terbaru")).toBeDefined();
		expect(screen.getAllByText(/menunggu giliran/i).length).toBeGreaterThan(0);
		expect(screen.queryByRole("timer")).toBeNull();
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

	it("reports the persisted activity verbatim without repeating the stage", () => {
		render(
			<ScrapeProgress
				mode="design"
				status="generating"
				activity="Menyusun tabel dari evidence visual"
			/>,
		);
		const leftPanel = screen.getByText("Aktivitas terbaru").parentElement;
		const rightPanel = screen.getByRole("region", {
			name: /progres DESIGN\.md/i,
		});
		expect(leftPanel?.textContent).toContain(
			"Menyusun tabel dari evidence visual",
		);
		expect(rightPanel.textContent).not.toContain(
			"Menyusun tabel dari evidence visual",
		);
	});

	it("does not fabricate counters when no counters have been persisted", () => {
		render(<ScrapeProgress mode="images" status="capturing" />);
		expect(screen.queryByText("0")).toBeNull();
		expect(screen.queryByText(/%/)).toBeNull();
	});
});

describe("failed state delegates to the shared error card", () => {
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
		expect(
			screen.getAllByRole("button", { name: "Coba lagi jika tersedia" }),
		).toHaveLength(1);
		fireEvent.click(
			screen.getByRole("button", { name: "Coba lagi jika tersedia" }),
		);
		expect(retry).toHaveBeenCalledTimes(1);
		expect(screen.queryByRole("timer")).toBeNull();
	});

	it("keeps saved results reachable through a dedicated action", () => {
		render(
			<ScrapeProgress
				mode="images"
				status="failed"
				onRetry={vi.fn()}
				partialResults={2}
				partialFailed={1}
			/>,
		);
		expect(
			screen.getByRole("button", { name: "Lihat hasil tersedia" }),
		).toBeDefined();
	});

	it("keeps the stepper mounted so the failed stage stays visible", () => {
		const { container } = render(
			<ScrapeProgress
				mode="images"
				status="failed"
				failedAtStage="extracting"
				onRetry={vi.fn()}
			/>,
		);
		const items = container.querySelectorAll("[data-step-state]");
		expect(items.length).toBeGreaterThan(0);
		expect(
			container.querySelector("[data-failed-stage-marker]"),
		).not.toBeNull();
	});

	it("disables retry while request is pending", () => {
		const retry = vi.fn();
		render(
			<ScrapeProgress
				mode="crawl"
				status="failed"
				onRetry={retry}
				isRetrying
			/>,
		);
		fireEvent.click(screen.getByRole("button"));
		expect(retry).not.toHaveBeenCalled();
	});
});

describe("layout flexibility", () => {
	it("keeps the two-panel composition by default", () => {
		const { container } = render(
			<ScrapeProgress mode="design" status="capturing" />,
		);
		expect(container.firstElementChild?.getAttribute("data-layout")).toBe(
			"two-panel",
		);
		expect(screen.getByText("Aktivitas terbaru")).toBeDefined();
		expect(
			screen.getByRole("region", { name: /progres DESIGN\.md/i }),
		).toBeDefined();
	});

	it("stacks activity above progress in single-panel composition", () => {
		const { container } = render(
			<ScrapeProgress mode="design" status="capturing" layout="single" />,
		);
		expect(container.firstElementChild?.getAttribute("data-layout")).toBe(
			"single",
		);
		expect(screen.getByText("Aktivitas terbaru")).toBeDefined();
		expect(
			screen.getByRole("region", { name: /progres DESIGN\.md/i }),
		).toBeDefined();
	});

	it("uses a gallery-aligned single panel for images", () => {
		const { container } = render(
			<ScrapeProgress mode="images" status="capturing" />,
		);
		expect(container.firstElementChild?.getAttribute("data-layout")).toBe(
			"single",
		);
		expect(
			screen.getByRole("region", { name: /progres Scrape Images/i }),
		).toBeDefined();
	});
});
