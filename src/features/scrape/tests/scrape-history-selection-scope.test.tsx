// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScrapeHistoryView } from "../components/scrape-history-view";
import {
	enterSelectionMode,
	historyRow,
	historyViewProps,
	installRadixDomPolyfills,
	renderHistoryView,
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

describe("VibeScrape history selection scope", () => {
	it("keeps an explicit selection while the page changes", () => {
		const { props, rerender } = renderHistoryView({
			items: [historyRow("a")],
			total: 12,
			search: { ...historyViewProps().search, page: 1 },
		});

		enterSelectionMode();
		fireEvent.click(
			screen.getByRole("checkbox", { name: /Pilih riwayat Notion/i }),
		);
		expect(screen.getByText("1 dipilih")).toBeDefined();

		rerender(
			<ScrapeHistoryView
				{...props}
				items={[historyRow("b", "framer.com")]}
				search={{ ...historyViewProps().search, page: 2 }}
			/>,
		);

		expect(screen.getByText("1 dipilih")).toBeDefined();
		expect(
			screen.getByRole("checkbox", { name: /Pilih riwayat Framer/i }),
		).toBeDefined();
	});

	it("keeps the selection when the user returns from the result detail", () => {
		const props = historyViewProps({ items: [historyRow("a")], total: 1 });
		const { unmount } = render(<ScrapeHistoryView {...props} />);

		enterSelectionMode();
		fireEvent.click(
			screen.getByRole("checkbox", { name: /Pilih riwayat Notion/i }),
		);
		expect(screen.getByText("1 dipilih")).toBeDefined();

		// Navigating to the result detail unmounts the list, and coming back
		// must not silently drop the rows the user already selected.
		unmount();
		render(<ScrapeHistoryView {...props} />);

		expect(screen.getByText("1 dipilih")).toBeDefined();
		expect(
			screen.getByRole("checkbox", { name: /Pilih riwayat Notion/i }),
		).toBeDefined();
	});

	it("resets a filtered scope explicitly when the filter changes", async () => {
		const onPrepareSelection = vi
			.fn()
			.mockResolvedValue({ ids: ["a", "b"], total: 2, truncated: false });
		const { props, rerender } = renderHistoryView({
			items: [historyRow("a")],
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
			<ScrapeHistoryView
				{...props}
				search={{ ...historyViewProps().search, q: "stitch" }}
			/>,
		);

		await vi.waitFor(() => expect(screen.getByText("0 dipilih")).toBeDefined());
		expect(
			screen.getByText("Filter berubah, pilihan dibersihkan."),
		).toBeDefined();
	});
});
