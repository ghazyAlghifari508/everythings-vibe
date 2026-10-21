// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	imageCountsLabel,
	imageCountsSummary,
	imageResultCounts,
} from "@/features/scrape/utils/scrape-images";
import {
	baseSearch,
	installRadixDomPolyfills,
	openRowActions,
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

describe("ScrapeHistoryList", () => {
	it("renders an empty state with a contrast-safe CTA and no dashed dropzone", () => {
		const { container } = renderHistoryList();
		expect(
			screen.getByRole("heading", { name: /Belum ada riwayat scrape/i }),
		).toBeDefined();
		const cta = screen.getByRole("link", { name: /Mulai Scrap Sekarang/i });
		expect(cta.getAttribute("href")).toBe("/scrape");
		expect(cta.className).toContain("btn-primary");
		expect(container.innerHTML).not.toContain("border-dashed");
	});

	it("uses the website name instead of the SEO page title with plain metadata", () => {
		const { container } = renderHistoryList({
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
			screen.getByRole("button", { name: /Aksi riwayat Notion/i }),
		).toBeDefined();
		const html = container.innerHTML;
		expect(html).not.toContain("rounded-full");
		expect(html).not.toContain("bg-emerald-400");
		expect(html).not.toContain("bg-sky-500");
		expect(html).not.toContain("bg-purple-500");
	});

	it("makes the whole row the open target pointing at the result route", () => {
		renderHistoryList({
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

	it("keeps the row actions outside the result link", () => {
		renderHistoryList({
			items: [
				{
					id: "id-3",
					sourceUrl: "https://www.notion.com/",
					domain: "www.notion.com",
					title: null,
					status: "completed",
					mode: "design",
					createdAt: new Date().toISOString(),
				},
			],
			total: 1,
		});
		const trigger = screen.getByRole("button", { name: /Aksi riwayat/i });
		expect(trigger.closest("a")).toBeNull();
		expect(trigger.tagName).toBe("BUTTON");
	});

	it("gives every row of the same website a distinguishable action", () => {
		renderHistoryList({
			items: [
				{
					id: "id-4",
					sourceUrl: "https://www.notion.com/",
					domain: "www.notion.com",
					title: null,
					status: "completed",
					mode: "design",
					createdAt: new Date("2026-10-14T00:00:00.000Z").toISOString(),
				},
				{
					id: "id-5",
					sourceUrl: "https://www.notion.com/",
					domain: "www.notion.com",
					title: null,
					status: "completed",
					mode: "html",
					createdAt: new Date("2026-10-13T00:00:00.000Z").toISOString(),
				},
			],
			total: 2,
		});
		const triggers = screen.getAllByRole("button", { name: /Aksi riwayat/i });
		expect(triggers).toHaveLength(2);
		expect(triggers[0]?.getAttribute("aria-label")).not.toBe(
			triggers[1]?.getAttribute("aria-label"),
		);
	});

	it("carries the filter state on every detail link", () => {
		renderHistoryList({
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
});

describe("ScrapeHistoryList row states", () => {
	function renderRow(status: string) {
		renderHistoryList({
			items: [
				{
					id: "row-1",
					sourceUrl: "https://example.test/",
					domain: "example.test",
					title: null,
					status,
					mode: "design",
					createdAt: new Date("2026-10-14T00:00:00.000Z").toISOString(),
				},
			],
			total: 1,
		});
		return screen.getByRole("link", { name: /Example/i });
	}

	it("never presents a failed result as finished", () => {
		const row = renderRow("failed");
		expect(within(row).getByText("Gagal")).toBeDefined();
		expect(within(row).queryByText("Selesai")).toBeNull();
	});

	it("reports an in-flight result as still processing", () => {
		const row = renderRow("extracting");
		expect(within(row).getByText("Diproses")).toBeDefined();
		expect(within(row).queryByText("Selesai")).toBeNull();
	});

	it("shows the creation date of the result in a readable column", () => {
		const row = renderRow("completed");
		const time = within(row).getByText("14 Okt 2026");
		expect(time.tagName).toBe("TIME");
		expect(time.getAttribute("datetime")).toContain("2026-10-14");
	});

	it("keeps historical stored and legacy counts distinct", () => {
		const counts = imageResultCounts(
			[
				{ status: "completed", assetId: "bytes" },
				{ status: "completed", assetId: null },
				{ status: "failed" },
			],
			4,
		);
		renderHistoryList({
			items: [
				{
					id: "row-2",
					domain: "example.test",
					sourceUrl: "https://example.test",
					title: null,
					status: "failed",
					mode: "images",
					createdAt: new Date().toISOString(),
					imageCounts: counts,
				},
			],
			total: 1,
		});
		// The row carries the two numbers that fit its column and keeps the
		// full breakdown available without widening the list.
		const summary = screen.getByText(imageCountsSummary(counts));
		expect(summary.getAttribute("title")).toBe(imageCountsLabel(counts));
	});
});

describe("ScrapeHistoryList deletion", () => {
	it("confirms deletion with the website context before calling back", async () => {
		const onDelete = vi.fn().mockResolvedValue({ ok: true });
		renderHistoryList({
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
		openRowActions(/Aksi riwayat Notion/i);
		fireEvent.click(screen.getByRole("menuitem", { name: /Hapus hasil/i }));
		expect(
			screen.getByRole("dialog", { name: /hapus riwayat vibescrape/i }),
		).toBeDefined();
		expect(screen.getByText(/tidak dapat dibatalkan/i)).toBeDefined();
		fireEvent.click(screen.getByRole("button", { name: /konfirmasi hapus/i }));
		await vi.waitFor(() => expect(onDelete).toHaveBeenCalledWith("id-7"));
	});

	it("surfaces a retryable error when deletion fails", async () => {
		const onDelete = vi.fn().mockRejectedValue(new Error("offline"));
		renderHistoryList({
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
		openRowActions(/Aksi riwayat/i);
		fireEvent.click(screen.getByRole("menuitem", { name: /Hapus hasil/i }));
		fireEvent.click(screen.getByRole("button", { name: /konfirmasi hapus/i }));
		await vi.waitFor(() => expect(screen.getByRole("alert")).toBeDefined());
	});
});
