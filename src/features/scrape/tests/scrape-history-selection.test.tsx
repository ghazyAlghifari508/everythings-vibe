// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ScrapeMode } from "@/db/schema";
import type { ScrapeHistorySearch } from "@/features/scrape/types/scrape-contract";
import type { ScrapeHistoryItem } from "../components/scrape-history-list";
import {
	ScrapeHistoryView,
	type ScrapeHistoryViewProps,
} from "../components/scrape-history-view";

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

const baseSearch: ScrapeHistorySearch = {
	q: "",
	sort: "newest",
	page: 1,
	pageSize: 10,
};

function row(
	id: string,
	domain = "www.notion.com",
	mode: ScrapeMode = "design",
): ScrapeHistoryItem {
	return {
		id,
		sourceUrl: `https://${domain}/`,
		domain,
		title: null,
		status: "completed",
		mode,
		createdAt: new Date("2026-10-14T00:00:00.000Z").toISOString(),
	};
}

function viewProps(
	overrides: Partial<ScrapeHistoryViewProps> = {},
): ScrapeHistoryViewProps {
	return {
		items: [],
		total: 0,
		search: baseSearch,
		onQueryChange: vi.fn(),
		onDelete: vi.fn().mockResolvedValue({ ok: true }),
		onDeleteMany: vi
			.fn()
			.mockResolvedValue({ deleted: 0, skipped: 0, deletedIds: [] }),
		onPrepareSelection: vi
			.fn()
			.mockResolvedValue({ ids: [], total: 0, truncated: false }),
		...overrides,
	};
}

function renderView(overrides: Partial<ScrapeHistoryViewProps> = {}) {
	const props = viewProps(overrides);
	const rendered = render(<ScrapeHistoryView {...props} />);
	return { props, ...rendered };
}

function enterSelectionMode() {
	fireEvent.click(screen.getByRole("button", { name: "Pilih" }));
}

function checked(box: HTMLElement): boolean {
	if (!(box instanceof HTMLInputElement))
		throw new Error("Selection control must be a checkbox input.");
	return box.checked;
}

afterEach(() => {
	cleanup();
});

describe("VibeScrape history selection mode", () => {
	it("keeps the normal list free of selection controls", () => {
		renderView({ items: [row("a")], total: 1 });

		expect(screen.queryByRole("checkbox")).toBeNull();
		expect(screen.getByRole("link", { name: /Notion/i })).toBeDefined();
		expect(screen.getByRole("button", { name: "Pilih" })).toBeDefined();
	});

	it("enters and leaves selection mode from the page header", () => {
		renderView({ items: [row("a")], total: 1 });

		enterSelectionMode();
		expect(
			screen.getByRole("checkbox", { name: /Pilih riwayat Notion/i }),
		).toBeDefined();
		expect(screen.queryByRole("link", { name: /Notion/i })).toBeNull();
		expect(
			screen.getByRole("button", { name: "Selesai memilih" }),
		).toBeDefined();

		fireEvent.click(screen.getByRole("button", { name: "Selesai memilih" }));
		expect(screen.queryByRole("checkbox")).toBeNull();
		expect(screen.getByRole("link", { name: /Notion/i })).toBeDefined();
	});

	it("selects a row from its checkbox and keeps the count visible", () => {
		renderView({ items: [row("a")], total: 1 });

		enterSelectionMode();
		const box = screen.getByRole("checkbox", {
			name: /Pilih riwayat Notion/i,
		});
		fireEvent.click(box);

		expect(checked(box)).toBe(true);
		expect(screen.getByText("1 dipilih")).toBeDefined();
	});

	it("selects the row from the row itself instead of navigating", () => {
		renderView({ items: [row("a")], total: 1 });

		enterSelectionMode();
		fireEvent.click(screen.getByRole("button", { name: /Notion/i }));

		expect(screen.getByText("1 dipilih")).toBeDefined();
		expect(screen.queryByRole("link", { name: /Notion/i })).toBeNull();
	});

	it("hides the single row delete action while a bulk delete is available", () => {
		renderView({ items: [row("a")], total: 1 });

		expect(
			screen.getByRole("button", { name: /Hapus riwayat Notion/i }),
		).toBeDefined();

		enterSelectionMode();
		expect(
			screen.queryByRole("button", { name: /Hapus riwayat Notion/i }),
		).toBeNull();
		expect(screen.getByRole("button", { name: "Hapus" })).toBeDefined();
	});

	it("selects every row on the current page", () => {
		renderView({ items: [row("a"), row("b", "framer.com")], total: 12 });

		enterSelectionMode();
		fireEvent.click(
			screen.getByRole("checkbox", { name: /Pilih semua di halaman ini/i }),
		);

		expect(screen.getByText("2 dipilih")).toBeDefined();
		expect(screen.getByText("2 hasil dipilih di halaman ini.")).toBeDefined();
	});

	it("extends the selection to every filtered result through the server snapshot", async () => {
		const onPrepareSelection = vi
			.fn()
			.mockResolvedValue({ ids: ["a", "b", "c"], total: 3, truncated: false });
		renderView({
			items: [row("a"), row("b", "framer.com")],
			total: 3,
			onPrepareSelection,
		});

		enterSelectionMode();
		fireEvent.click(
			screen.getByRole("checkbox", { name: /Pilih semua di halaman ini/i }),
		);
		fireEvent.click(
			screen.getByRole("button", {
				name: /Pilih semua 3 hasil sesuai filter/i,
			}),
		);

		await vi.waitFor(() => expect(screen.getByText("3 dipilih")).toBeDefined());
		expect(onPrepareSelection).toHaveBeenCalledTimes(1);
	});

	it("reports a truncated snapshot instead of claiming the whole set", async () => {
		const onPrepareSelection = vi.fn().mockResolvedValue({
			ids: ["a"],
			total: 120,
			truncated: true,
		});
		renderView({
			items: [row("a")],
			total: 120,
			onPrepareSelection,
		});

		enterSelectionMode();
		fireEvent.click(
			screen.getByRole("checkbox", { name: /Pilih semua di halaman ini/i }),
		);
		fireEvent.click(
			screen.getByRole("button", {
				name: /Pilih semua 120 hasil sesuai filter/i,
			}),
		);

		await vi.waitFor(() =>
			expect(
				screen.getByText(/1 dari 120 hasil bisa dipilih sekaligus/),
			).toBeDefined(),
		);
		expect(screen.getByText("1 dipilih")).toBeDefined();
	});

	it("confirms the exact number of selected results before deleting", async () => {
		const onDeleteMany = vi
			.fn()
			.mockResolvedValue({ deleted: 2, skipped: 0, deletedIds: ["a", "b"] });
		renderView({
			items: [row("a"), row("b", "framer.com")],
			total: 2,
			onDeleteMany,
		});

		enterSelectionMode();
		fireEvent.click(
			screen.getByRole("checkbox", { name: /Pilih semua di halaman ini/i }),
		);
		fireEvent.click(screen.getByRole("button", { name: "Hapus" }));

		const dialog = screen.getByRole("dialog");
		expect(within(dialog).getByText("Hapus 2 hasil scrape?")).toBeDefined();
		expect(
			within(dialog).getByText("Hasil yang dipilih akan dihapus permanen."),
		).toBeDefined();
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Hapus 2 hasil" }),
		);

		await vi.waitFor(() =>
			expect(onDeleteMany).toHaveBeenCalledWith(["a", "b"]),
		);
	});

	it("keeps the delete action disabled while nothing is selected", () => {
		renderView({ items: [row("a")], total: 1 });

		enterSelectionMode();
		const remove = screen.getByRole("button", { name: "Hapus" });
		expect(remove.hasAttribute("disabled")).toBe(true);
	});

	it("reports a partial delete instead of claiming full success", async () => {
		const onDeleteMany = vi
			.fn()
			.mockResolvedValue({ deleted: 1, skipped: 1, deletedIds: ["a"] });
		renderView({
			items: [row("a"), row("b", "framer.com")],
			total: 2,
			onDeleteMany,
		});

		enterSelectionMode();
		fireEvent.click(
			screen.getByRole("checkbox", { name: /Pilih semua di halaman ini/i }),
		);
		fireEvent.click(screen.getByRole("button", { name: "Hapus" }));
		const dialog = screen.getByRole("dialog");
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Hapus 2 hasil" }),
		);

		await vi.waitFor(() => expect(screen.getByRole("status")).toBeDefined());
		expect(
			screen.getByText("1 dari 2 hasil dihapus. 1 hasil sudah tidak ada."),
		).toBeDefined();
		expect(screen.getByText("1 dipilih")).toBeDefined();
	});

	it("surfaces a retryable error when the bulk delete fails", async () => {
		const onDeleteMany = vi.fn().mockRejectedValue(new Error("offline"));
		renderView({
			items: [row("a")],
			total: 1,
			onDeleteMany,
		});

		enterSelectionMode();
		fireEvent.click(
			screen.getByRole("checkbox", { name: /Pilih semua di halaman ini/i }),
		);
		fireEvent.click(screen.getByRole("button", { name: "Hapus" }));
		const dialog = screen.getByRole("dialog");
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Hapus 1 hasil" }),
		);

		await vi.waitFor(() => expect(screen.getByRole("alert")).toBeDefined());
	});

	it("keeps an explicit selection while the page changes", () => {
		const { props, rerender } = renderView({
			items: [row("a")],
			total: 12,
			search: { ...baseSearch, page: 1 },
		});

		enterSelectionMode();
		fireEvent.click(
			screen.getByRole("checkbox", { name: /Pilih riwayat Notion/i }),
		);
		expect(screen.getByText("1 dipilih")).toBeDefined();

		rerender(
			<ScrapeHistoryView
				{...props}
				items={[row("b", "framer.com")]}
				search={{ ...baseSearch, page: 2 }}
			/>,
		);

		expect(screen.getByText("1 dipilih")).toBeDefined();
		expect(
			screen.getByRole("checkbox", { name: /Pilih riwayat Framer/i }),
		).toBeDefined();
	});

	it("resets a filtered scope explicitly when the filter changes", async () => {
		const onPrepareSelection = vi
			.fn()
			.mockResolvedValue({ ids: ["a", "b"], total: 2, truncated: false });
		const { props, rerender } = renderView({
			items: [row("a")],
			total: 2,
			onPrepareSelection,
		});

		enterSelectionMode();
		fireEvent.click(
			screen.getByRole("checkbox", { name: /Pilih semua di halaman ini/i }),
		);
		fireEvent.click(
			screen.getByRole("button", {
				name: /Pilih semua 2 hasil sesuai filter/i,
			}),
		);
		await vi.waitFor(() => expect(screen.getByText("2 dipilih")).toBeDefined());

		rerender(
			<ScrapeHistoryView {...props} search={{ ...baseSearch, q: "stitch" }} />,
		);

		await vi.waitFor(() => expect(screen.getByText("0 dipilih")).toBeDefined());
		expect(
			screen.getByText("Filter berubah, pilihan dibersihkan."),
		).toBeDefined();
	});
});
