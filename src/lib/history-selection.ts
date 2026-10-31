import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Multi-select state shared by every History surface (VibeScrape, Existing
 * Codebase). A snapshot is the explicit id set an authoritative selection
 * resolved to, so the delete request carries ids instead of re-evaluating the
 * filter that produced them.
 */
export interface HistorySelectionSnapshot {
	ids: string[];
	total: number;
	truncated: boolean;
}

export type HistorySelectionScope = "none" | "filtered";

export interface HistorySelectionController {
	scope: HistorySelectionScope;
	ids: ReadonlySet<string>;
	count: number;
	filteredTotal: number;
	truncated: boolean;
	notice: string | null;
	clear: () => void;
	toggle: (id: string) => void;
	replace: (ids: readonly string[]) => void;
	setPageSelection: (pageIds: readonly string[], selected: boolean) => void;
	applyFiltered: (selection: HistorySelectionSnapshot) => void;
}

export const HISTORY_SELECTION_FILTER_RESET_NOTICE =
	"Filter berubah, pilihan dibersihkan.";

// The selection holds two kinds of intent. An explicit id set records the rows
// the user ticked, and those ids survive paging, sorting and filter changes
// because the consent was given per row. A filtered scope stands for every row
// matching a filter, so it only stays meaningful while that filter is unchanged.
export function useHistorySelection(
	filterKey: string,
): HistorySelectionController {
	const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set<string>());
	const [scope, setScope] = useState<HistorySelectionScope>("none");
	const [filteredTotal, setFilteredTotal] = useState(0);
	const [truncated, setTruncated] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);
	const previousFilterKey = useRef(filterKey);

	useEffect(() => {
		if (previousFilterKey.current === filterKey) return;
		previousFilterKey.current = filterKey;
		// A "select all matching" scope belongs to the filter that produced it.
		// Once the filter changes that scope is ambiguous, so it is reset
		// explicitly instead of silently widening or narrowing the target.
		if (scope !== "filtered") return;
		setIds(new Set<string>());
		setScope("none");
		setFilteredTotal(0);
		setTruncated(false);
		setNotice(HISTORY_SELECTION_FILTER_RESET_NOTICE);
	}, [filterKey, scope]);

	const resetScope = useCallback(() => {
		setScope("none");
		setFilteredTotal(0);
		setTruncated(false);
	}, []);

	const clear = useCallback(() => {
		setIds(new Set<string>());
		resetScope();
		setNotice(null);
	}, [resetScope]);

	const toggle = useCallback(
		(id: string) => {
			const next = new Set(ids);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			setIds(next);
			resetScope();
			setNotice(null);
		},
		[ids, resetScope],
	);

	const replace = useCallback(
		(nextIds: readonly string[]) => {
			setIds(new Set(nextIds));
			resetScope();
			setNotice(null);
		},
		[resetScope],
	);

	const setPageSelection = useCallback(
		(pageIds: readonly string[], selected: boolean) => {
			const next = new Set(ids);
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
			if (!changed) return;
			setIds(next);
			resetScope();
			setNotice(null);
		},
		[ids, resetScope],
	);

	const applyFiltered = useCallback((selection: HistorySelectionSnapshot) => {
		setIds(new Set(selection.ids));
		setScope("filtered");
		setFilteredTotal(selection.total);
		setTruncated(selection.truncated);
		setNotice(null);
	}, []);

	return useMemo(
		() => ({
			scope,
			ids,
			count: ids.size,
			filteredTotal,
			truncated,
			notice,
			clear,
			toggle,
			replace,
			setPageSelection,
			applyFiltered,
		}),
		[
			scope,
			ids,
			filteredTotal,
			truncated,
			notice,
			clear,
			toggle,
			replace,
			setPageSelection,
			applyFiltered,
		],
	);
}
