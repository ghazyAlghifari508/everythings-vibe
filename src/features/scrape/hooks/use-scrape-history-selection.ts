import { useEffect, useMemo } from "react";
import { create } from "zustand";
import type { ScrapeHistoryBulkSelection } from "@/features/scrape/types/scrape-contract";

export type ScrapeHistorySelectionScope = "none" | "filtered";

export interface ScrapeHistorySelectionController {
	active: boolean;
	scope: ScrapeHistorySelectionScope;
	ids: ReadonlySet<string>;
	count: number;
	filteredTotal: number;
	truncated: boolean;
	notice: string | null;
	enter: () => void;
	exit: () => void;
	clear: () => void;
	toggle: (id: string) => void;
	replace: (ids: readonly string[]) => void;
	setPageSelection: (pageIds: readonly string[], selected: boolean) => void;
	applyFiltered: (selection: ScrapeHistoryBulkSelection) => void;
}

const FILTER_RESET_NOTICE = "Filter berubah, pilihan dibersihkan.";

interface ScrapeHistorySelectionState {
	active: boolean;
	scope: ScrapeHistorySelectionScope;
	ids: string[];
	filteredTotal: number;
	truncated: boolean;
	notice: string | null;
	filterKey: string;
}

const INITIAL_SELECTION_STATE: ScrapeHistorySelectionState = {
	active: false,
	scope: "none",
	ids: [],
	filteredTotal: 0,
	truncated: false,
	notice: null,
	filterKey: "",
};

// The selection lives outside the history component so it survives the round
// trip to the result detail. Component state would be discarded on every
// navigation, which would silently drop the rows the user already consented to
// delete.
const useSelectionStore = create<ScrapeHistorySelectionState>(() => ({
	...INITIAL_SELECTION_STATE,
}));

export function resetScrapeHistorySelection(): void {
	useSelectionStore.setState({ ...INITIAL_SELECTION_STATE });
}

function clearFilteredScope(state: ScrapeHistorySelectionState) {
	return {
		...state,
		scope: "none" as const,
		filteredTotal: 0,
		truncated: false,
	};
}

// The selection holds two kinds of intent. An explicit id set records the rows
// the user ticked, and those ids survive paging, sorting and filter changes
// because the consent was given per row. A filtered scope stands for every row
// matching a filter, so it only stays meaningful while that filter is unchanged.
export function useScrapeHistorySelection(
	filterKey: string,
): ScrapeHistorySelectionController {
	const state = useSelectionStore();
	// A filtered scope only stays meaningful while the filter that produced it
	// is unchanged, so it is already dropped on the render where the filter
	// changes instead of one render later.
	const staleScope =
		state.filterKey !== filterKey && state.scope === "filtered";
	const ids = useMemo(
		() => (staleScope ? new Set<string>() : new Set(state.ids)),
		[staleScope, state.ids],
	);

	useEffect(() => {
		useSelectionStore.setState((current) => {
			if (current.filterKey === filterKey) return current;
			if (current.scope !== "filtered") return { ...current, filterKey };
			return {
				...current,
				filterKey,
				scope: "none",
				ids: [],
				filteredTotal: 0,
				truncated: false,
				notice: FILTER_RESET_NOTICE,
			};
		});
	}, [filterKey]);

	const controller = useMemo<ScrapeHistorySelectionController>(
		() => ({
			active: state.active,
			scope: staleScope ? "none" : state.scope,
			ids,
			count: ids.size,
			filteredTotal: state.filteredTotal,
			truncated: state.truncated,
			notice: state.notice,
			enter: () =>
				useSelectionStore.setState((current) => ({
					...clearFilteredScope(current),
					active: true,
					ids: [],
					notice: null,
				})),
			exit: () =>
				useSelectionStore.setState((current) => ({
					...clearFilteredScope(current),
					active: false,
					ids: [],
					notice: null,
				})),
			clear: () =>
				useSelectionStore.setState((current) => ({
					...clearFilteredScope(current),
					ids: [],
					notice: null,
				})),
			toggle: (id: string) =>
				useSelectionStore.setState((current) => {
					const next = new Set(current.ids);
					if (next.has(id)) next.delete(id);
					else next.add(id);
					return {
						...clearFilteredScope(current),
						ids: [...next],
						notice: null,
					};
				}),
			replace: (nextIds: readonly string[]) =>
				useSelectionStore.setState((current) => ({
					...clearFilteredScope(current),
					ids: [...nextIds],
					notice: null,
				})),
			setPageSelection: (pageIds: readonly string[], selected: boolean) =>
				useSelectionStore.setState((current) => {
					const next = new Set(current.ids);
					let changed = false;
					for (const id of pageIds) {
						if (selected) {
							if (!next.has(id)) {
								next.add(id);
								changed = true;
							}
						} else if (next.delete(id)) {
							changed = true;
						}
					}
					if (!changed) return current;
					return {
						...clearFilteredScope(current),
						ids: [...next],
						notice: null,
					};
				}),
			applyFiltered: (selection: ScrapeHistoryBulkSelection) =>
				useSelectionStore.setState((current) => ({
					...current,
					scope: "filtered",
					ids: [...selection.ids],
					filteredTotal: selection.total,
					truncated: selection.truncated,
					notice: null,
				})),
		}),
		[ids, staleScope, state],
	);

	return controller;
}
