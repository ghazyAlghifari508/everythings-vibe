// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
	Link: ({ to, children, ...rest }: { to: string; children?: ReactNode }) =>
		createElement("a", { href: to, ...rest }, children),
}));

import { imageResultCounts } from "@/features/scrape/utils/scrape-images";
import { ScrapeProgress } from "../components/scrape-progress";

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

function activityArea(container: HTMLElement): HTMLElement | null {
	return container.querySelector("[data-activity-line]");
}

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

describe("connected vertical stepper", () => {
	it("marks the live stage with a circular spinner, not the hourglass", () => {
		const { container } = render(
			<ScrapeProgress mode="design" status="extracting" />,
		);
		const spinner = container.querySelector("[data-active-stage-spinner]");
		expect(spinner).not.toBeNull();
		expect(spinner?.getAttribute("class")).toContain("animate-spin");
		// Loading01Icon (the old marker) is an hourglass; its body path starts
		// with the top triangle. The circular arc never does.
		const path = spinner?.querySelector("path")?.getAttribute("d") ?? "";
		expect(path.startsWith("M17.2014 2H6.79876")).toBe(false);
		expect(container.querySelector("[data-active-stage-marker]")).toBeNull();
	});

	it("renders exactly one stage spinner while processing", () => {
		const { container } = render(
			<ScrapeProgress mode="design" status="generating" />,
		);
		expect(
			container.querySelectorAll("[data-active-stage-spinner]"),
		).toHaveLength(1);
	});

	it("spins from the moment the request is queued", () => {
		const { container } = render(
			<ScrapeProgress mode="design" status="queued" />,
		);
		expect(
			container.querySelectorAll("[data-active-stage-spinner]"),
		).toHaveLength(1);
		expect(container.querySelector("[data-waiting-stage-marker]")).toBeNull();
		expect(container.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
		// The marker spins, but the copy still says the worker has not started, so
		// the UI never claims a capture that has not happened.
		expect(screen.getByText("Dalam antrean")).toBeDefined();
		expect(screen.getByText("Menunggu giliran pemrosesan.")).toBeDefined();
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

	it("describes only stages that already ran or are running", () => {
		const { container } = render(
			<ScrapeProgress mode="design" status="extracting" />,
		);
		const states = [...container.querySelectorAll("[data-step-state]")];
		for (const item of states) {
			const state = item.getAttribute("data-step-state");
			const description = item.querySelector("[data-step-description]");
			if (state === "pending") expect(description).toBeNull();
			else expect(description).not.toBeNull();
		}
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
	it("shows one waiting line while the job is still queued", () => {
		render(<ScrapeProgress mode="design" status="queued" />);
		expect(screen.getByText("Aktivitas terbaru")).toBeDefined();
		expect(screen.getByText("Menunggu giliran pemrosesan.")).toBeDefined();
		expect(screen.queryByRole("timer")).toBeNull();
	});

	it("shows the server stall message while the queue is stuck", () => {
		render(
			<ScrapeProgress
				mode="design"
				status="queued"
				workerHealth="Permintaan belum mulai diproses karena kapasitas pemrosesan sedang penuh."
			/>,
		);
		expect(
			screen.getByText(
				"Permintaan belum mulai diproses karena kapasitas pemrosesan sedang penuh.",
			),
		).toBeDefined();
		expect(screen.queryByText("Menunggu giliran pemrosesan.")).toBeNull();
	});

	it("humanises the persisted activity without repeating internal wording", () => {
		const { container } = render(
			<ScrapeProgress
				mode="design"
				status="generating"
				activity="Menyusun tabel dari evidence visual"
			/>,
		);
		const activity = activityArea(container);
		expect(activity?.textContent).toContain(
			"Menyusun tabel dari data tampilan",
		);
		expect(container.textContent).not.toContain("evidence visual");
	});

	it("collapses capture metadata into a readable view counter", () => {
		const { container } = render(
			<ScrapeProgress
				mode="design"
				status="capturing"
				activity="Menunggu resource halaman: 390x844, light (2/2)"
			/>,
		);
		expect(activityArea(container)?.textContent).toContain(
			"Memuat tampilan mobile · 2 dari 2",
		);
		expect(container.textContent).not.toContain("390x844");
		expect(container.textContent).not.toContain("light (2/2)");
	});

	it("never prints a raw URL as activity copy", () => {
		const { container } = render(
			<ScrapeProgress
				mode="images"
				status="extracting"
				activity="https://cdn.example.com/hero.png"
			/>,
		);
		expect(activityArea(container)?.textContent).toContain("Memeriksa gambar");
		expect(container.textContent).not.toContain("cdn.example.com");
	});

	it("falls back to the active stage label when the activity is unknown", () => {
		const { container } = render(
			<ScrapeProgress
				mode="design"
				status="generating"
				activity="internal_string_without_public_copy"
			/>,
		);
		expect(activityArea(container)?.textContent).toContain(
			"Menyusun DESIGN.md",
		);
		expect(container.textContent).not.toContain(
			"internal_string_without_public_copy",
		);
	});

	it("keeps exactly one spinner: the current stage in the ladder", () => {
		const { container } = render(
			<ScrapeProgress
				mode="html"
				status="extracting"
				activity="Menyiapkan HTML standalone"
			/>,
		);
		expect(
			container.querySelectorAll("[data-active-stage-spinner]"),
		).toHaveLength(1);
		expect(container.querySelectorAll("[data-activity-spinner]")).toHaveLength(
			0,
		);
		expect(activityArea(container)?.textContent).toContain(
			"Menyiapkan hasil HTML",
		);
	});

	it("shows one elapsed timer beside the running activity", () => {
		render(
			<ScrapeProgress
				mode="html"
				status="capturing"
				activity="Membuka website"
				stageStartedAt={new Date().toISOString()}
			/>,
		);
		expect(screen.getAllByRole("timer")).toHaveLength(1);
	});

	it("does not fabricate counters when no counters have been persisted", () => {
		render(<ScrapeProgress mode="images" status="capturing" />);
		expect(screen.queryByText("0")).toBeNull();
		expect(screen.queryByText(/%/)).toBeNull();
	});
});

describe("stalled processing follows the server signal", () => {
	const stallMessage =
		"Pemrosesan berhenti mengirim pembaruan. Sistem akan mencoba melanjutkan proses ini secara otomatis.";

	it("stops spinning and reports the stall instead of looping forever", () => {
		const { container } = render(
			<ScrapeProgress
				mode="images"
				status="extracting"
				stageStartedAt={new Date().toISOString()}
				workerHealth={stallMessage}
			/>,
		);
		expect(
			container.querySelectorAll("[data-active-stage-spinner]"),
		).toHaveLength(0);
		expect(
			container.querySelectorAll("[data-stalled-stage-marker]"),
		).toHaveLength(1);
		expect(activityArea(container)?.getAttribute("data-activity-state")).toBe(
			"stalled",
		);
		expect(screen.getByText(stallMessage)).toBeDefined();
		expect(screen.queryByRole("timer")).toBeNull();
	});

	it("ignores an old stall message once the run is terminal", () => {
		render(
			<ScrapeProgress
				mode="design"
				status="completed"
				workerHealth={stallMessage}
			/>,
		);
		expect(screen.queryByText(stallMessage)).toBeNull();
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
		expect(screen.queryByText("Aktivitas terbaru")).toBeNull();
		expect(screen.getAllByRole("button", { name: "Coba lagi" })).toHaveLength(
			1,
		);
		fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
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

describe("per-mode loading presentation", () => {
	const operations = {
		design: "Progres DESIGN.md",
		html: "Progres Scrape HTML",
		images: "Progres Scrape Images",
		crawl: "Progres Crawl Website",
	} as const;

	function layoutOf(container: HTMLElement): string | null | undefined {
		return container
			.querySelector("[data-layout]")
			?.getAttribute("data-layout");
	}

	for (const [mode, region] of Object.entries(operations)) {
		it(`renders one progress region for ${mode}`, () => {
			const { container } = render(
				<ScrapeProgress
					mode={mode as keyof typeof operations}
					status="capturing"
				/>,
			);
			expect(container.querySelectorAll("[data-scrape-progress]")).toHaveLength(
				1,
			);
			expect(screen.getByRole("region", { name: region })).toBeDefined();
		});
	}

	it("keeps DESIGN.md and Crawl Website in the two-column layout", () => {
		for (const mode of ["design", "crawl"] as const) {
			const { container } = render(
				<ScrapeProgress mode={mode} status="capturing" />,
			);
			expect(layoutOf(container)).toBe("two-panel");
			expect(screen.getAllByText("Aktivitas terbaru")).toHaveLength(1);
			cleanup();
		}
	});

	it("keeps HTML in the single-column layout", () => {
		const { container } = render(
			<ScrapeProgress mode="html" status="capturing" />,
		);
		expect(layoutOf(container)).toBe("single");
		expect(screen.getAllByText("Aktivitas terbaru")).toHaveLength(1);
	});

	it("keeps the images card instead of the shared card", () => {
		const { container } = render(
			<ScrapeProgress mode="images" status="capturing" />,
		);
		expect(layoutOf(container)).toBe("single");
		// The images presentation never grew an "Aktivitas terbaru" column, and
		// it reports status through its own header.
		expect(screen.queryByText("Aktivitas terbaru")).toBeNull();
		expect(screen.getByText(/^Status: Sedang diproses$/)).toBeDefined();
	});

	it("does not render the images card for any other mode", () => {
		for (const mode of ["design", "crawl", "html"] as const) {
			render(<ScrapeProgress mode={mode} status="capturing" />);
			expect(screen.queryByText(/^Status: Sedang diproses$/)).toBeNull();
			cleanup();
		}
	});

	it("keeps image counters and outcome notes inside the images card", () => {
		const counts = imageResultCounts(
			[{ status: "completed", assetId: "bytes" }, { status: "failed" }],
			2,
		);
		const { container } = render(
			<ScrapeProgress
				mode="images"
				status="completed"
				imageCounts={counts}
				imageOutcome="partial"
			/>,
		);
		const card = container.querySelector("[data-scrape-progress]");
		expect(card?.querySelector("dl")).not.toBeNull();
		expect(card?.textContent).toContain("Sebagian gambar berhasil diproses");
		expect(container.querySelectorAll("[data-scrape-progress]")).toHaveLength(
			1,
		);
	});
});

describe("queued → active → terminal regression", () => {
	it("keeps one layout and one spinner while a job moves through its stages", () => {
		const { container, rerender } = render(
			<ScrapeProgress mode="design" status="queued" />,
		);
		const layout = () =>
			container.querySelector("[data-layout]")?.getAttribute("data-layout");

		expect(layout()).toBe("two-panel");
		expect(
			container.querySelectorAll("[data-active-stage-spinner]"),
		).toHaveLength(1);
		expect(container.querySelectorAll('[data-step-state="done"]')).toHaveLength(
			0,
		);

		rerender(
			<ScrapeProgress
				mode="design"
				status="capturing"
				activity="Membuka website"
				stageStartedAt={new Date().toISOString()}
			/>,
		);
		expect(layout()).toBe("two-panel");
		expect(
			container.querySelectorAll("[data-active-stage-spinner]"),
		).toHaveLength(1);
		expect(container.querySelectorAll('[data-step-state="done"]')).toHaveLength(
			1,
		);

		rerender(<ScrapeProgress mode="design" status="completed" />);
		expect(layout()).toBe("two-panel");
		expect(
			container.querySelectorAll("[data-active-stage-spinner]"),
		).toHaveLength(0);
		expect(container.querySelectorAll('[data-step-state="done"]')).toHaveLength(
			6,
		);
	});

	it("switches to the failure card without changing the queued layout", () => {
		const { container, rerender } = render(
			<ScrapeProgress mode="crawl" status="queued" />,
		);
		rerender(
			<ScrapeProgress
				mode="crawl"
				status="failed"
				errorMessage="Crawl gagal"
				failedAtStage="capturing"
				onRetry={() => {}}
			/>,
		);
		expect(
			container.querySelector("[data-layout]")?.getAttribute("data-layout"),
		).toBe("two-panel");
		expect(
			container.querySelectorAll("[data-active-stage-spinner]"),
		).toHaveLength(0);
		expect(
			container.querySelector("[data-failed-stage-marker]"),
		).not.toBeNull();
		expect(screen.getAllByRole("alert")).toHaveLength(1);
		expect(screen.getByRole("button", { name: "Coba lagi" })).toBeDefined();
	});
});
