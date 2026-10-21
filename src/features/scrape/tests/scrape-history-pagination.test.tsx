// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	baseSearch,
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

describe("ScrapeHistoryPagination", () => {
	it("reports the filtered total instead of the page length", () => {
		renderHistoryList({
			items: [
				{
					id: "id-1",
					sourceUrl: "https://example.test/",
					domain: "example.test",
					title: null,
					status: "completed",
					mode: "crawl",
					createdAt: new Date("2026-10-14T00:00:00.000Z").toISOString(),
				},
			],
			total: 33,
			search: { ...baseSearch, page: 2 },
		});
		expect(screen.getByText("33 hasil")).toBeDefined();
		expect(screen.getByText("Menampilkan 11–20 dari 33")).toBeDefined();
	});

	it("pages through server results while retaining the filter state", () => {
		const { onQueryChange } = renderHistoryList({
			items: [],
			total: 33,
			search: { ...baseSearch, mode: "html", status: "failed", page: 1 },
		});
		const nav = screen.getByRole("navigation", { name: /pagination/i });
		expect(nav).toBeDefined();
		fireEvent.click(screen.getByRole("button", { name: "Halaman 2" }));
		expect(onQueryChange).toHaveBeenCalledWith({
			...baseSearch,
			mode: "html",
			status: "failed",
			page: 2,
		});
	});

	it("marks the current page for assistive technology", () => {
		renderHistoryList({
			items: [],
			total: 33,
			search: { ...baseSearch, page: 2 },
		});
		expect(
			screen
				.getByRole("button", { name: "Halaman 2" })
				.getAttribute("aria-current"),
		).toBe("page");
		expect(
			screen
				.getByRole("button", { name: "Halaman 1" })
				.getAttribute("aria-current"),
		).toBeNull();
	});

	it("exposes the current page on the narrow pager too", () => {
		renderHistoryList({
			items: [],
			total: 33,
			search: { ...baseSearch, page: 2 },
		});
		const current = screen.getByText("2 / 4");
		expect(current.getAttribute("aria-current")).toBe("page");
		expect(
			screen.getAllByRole("button", { name: "Halaman sebelumnya" }).length,
		).toBeGreaterThan(0);
		expect(
			screen.getAllByRole("button", { name: "Halaman berikutnya" }).length,
		).toBeGreaterThan(0);
	});

	it("hides the page controls when one page covers every result", () => {
		renderHistoryList({ items: [], total: 4 });
		expect(
			screen.queryByRole("navigation", { name: /pagination/i }),
		).toBeNull();
		expect(screen.getByText("Menampilkan 1–4 dari 4")).toBeDefined();
	});

	it("changes rows per page from the pagination control", () => {
		const { onQueryChange, container } = renderHistoryList({ total: 33 });
		const selects = container.querySelectorAll("select");
		const pageSizeSelect = selects[selects.length - 1];
		fireEvent.change(pageSizeSelect, { target: { value: "20" } });
		expect(onQueryChange).toHaveBeenCalledWith({
			...baseSearch,
			pageSize: 20,
			page: 1,
		});
	});

	it("falls back to the default page size for an unknown value", () => {
		const { onQueryChange, container } = renderHistoryList({ total: 33 });
		const selects = container.querySelectorAll("select");
		const pageSizeSelect = selects[selects.length - 1];
		fireEvent.change(pageSizeSelect, { target: { value: "17" } });
		expect(onQueryChange).toHaveBeenCalledWith({
			...baseSearch,
			pageSize: 10,
			page: 1,
		});
	});
});
