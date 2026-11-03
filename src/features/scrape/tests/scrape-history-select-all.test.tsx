// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScrapeHistorySelectAll } from "../components/scrape-history-select-all";

const fivePageIds = ["id-1", "id-2", "id-3", "id-4", "id-5"] as const;

function renderSelectAll(
	overrides: Partial<Parameters<typeof ScrapeHistorySelectAll>[0]> = {},
) {
	const defaultProps: Parameters<typeof ScrapeHistorySelectAll>[0] = {
		pageIds: fivePageIds,
		selectedIds: new Set<string>(),
		total: 5,
		filteredScopeActive: false,
		preparing: false,
		onTogglePage: vi.fn(),
		onSelectAllFiltered: vi.fn(),
	};
	const props = { ...defaultProps, ...overrides };
	const result = render(<ScrapeHistorySelectAll {...props} />);
	const checkbox = screen.getByRole("checkbox", {
		name: /pilih semua di halaman ini/i,
	}) as HTMLInputElement;

	return { ...result, checkbox, props };
}

afterEach(() => {
	cleanup();
});

describe("ScrapeHistorySelectAll checkbox states and semantics", () => {
	it("renders unchecked when 0 of 5 items are selected", () => {
		const { checkbox } = renderSelectAll({
			selectedIds: new Set<string>(),
		});

		expect(checkbox.checked).toBe(false);
		expect(checkbox.indeterminate).toBe(false);
		expect(checkbox.getAttribute("aria-checked")).toBe("false");
		expect(screen.getByText("Pilih semua di halaman ini")).toBeDefined();
		expect(screen.queryByText("Semua hasil di halaman ini dipilih")).toBeNull();
	});

	it("renders indeterminate when 1 of 5 items is selected", () => {
		const { checkbox } = renderSelectAll({
			selectedIds: new Set(["id-1"]),
		});

		expect(checkbox.checked).toBe(false);
		expect(checkbox.indeterminate).toBe(true);
		expect(checkbox.getAttribute("aria-checked")).toBe("mixed");
		expect(screen.getByText("Pilih semua di halaman ini")).toBeDefined();
		expect(screen.queryByText("Semua hasil di halaman ini dipilih")).toBeNull();
	});

	it("renders indeterminate when 3 of 5 items are selected", () => {
		const { checkbox } = renderSelectAll({
			selectedIds: new Set(["id-1", "id-2", "id-3"]),
		});

		expect(checkbox.checked).toBe(false);
		expect(checkbox.indeterminate).toBe(true);
		expect(checkbox.getAttribute("aria-checked")).toBe("mixed");
		expect(screen.getByText("Pilih semua di halaman ini")).toBeDefined();
		expect(screen.queryByText("Semua hasil di halaman ini dipilih")).toBeNull();
	});

	it("renders checked when 5 of 5 items are selected", () => {
		const { checkbox } = renderSelectAll({
			selectedIds: new Set(fivePageIds),
		});

		expect(checkbox.checked).toBe(true);
		expect(checkbox.indeterminate).toBe(false);
		expect(checkbox.getAttribute("aria-checked")).toBe("true");
		expect(
			screen.getByText("Semua hasil di halaman ini dipilih"),
		).toBeDefined();
	});

	it("prevents false indeterminate indication on current page when items on another page are selected", () => {
		// Page 2 has its own 5 items; selectedIds only has items from Page 1
		const page2Ids = ["p2-1", "p2-2", "p2-3", "p2-4", "p2-5"] as const;
		const otherPageSelectedIds = new Set(["p1-1", "p1-2"]);

		const { checkbox } = renderSelectAll({
			pageIds: page2Ids,
			selectedIds: otherPageSelectedIds,
			total: 10,
		});

		// 0 items on Page 2 are selected -> must be unchecked and NOT indeterminate
		expect(checkbox.checked).toBe(false);
		expect(checkbox.indeterminate).toBe(false);
		expect(checkbox.getAttribute("aria-checked")).toBe("false");
		expect(screen.getByText("Pilih semua di halaman ini")).toBeDefined();
	});

	it("updates correctly when props change across pagination navigation", () => {
		const page1Ids = ["p1-1", "p1-2"] as const;
		const page2Ids = ["p2-1", "p2-2"] as const;
		const selectedIds = new Set(["p1-1"]);

		// On Page 1: 1 of 2 selected -> indeterminate
		const { checkbox, rerender, props } = renderSelectAll({
			pageIds: page1Ids,
			selectedIds,
			total: 4,
		});
		expect(checkbox.indeterminate).toBe(true);
		expect(checkbox.checked).toBe(false);

		// Navigate to Page 2: 0 of 2 selected on Page 2 -> unchecked, not indeterminate
		rerender(
			<ScrapeHistorySelectAll
				{...props}
				pageIds={page2Ids}
				selectedIds={selectedIds}
			/>,
		);
		expect(checkbox.indeterminate).toBe(false);
		expect(checkbox.checked).toBe(false);
		expect(screen.getByText("Pilih semua di halaman ini")).toBeDefined();
	});

	it("reflects filter changes when previously selected items no longer match visible page", () => {
		const filteredPageIds = ["filtered-1", "filtered-2"] as const;
		const staleSelectedIds = new Set(["unrelated-old-id"]);

		const { checkbox } = renderSelectAll({
			pageIds: filteredPageIds,
			selectedIds: staleSelectedIds,
			total: 2,
		});

		expect(checkbox.checked).toBe(false);
		expect(checkbox.indeterminate).toBe(false);
		expect(checkbox.getAttribute("aria-checked")).toBe("false");
		expect(screen.getByText("Pilih semua di halaman ini")).toBeDefined();
	});

	it("calls onTogglePage(true) when clicked in 0-selected state", () => {
		const onTogglePage = vi.fn();
		const { checkbox } = renderSelectAll({
			selectedIds: new Set<string>(),
			onTogglePage,
		});

		fireEvent.click(checkbox);
		expect(onTogglePage).toHaveBeenCalledTimes(1);
		expect(onTogglePage).toHaveBeenCalledWith(true);
	});

	it("calls onTogglePage(true) when clicked in partial-selected state (Select All semantics)", () => {
		const onTogglePage = vi.fn();
		const { checkbox } = renderSelectAll({
			selectedIds: new Set(["id-1", "id-2"]),
			onTogglePage,
		});

		fireEvent.click(checkbox);
		expect(onTogglePage).toHaveBeenCalledTimes(1);
		expect(onTogglePage).toHaveBeenCalledWith(true);
	});

	it("calls onTogglePage(false) when clicked in all-selected state (Deselect All semantics)", () => {
		const onTogglePage = vi.fn();
		const { checkbox } = renderSelectAll({
			selectedIds: new Set(fivePageIds),
			onTogglePage,
		});

		fireEvent.click(checkbox);
		expect(onTogglePage).toHaveBeenCalledTimes(1);
		expect(onTogglePage).toHaveBeenCalledWith(false);
	});

	it("supports clicking label text to toggle selection", () => {
		const onTogglePage = vi.fn();
		renderSelectAll({
			selectedIds: new Set<string>(),
			onTogglePage,
		});

		fireEvent.click(screen.getByText("Pilih semua di halaman ini"));
		expect(onTogglePage).toHaveBeenCalledWith(true);
	});

	it("does not trigger unintended auto-selection on mount or prop updates", () => {
		const onTogglePage = vi.fn();
		const onSelectAllFiltered = vi.fn();

		const { rerender, props } = renderSelectAll({
			selectedIds: new Set<string>(),
			onTogglePage,
			onSelectAllFiltered,
		});

		expect(onTogglePage).not.toHaveBeenCalled();
		expect(onSelectAllFiltered).not.toHaveBeenCalled();

		rerender(
			<ScrapeHistorySelectAll {...props} selectedIds={new Set(["id-1"])} />,
		);

		expect(onTogglePage).not.toHaveBeenCalled();
		expect(onSelectAllFiltered).not.toHaveBeenCalled();
	});

	it("preserves accessibility checkbox semantics and attributes", () => {
		const { checkbox } = renderSelectAll({
			selectedIds: new Set(["id-1"]),
		});

		expect(checkbox.getAttribute("type")).toBe("checkbox");
		expect(checkbox.getAttribute("aria-label")).toBe(
			"Pilih semua di halaman ini",
		);
		expect(checkbox.getAttribute("aria-checked")).toBe("mixed");
	});
});
