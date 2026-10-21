import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import type { ScrapeMode } from "@/db/schema";
import {
	resetScrapeHistorySelection,
	useScrapeHistorySelection,
} from "@/features/scrape/hooks/use-scrape-history-selection";
import type { ScrapeHistorySearch } from "@/features/scrape/types/scrape-contract";
import { historyFilterKey } from "@/features/scrape/utils/scrape-history";
import type { ScrapeHistoryItem } from "../components/scrape-history-list";
import { ScrapeHistoryList } from "../components/scrape-history-list";
import {
	ScrapeHistoryView,
	type ScrapeHistoryViewProps,
} from "../components/scrape-history-view";

export const baseSearch: ScrapeHistorySearch = {
	q: "",
	sort: "newest",
	page: 1,
	pageSize: 10,
};

type ListProps = Parameters<typeof ScrapeHistoryList>[0];
export type ListOwnProps = Omit<ListProps, "selection">;

// The list renders inside the page shell in the product, so the selection
// controller is created here exactly the way the view creates it.
export function HistoryListHarness(props: ListOwnProps) {
	const selection = useScrapeHistorySelection(historyFilterKey(props.search));
	return <ScrapeHistoryList {...props} selection={selection} />;
}

export function renderHistoryList(overrides: Partial<ListOwnProps> = {}) {
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

export function resetHistorySelection(): void {
	resetScrapeHistorySelection();
}

// Radix menus need a few DOM APIs that jsdom does not implement.
export function installRadixDomPolyfills(): void {
	if (!Element.prototype.hasPointerCapture) {
		Element.prototype.hasPointerCapture = () => false;
		Element.prototype.setPointerCapture = () => {};
		Element.prototype.releasePointerCapture = () => {};
	}
	if (!Element.prototype.scrollIntoView) {
		Element.prototype.scrollIntoView = () => {};
	}
}

export function openRowActions(name: RegExp): HTMLElement {
	const trigger = screen.getByRole("button", { name });
	fireEvent.pointerDown(trigger, {
		button: 0,
		ctrlKey: false,
		pointerType: "mouse",
	});
	return trigger;
}

export function historyRow(
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

export function historyViewProps(
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

export function renderHistoryView(
	overrides: Partial<ScrapeHistoryViewProps> = {},
) {
	const props = historyViewProps(overrides);
	const rendered = render(<ScrapeHistoryView {...props} />);
	return { props, ...rendered };
}

export function enterSelectionMode(): void {
	fireEvent.click(screen.getByRole("button", { name: "Pilih" }));
}
