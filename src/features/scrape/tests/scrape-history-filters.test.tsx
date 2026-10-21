// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	baseSearch,
	HistoryListHarness,
	installRadixDomPolyfills,
	renderHistoryList,
	resetHistorySelection,
} from "./scrape-history-test-harness";

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		to,
		className,
		search,
	}: {
		children: React.ReactNode;
		to: string;
		className?: string;
		search?: unknown;
	}) => (
		<a
			href={to}
			className={className}
			data-search={search ? JSON.stringify(search) : undefined}
		>
			{children}
		</a>
	),
}));

beforeEach(() => {
	installRadixDomPolyfills();
	resetHistorySelection();
});

afterEach(() => {
	cleanup();
});

describe("ScrapeHistoryFilters", () => {
	it("filters by mode and resets to the first page", () => {
		const { onQueryChange } = renderHistoryList({ total: 3 });
		fireEvent.click(screen.getByRole("button", { name: "HTML" }));
		expect(onQueryChange).toHaveBeenCalledWith({
			...baseSearch,
			mode: "html",
			page: 1,
		});
	});

	it("marks the active mode filter as pressed", () => {
		renderHistoryList({ total: 2, search: { ...baseSearch, mode: "crawl" } });
		expect(
			screen
				.getByRole("button", { name: "Crawl" })
				.getAttribute("aria-pressed"),
		).toBe("true");
		expect(
			screen
				.getByRole("button", { name: "Semua" })
				.getAttribute("aria-pressed"),
		).toBe("false");
	});

	it("offers every extraction mode as its own filter", () => {
		renderHistoryList({ total: 3 });
		const group = screen.getByRole("group", {
			name: /filter mode ekstraksi/i,
		});
		for (const label of ["Semua", "Crawl", "DESIGN.md", "HTML", "Images"]) {
			expect(within(group).getByRole("button", { name: label })).toBeDefined();
		}
	});

	it("combines status and sort filters with the mode", () => {
		const { onQueryChange, container } = renderHistoryList({
			total: 33,
			search: { ...baseSearch, mode: "html" },
		});
		const selects = container.querySelectorAll("select");
		expect(selects).toHaveLength(3);
		fireEvent.change(selects[0], { target: { value: "failed" } });
		expect(onQueryChange).toHaveBeenCalledWith({
			...baseSearch,
			mode: "html",
			status: "failed",
			page: 1,
		});
		fireEvent.change(selects[1], { target: { value: "oldest" } });
		expect(onQueryChange).toHaveBeenCalledWith({
			...baseSearch,
			mode: "html",
			sort: "oldest",
			page: 1,
		});
	});

	it("keeps the status and the sort together on a row of their own", () => {
		renderHistoryList({ total: 3 });

		const modeFilters = screen.getByRole("group", {
			name: /filter mode ekstraksi/i,
		});
		const status = screen.getByLabelText("Status");
		const sort = screen.getByLabelText("Urutkan");
		const secondaryRow = status.closest("label")?.parentElement;

		expect(secondaryRow).not.toBeNull();
		expect(sort.closest("label")?.parentElement).toBe(secondaryRow);
		// The status and the sort stay together on a quieter row that can wrap
		// on a narrow screen instead of overflowing.
		expect(secondaryRow?.className).toContain("justify-between");
		expect(secondaryRow?.className).toContain("flex-wrap");
		// The mode rail is its own row above them.
		expect(modeFilters.parentElement).not.toBe(secondaryRow);
	});

	it("debounces search input without delaying visible keystrokes", () => {
		vi.useFakeTimers();
		try {
			const { onQueryChange } = renderHistoryList({ total: 4 });
			const input = screen.getByRole("searchbox");
			if (!(input instanceof HTMLInputElement)) {
				throw new Error("History search must be a text input.");
			}
			fireEvent.change(input, { target: { value: "stitch" } });
			expect(input.value).toBe("stitch");
			expect(onQueryChange).not.toHaveBeenCalled();
			vi.advanceTimersByTime(300);
			expect(onQueryChange).toHaveBeenCalledWith({
				...baseSearch,
				q: "stitch",
				page: 1,
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it("keeps the pending search commit alive across unrelated renders", () => {
		vi.useFakeTimers();
		try {
			const { onQueryChange, rerender } = renderHistoryList({ total: 4 });
			const input = screen.getByRole("searchbox");
			fireEvent.change(input, { target: { value: "stitch" } });
			// A render that has nothing to do with the search must not restart
			// the pending commit.
			rerender(
				<HistoryListHarness
					items={[]}
					total={4}
					search={baseSearch}
					onQueryChange={onQueryChange}
					onDeleteMany={vi.fn()}
					onPrepareSelection={vi.fn()}
				/>,
			);
			vi.advanceTimersByTime(300);
			expect(onQueryChange).toHaveBeenCalledWith({
				...baseSearch,
				q: "stitch",
				page: 1,
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it("differentiates a filtered dead-end from first-time emptiness", () => {
		const { onQueryChange } = renderHistoryList({
			total: 0,
			search: { ...baseSearch, q: "stitch" },
		});
		expect(
			screen.getByRole("heading", { name: /tidak ada hasil sesuai filter/i }),
		).toBeDefined();
		expect(
			screen.queryByRole("heading", { name: /belum ada riwayat/i }),
		).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: /atur ulang filter/i }));
		expect(onQueryChange).toHaveBeenCalledWith({
			...baseSearch,
			mode: undefined,
			status: undefined,
			q: "",
			page: 1,
		});
	});
});
