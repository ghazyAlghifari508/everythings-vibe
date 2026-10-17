// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ScrapeHistorySearch } from "@/lib/scrape-contract";
import { imageCountsLabel, imageResultCounts } from "@/lib/scrape-images";
import { ScrapeHistoryList } from "../components/scrape-history-list";

const baseSearch: ScrapeHistorySearch = {
	q: "",
	sort: "newest",
	page: 1,
	pageSize: 10,
};

function renderList(
	overrides: Partial<Parameters<typeof ScrapeHistoryList>[0]> = {},
) {
	const onQueryChange = vi.fn();
	const rendered = render(
		<ScrapeHistoryList
			items={[]}
			total={0}
			search={baseSearch}
			onQueryChange={onQueryChange}
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
		<ScrapeHistoryList
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
		expect(rowLink.getAttribute("href")).toBe("/design/scrap/$id");
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
			from: "/design/scrap/history",
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
			screen.getByRole("dialog", { name: /hapus riwayat scrape/i }),
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
