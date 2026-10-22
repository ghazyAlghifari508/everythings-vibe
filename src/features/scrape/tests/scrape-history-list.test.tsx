// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useScrapeHistorySelection } from "@/features/scrape/hooks/use-scrape-history-selection";
import type { ScrapeHistorySearch } from "@/features/scrape/types/scrape-contract";
import { historyFilterKey } from "@/features/scrape/utils/scrape-history";
import {
	imageCountsLabel,
	imageResultCounts,
} from "@/features/scrape/utils/scrape-images";
import { ScrapeHistoryList } from "../components/scrape-history-list";
import { ScrapeHistoryView } from "../components/scrape-history-view";

const baseSearch: ScrapeHistorySearch = {
	q: "",
	sort: "newest",
	page: 1,
	pageSize: 10,
};

type ListProps = Parameters<typeof ScrapeHistoryList>[0];
type ListOwnProps = Omit<ListProps, "selection">;

// The list renders inside the page shell in the product, so the selection
// controller is created here exactly the way the view creates it.
function HistoryListHarness(props: ListOwnProps) {
	const selection = useScrapeHistorySelection(historyFilterKey(props.search));
	return <ScrapeHistoryList {...props} selection={selection} />;
}

function renderList(overrides: Partial<ListOwnProps> = {}) {
	const onQueryChange = vi.fn();
	const rendered = render(
		<HistoryListHarness
			items={[]}
			total={0}
			search={baseSearch}
			onQueryChange={onQueryChange}
			onDeleteMany={vi
				.fn()
				.mockResolvedValue({ deleted: 0, skipped: 0, deletedIds: [] })}
			onPrepareSelection={vi
				.fn()
				.mockResolvedValue({ ids: [], total: 0, truncated: false })}
			{...overrides}
		/>,
	);
	return { onQueryChange, ...rendered };
}

it("keeps historical stored and legacy counts distinct", () => {
	const counts = imageResultCounts(
		[
			{ status: "completed", assetId: "bytes" },
			{ status: "completed", assetId: null },
			{ status: "failed" },
		],
		4,
	);
	render(
		<HistoryListHarness
			items={[
				{
					id: "sample",
					domain: "example.test",
					sourceUrl: "https://example.test",
					title: null,
					status: "failed",
					mode: "images",
					createdAt: new Date().toISOString(),
					imageCounts: counts,
				},
			]}
			total={1}
			search={baseSearch}
			onQueryChange={vi.fn()}
			onDeleteMany={vi
				.fn()
				.mockResolvedValue({ deleted: 0, skipped: 0, deletedIds: [] })}
			onPrepareSelection={vi
				.fn()
				.mockResolvedValue({ ids: [], total: 0, truncated: false })}
		/>,
	);
	expect(screen.getByText(imageCountsLabel(counts))).toBeDefined();
});

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

afterEach(() => {
	cleanup();
});

describe("ScrapeHistoryList", () => {
	it("renders an empty state with a contrast-safe CTA and no dashed dropzone", () => {
		const { container } = renderList();
		expect(
			screen.getByRole("heading", { name: /Belum ada riwayat scrape/i }),
		).toBeDefined();
		const cta = screen.getByRole("link", { name: /Mulai Scrap Sekarang/i });
		expect(cta.getAttribute("href")).toBe("/scrape");
		expect(cta.className).toContain("btn-primary");
		expect(container.innerHTML).not.toContain("border-dashed");
	});

	it("uses the website name instead of the SEO page title with plain metadata", () => {
		const { container } = renderList({
			items: [
				{
					id: "id-1",
					sourceUrl: "https://www.notion.com/",
					domain: "www.notion.com",
					title: "The AI workspace that works for you. | Notion",
					status: "completed",
					mode: "design",
					createdAt: new Date().toISOString(),
				},
			],
			total: 1,
		});
		expect(screen.getByText("Notion")).toBeDefined();
		expect(
			screen.queryByText("The AI workspace that works for you. | Notion"),
		).toBeNull();
		const rowLink = screen.getByRole("link", { name: /Notion/i });
		expect(within(rowLink).getByText("DESIGN.md")).toBeDefined();
		expect(within(rowLink).getByText("Selesai")).toBeDefined();
		expect(screen.queryByRole("link", { name: /^Buka$/i })).toBeNull();
		expect(
			screen.getByRole("button", { name: /Hapus riwayat/i }),
		).toBeDefined();
		const html = container.innerHTML;
		expect(html).not.toContain("rounded-full");
		expect(html).not.toContain("bg-emerald-400");
		expect(html).not.toContain("bg-sky-500");
		expect(html).not.toContain("bg-purple-500");
	});

	it("makes the whole row the open target pointing at the result route", () => {
		renderList({
			items: [
				{
					id: "id-2",
					sourceUrl: "https://www.notion.com/",
					domain: "www.notion.com",
					title: null,
					status: "completed",
					mode: "html",
					createdAt: new Date().toISOString(),
				},
			],
			total: 1,
		});
		const rowLink = screen.getByRole("link", { name: /Notion/i });
		expect(rowLink.getAttribute("href")).toBe("/scrape/$id");
		expect(within(rowLink).getByText("HTML")).toBeDefined();
		expect(within(rowLink).getByText("Selesai")).toBeDefined();
	});
});

describe("ScrapeHistoryList dashboard", () => {
	it("reports the filtered total instead of the page length", () => {
		renderList({
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
		expect(screen.getByText(/33 hasil/)).toBeDefined();
		expect(screen.getByText(/Menampilkan 11–20 dari 33/)).toBeDefined();
	});

	it("filters by mode and resets to the first page", () => {
		const { onQueryChange } = renderList({ total: 3 });
		fireEvent.click(screen.getByRole("button", { name: "HTML" }));
		expect(onQueryChange).toHaveBeenCalledWith({
			...baseSearch,
			mode: "html",
			page: 1,
		});
	});

	it("marks the active mode filter as pressed", () => {
		renderList({ total: 2, search: { ...baseSearch, mode: "crawl" } });
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

	it("combines status and sort filters with the mode", () => {
		const { onQueryChange, container } = renderList({
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

	it("keeps the category filters on the left and status and sort on the right of the same row", () => {
		renderList({ total: 3 });

		const modeFilters = screen.getByRole("group", {
			name: /filter mode ekstraksi/i,
		});
		const status = screen.getByLabelText("Status");
		const sort = screen.getByLabelText("Urutkan");
		const row = modeFilters.parentElement;
		const group = status.closest("label")?.parentElement;

		expect(row).not.toBeNull();
		expect(group).not.toBeNull();
		expect(sort.closest("label")?.parentElement).toBe(group);
		expect(group?.parentElement).toBe(row);
		// The row distributes the two groups apart and is allowed to wrap so a
		// narrow screen moves the dropdowns to their own line instead of
		// overflowing.
		expect(row?.className).toContain("justify-between");
		expect(row?.className).toContain("flex-wrap");
	});

	it("debounces search input without delaying visible keystrokes", () => {
		vi.useFakeTimers();
		try {
			const { onQueryChange } = renderList({ total: 4 });
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

	it("pages through server results while retaining the filter state", () => {
		const { onQueryChange } = renderList({
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

	it("changes rows per page from the pagination control", () => {
		const { onQueryChange, container } = renderList({ total: 33 });
		const selects = container.querySelectorAll("select");
		const pageSizeSelect = selects[selects.length - 1];
		fireEvent.change(pageSizeSelect, { target: { value: "20" } });
		expect(onQueryChange).toHaveBeenCalledWith({
			...baseSearch,
			pageSize: 20,
			page: 1,
		});
	});

	it("carries the filter state on every detail link", () => {
		renderList({
			items: [
				{
					id: "id-9",
					sourceUrl: "https://example.test/",
					domain: "example.test",
					title: null,
					status: "failed",
					mode: "html",
					createdAt: new Date().toISOString(),
				},
			],
			total: 33,
			search: {
				...baseSearch,
				mode: "html",
				status: "failed",
				q: "stitch",
				page: 2,
				pageSize: 20,
			},
		});
		const rowLink = screen.getByRole("link", { name: /Example/i });
		expect(JSON.parse(rowLink.dataset.search ?? "{}")).toEqual({
			from: "/scrape/history",
			mode: "html",
			status: "failed",
			q: "stitch",
			page: 2,
			pageSize: 20,
		});
	});

	it("differentiates a filtered dead-end from first-time emptiness", () => {
		const { onQueryChange } = renderList({
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

	it("confirms deletion with the website context before calling back", async () => {
		const onDelete = vi.fn().mockResolvedValue({ ok: true });
		renderList({
			items: [
				{
					id: "id-7",
					sourceUrl: "https://www.notion.com/",
					domain: "www.notion.com",
					title: null,
					status: "completed",
					mode: "design",
					createdAt: new Date().toISOString(),
				},
			],
			total: 1,
			onDelete,
		});
		fireEvent.click(screen.getByRole("button", { name: /hapus riwayat/i }));
		expect(
			screen.getByRole("dialog", { name: /hapus riwayat vibescrape/i }),
		).toBeDefined();
		expect(screen.getByText(/tidak dapat dibatalkan/i)).toBeDefined();
		fireEvent.click(screen.getByRole("button", { name: /konfirmasi hapus/i }));
		await vi.waitFor(() => expect(onDelete).toHaveBeenCalledWith("id-7"));
	});

	it("surfaces a retryable error when deletion fails", async () => {
		const onDelete = vi.fn().mockRejectedValue(new Error("offline"));
		renderList({
			items: [
				{
					id: "id-8",
					sourceUrl: "https://example.test/",
					domain: "example.test",
					title: null,
					status: "completed",
					mode: "design",
					createdAt: new Date().toISOString(),
				},
			],
			total: 1,
			onDelete,
		});
		fireEvent.click(screen.getByRole("button", { name: /hapus riwayat/i }));
		fireEvent.click(screen.getByRole("button", { name: /konfirmasi hapus/i }));
		await vi.waitFor(() => expect(screen.getByRole("alert")).toBeDefined());
	});
});

describe("ScrapeHistory direct selection without selection mode", () => {
	const sampleItems = [
		{
			id: "item-1",
			sourceUrl: "https://anpundung.com",
			domain: "anpundung.com",
			title: null,
			status: "completed",
			mode: "images" as const,
			createdAt: new Date().toISOString(),
		},
		{
			id: "item-2",
			sourceUrl: "https://desainpakeai.com",
			domain: "desainpakeai.com",
			title: null,
			status: "completed",
			mode: "design" as const,
			createdAt: new Date().toISOString(),
		},
		{
			id: "item-3",
			sourceUrl: "https://notion.so",
			domain: "notion.so",
			title: null,
			status: "completed",
			mode: "crawl" as const,
			createdAt: new Date().toISOString(),
		},
	];

	it("renders checkbox directly on each item without 'Pilih' mode", () => {
		renderList({
			items: sampleItems,
			total: 3,
		});

		expect(screen.queryByRole("button", { name: /^Pilih$/i })).toBeNull();
		expect(
			screen.queryByRole("button", { name: /^Selesai memilih$/i }),
		).toBeNull();

		const checkboxes = screen.getAllByRole("checkbox");
		expect(checkboxes).toHaveLength(4);
		expect(
			screen.getByRole("checkbox", { name: /pilih riwayat anpundung/i }),
		).toBeDefined();
		expect(
			screen.getByRole("checkbox", { name: /pilih semua di halaman ini/i }),
		).toBeDefined();
	});

	it("hides bulk toolbar when count is 0 and shows it when items are selected", () => {
		renderList({
			items: sampleItems,
			total: 3,
		});

		expect(screen.queryByText(/hasil dipilih/i)).toBeNull();
		expect(screen.queryByRole("button", { name: /^Batal$/i })).toBeNull();

		const item1Checkbox = screen.getByRole("checkbox", {
			name: /pilih riwayat anpundung/i,
		});
		fireEvent.click(item1Checkbox);

		expect(screen.getByText("1 hasil dipilih")).toBeDefined();
		expect(screen.getByRole("button", { name: /^Batal$/i })).toBeDefined();
		expect(screen.getByRole("button", { name: /Hapus 1/i })).toBeDefined();

		const item2Checkbox = screen.getByRole("checkbox", {
			name: /pilih riwayat desainpakeai/i,
		});
		fireEvent.click(item2Checkbox);

		expect(screen.getByText("2 hasil dipilih")).toBeDefined();
		expect(screen.getByRole("button", { name: /Hapus 2/i })).toBeDefined();
	});

	it("clears selection when Batal is clicked and keeps checkboxes available", () => {
		renderList({
			items: sampleItems,
			total: 3,
		});

		const item1Checkbox = screen.getByRole("checkbox", {
			name: /pilih riwayat anpundung/i,
		});
		fireEvent.click(item1Checkbox);
		expect(screen.getByText("1 hasil dipilih")).toBeDefined();

		const batalButton = screen.getByRole("button", { name: /^Batal$/i });
		fireEvent.click(batalButton);

		expect(screen.queryByText(/hasil dipilih/i)).toBeNull();
		expect(item1Checkbox).toBeDefined();
		expect((item1Checkbox as HTMLInputElement).checked).toBe(false);
	});

	it("keeps item detail link and checkbox click targets independent", () => {
		renderList({
			items: sampleItems,
			total: 3,
		});

		const checkbox = screen.getByRole("checkbox", {
			name: /pilih riwayat anpundung/i,
		});
		const link = screen.getByRole("link", { name: /anpundung/i });

		expect(link.getAttribute("href")).toBe("/scrape/$id");
		expect(link.contains(checkbox)).toBe(false);

		fireEvent.click(checkbox);
		expect((checkbox as HTMLInputElement).checked).toBe(true);
	});

	it("selects all items on the current page via select-all checkbox", () => {
		renderList({
			items: sampleItems,
			total: 3,
		});

		const selectAll = screen.getByRole("checkbox", {
			name: /pilih semua di halaman ini/i,
		});
		fireEvent.click(selectAll);

		expect(screen.getByText("3 hasil dipilih")).toBeDefined();
		expect(screen.getByRole("button", { name: /Hapus 3/i })).toBeDefined();

		const checkboxes = screen.getAllByRole("checkbox");
		for (const cb of checkboxes) {
			expect((cb as HTMLInputElement).checked).toBe(true);
		}

		fireEvent.click(selectAll);
		expect(screen.queryByText(/hasil dipilih/i)).toBeNull();
	});

	it("supports cross-page selection for filtered results", async () => {
		const onPrepareSelection = vi.fn().mockResolvedValue({
			ids: ["item-1", "item-2", "item-3", "item-4"],
			total: 4,
			truncated: false,
		});

		renderList({
			items: sampleItems,
			total: 4,
			onPrepareSelection,
		});

		const selectAll = screen.getByRole("checkbox", {
			name: /pilih semua di halaman ini/i,
		});
		fireEvent.click(selectAll);

		const selectAllFilteredBtn = screen.getByRole("button", {
			name: /pilih semua 4 hasil sesuai filter/i,
		});
		fireEvent.click(selectAllFilteredBtn);

		await vi.waitFor(() => {
			expect(onPrepareSelection).toHaveBeenCalled();
			expect(screen.getByText("4 hasil dipilih")).toBeDefined();
		});
	});

	it("confirms bulk deletion and invokes onDeleteMany with selected ids", async () => {
		const onDeleteMany = vi.fn().mockResolvedValue({
			deleted: 2,
			skipped: 0,
			deletedIds: ["item-1", "item-2"],
		});

		renderList({
			items: sampleItems,
			total: 3,
			onDeleteMany,
		});

		fireEvent.click(
			screen.getByRole("checkbox", { name: /pilih riwayat anpundung/i }),
		);
		fireEvent.click(
			screen.getByRole("checkbox", { name: /pilih riwayat desainpakeai/i }),
		);

		const bulkDeleteBtn = screen.getByRole("button", { name: /Hapus 2/i });
		fireEvent.click(bulkDeleteBtn);

		expect(screen.getByRole("dialog")).toBeDefined();
		expect(screen.getByText(/Hapus 2 hasil scrape\?/i)).toBeDefined();
		expect(
			screen.getByText(/Hasil yang dipilih akan dihapus permanen\./i),
		).toBeDefined();

		const confirmBtn = screen.getByRole("button", { name: /^Hapus 2$/i });
		fireEvent.click(confirmBtn);

		await vi.waitFor(() => {
			expect(onDeleteMany).toHaveBeenCalledWith(["item-1", "item-2"]);
		});
	});
});

describe("ScrapeHistoryView", () => {
	it("does not render Pilih or Selesai memilih buttons in header", () => {
		render(
			<ScrapeHistoryView
				items={[
					{
						id: "item-1",
						sourceUrl: "https://anpundung.com",
						domain: "anpundung.com",
						title: null,
						status: "completed",
						mode: "images",
						createdAt: new Date().toISOString(),
					},
				]}
				total={1}
				search={baseSearch}
				onQueryChange={vi.fn()}
				onDelete={vi.fn()}
				onDeleteMany={vi
					.fn()
					.mockResolvedValue({ deleted: 0, skipped: 0, deletedIds: [] })}
				onPrepareSelection={vi
					.fn()
					.mockResolvedValue({ ids: [], total: 0, truncated: false })}
			/>,
		);

		expect(screen.queryByRole("button", { name: /^Pilih$/i })).toBeNull();
		expect(
			screen.queryByRole("button", { name: /^Selesai memilih$/i }),
		).toBeNull();
	});
});
