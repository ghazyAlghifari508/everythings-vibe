// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScrapeMode } from "@/db/schema";
import type { ScrapeHistorySearch } from "@/features/scrape/types/scrape-contract";
import type { ScrapeHistoryItem } from "../components/scrape-history-list";
import {
	ScrapeHistoryView,
	type ScrapeHistoryViewProps,
} from "../components/scrape-history-view";

vi.mock("@tanstack/react-router", () => ({
	Link: (props: {
		children: React.ReactNode;
		to: string;
		className?: string;
		search?: unknown;
	}) => (
		<a
			href={props.to}
			className={props.className}
			data-search={props.search ? JSON.stringify(props.search) : undefined}
		>
			{props.children}
		</a>
	),
}));

const baseSearch: ScrapeHistorySearch = {
	q: "",
	sort: "newest",
	page: 1,
	pageSize: 10,
};

const defaultResolved = { deleted: 0, skipped: 0, deletedIds: [] };
const defaultPrepare = { ids: [], total: 0, truncated: false };

const row = (
	id: string,
	domain = "www.notion.com",
	mode: ScrapeMode = "design",
): ScrapeHistoryItem => ({
	id,
	sourceUrl: `https://${domain}/`,
	domain,
	title: null,
	status: "completed",
	mode,
	createdAt: "2026-10-14T00:00:00.000Z",
});

function renderView(overrides: Partial<ScrapeHistoryViewProps> = {}) {
	const props: ScrapeHistoryViewProps = {
		items: [],
		total: 0,
		search: baseSearch,
		onQueryChange: vi.fn(),
		onDelete: vi.fn().mockResolvedValue({ ok: true }),
		onDeleteMany: vi.fn().mockResolvedValue(defaultResolved),
		onPrepareSelection: vi.fn().mockResolvedValue(defaultPrepare),
		...overrides,
	};
	return { props, ...render(<ScrapeHistoryView {...props} />) };
}

function installRadixDomPolyfills() {
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		},
	);
	vi.stubGlobal(
		"DOMRect",
		class {
			x = 0;
			y = 0;
			width = 0;
			height = 0;
			top = 0;
			left = 0;
			right = 0;
			bottom = 0;
		},
	);
	if (!Element.prototype.hasPointerCapture) {
		Element.prototype.hasPointerCapture = () => false;
		Element.prototype.setPointerCapture = () => {};
		Element.prototype.releasePointerCapture = () => {};
	}
	if (!Element.prototype.scrollIntoView)
		Element.prototype.scrollIntoView = () => {};
}

function openActionsMenu(index = 0) {
	fireEvent.pointerDown(
		screen.getAllByRole("button", { name: /Aksi riwayat/i })[index],
		{ button: 0, ctrlKey: false, pointerType: "mouse" },
	);
}

function selectFirstItem() {
	openActionsMenu(0);
	fireEvent.click(screen.getByRole("menuitem", { name: "Pilih" }));
}

function selectAllPage() {
	fireEvent.click(
		screen.getByRole("checkbox", { name: /Pilih semua di halaman ini/i }),
	);
}

function confirmBulkDelete(label: string) {
	fireEvent.click(screen.getByRole("button", { name: label }));
	fireEvent.click(
		within(screen.getByRole("dialog")).getByRole("button", { name: label }),
	);
}

const checked = (box: HTMLElement) =>
	box instanceof HTMLInputElement && box.checked;

beforeEach(installRadixDomPolyfills);

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("VibeScrape history selection UX", () => {
	it("initial state prioritizes browsing without persistent selection controls or select-all checkbox", () => {
		renderView({ items: [row("a")], total: 1 });

		expect(screen.getByRole("link", { name: /Notion/i })).toBeDefined();
		for (const name of [/^Pilih$/i, /Selesai memilih/i, /^Batal$/i]) {
			expect(screen.queryByRole("button", { name })).toBeNull();
		}
		expect(screen.queryByRole("checkbox")).toBeNull();
		expect(
			screen.getByRole("button", { name: /Aksi riwayat Notion/i }),
		).toBeDefined();
	});

	it("selects a row via overflow menu and automatically activates checkboxes and contextual selection bar", () => {
		renderView({ items: [row("a")], total: 1 });

		expect(screen.queryByRole("checkbox")).toBeNull();
		selectFirstItem();

		const box = screen.getByRole("checkbox", {
			name: /Pilih riwayat Notion/i,
		});
		expect(checked(box)).toBe(true);
		expect(screen.getByText("1 hasil dipilih")).toBeDefined();
		expect(screen.getByRole("button", { name: /^Batal$/i })).toBeDefined();
		expect(screen.getByRole("button", { name: "Hapus 1" })).toBeDefined();
		expect(screen.queryByRole("link", { name: /Notion/i })).toBeNull();
		expect(screen.getByRole("button", { name: /Notion/i })).toBeDefined();
	});

	it("restores clean default state when clicking Batal in selection bar", () => {
		renderView({ items: [row("a")], total: 1 });

		selectFirstItem();
		expect(screen.getByText("1 hasil dipilih")).toBeDefined();
		expect(
			screen.getByRole("checkbox", { name: /Pilih riwayat Notion/i }),
		).toBeDefined();

		fireEvent.click(screen.getByRole("button", { name: /^Batal$/i }));
		expect(screen.queryByText(/hasil dipilih/i)).toBeNull();
		expect(screen.getByRole("link", { name: /Notion/i })).toBeDefined();
		expect(screen.queryByRole("checkbox")).toBeNull();
	});

	it("enters active selection via mobile overflow menu (⋯ -> Pilih)", () => {
		renderView({ items: [row("a")], total: 1 });

		openActionsMenu(0);
		fireEvent.click(screen.getByRole("menuitem", { name: "Pilih" }));

		expect(screen.getByText("1 hasil dipilih")).toBeDefined();
		const box = screen.getByRole("checkbox", {
			name: /Pilih riwayat Notion/i,
		});
		expect(checked(box)).toBe(true);
	});

	it("toggles selection by clicking the row summary button in active selection mode", () => {
		renderView({
			items: [row("a"), row("b", "framer.com")],
			total: 2,
		});

		selectFirstItem();
		expect(screen.getByText("1 hasil dipilih")).toBeDefined();

		fireEvent.click(screen.getByRole("button", { name: /Framer/i }));
		expect(screen.getByText("2 hasil dipilih")).toBeDefined();

		fireEvent.click(screen.getByRole("button", { name: /Notion/i }));
		expect(screen.getByText("1 hasil dipilih")).toBeDefined();
	});

	it("selects every row on the current page once active selection is entered", () => {
		renderView({ items: [row("a"), row("b", "framer.com")], total: 12 });

		selectFirstItem();
		expect(screen.getByText("1 hasil dipilih")).toBeDefined();

		selectAllPage();
		expect(screen.getByText("2 hasil dipilih")).toBeDefined();
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

		selectFirstItem();
		selectAllPage();
		fireEvent.click(
			screen.getByRole("button", {
				name: /Pilih semua 3 hasil sesuai filter/i,
			}),
		);

		await vi.waitFor(() =>
			expect(screen.getByText("3 hasil dipilih")).toBeDefined(),
		);
		expect(onPrepareSelection).toHaveBeenCalledTimes(1);
	});

	it("reports a truncated snapshot instead of claiming the whole set", async () => {
		const onPrepareSelection = vi
			.fn()
			.mockResolvedValue({ ids: ["a"], total: 120, truncated: true });
		renderView({ items: [row("a")], total: 120, onPrepareSelection });

		selectFirstItem();
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
		expect(screen.getByText("1 hasil dipilih")).toBeDefined();
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

		selectFirstItem();
		selectAllPage();
		fireEvent.click(screen.getByRole("button", { name: "Hapus 2" }));

		const dialog = screen.getByRole("dialog");
		expect(within(dialog).getByText("Hapus 2 hasil scrape?")).toBeDefined();
		expect(
			within(dialog).getByText("Hasil yang dipilih akan dihapus permanen."),
		).toBeDefined();
		fireEvent.click(within(dialog).getByRole("button", { name: "Hapus 2" }));

		await vi.waitFor(() =>
			expect(onDeleteMany).toHaveBeenCalledWith(["a", "b"]),
		);
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

		selectFirstItem();
		selectAllPage();
		confirmBulkDelete("Hapus 2");

		await vi.waitFor(() => expect(screen.getByRole("status")).toBeDefined());
		expect(
			screen.getByText("1 dari 2 hasil dihapus. 1 hasil sudah tidak ada."),
		).toBeDefined();
		expect(screen.getByText("1 hasil dipilih")).toBeDefined();
	});

	it("surfaces a retryable error when the bulk delete fails", async () => {
		const onDeleteMany = vi.fn().mockRejectedValue(new Error("offline"));
		renderView({
			items: [row("a")],
			total: 1,
			onDeleteMany,
		});

		selectFirstItem();
		confirmBulkDelete("Hapus 1");

		await vi.waitFor(() => expect(screen.getByRole("alert")).toBeDefined());
	});

	it("keeps an explicit selection while the page changes", () => {
		const { props, rerender } = renderView({
			items: [row("a")],
			total: 12,
			search: { ...baseSearch, page: 1 },
		});

		selectFirstItem();
		expect(screen.getByText("1 hasil dipilih")).toBeDefined();

		rerender(
			<ScrapeHistoryView
				{...props}
				items={[row("b", "framer.com")]}
				search={{ ...baseSearch, page: 2 }}
			/>,
		);

		expect(screen.getByText("1 hasil dipilih")).toBeDefined();
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

		selectFirstItem();
		fireEvent.click(
			screen.getByRole("button", {
				name: /Pilih semua 2 hasil sesuai filter/i,
			}),
		);
		await vi.waitFor(() =>
			expect(screen.getByText("2 hasil dipilih")).toBeDefined(),
		);

		rerender(
			<ScrapeHistoryView {...props} search={{ ...baseSearch, q: "stitch" }} />,
		);

		await vi.waitFor(() =>
			expect(screen.getByText("0 hasil dipilih")).toBeDefined(),
		);
		expect(
			screen.getByText("Filter berubah, pilihan dibersihkan."),
		).toBeDefined();
	});
});
