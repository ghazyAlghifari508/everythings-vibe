import { useEffect, useState } from "react";
import type { ScrapeHistorySearch } from "@/features/scrape/types/scrape-contract";
import { SCRAPE_HISTORY_SEARCH_DEBOUNCE_MS } from "@/lib/constants";

// The URL search is the source of truth; the input keeps a local draft and only
// commits it after the debounce window so typing does not rewrite the route on
// every keystroke.
export function useScrapeHistorySearchDraft(
	search: ScrapeHistorySearch,
	onQueryChange: (next: ScrapeHistorySearch) => void,
): readonly [string, (next: string) => void] {
	const [draft, setDraft] = useState(search.q);

	useEffect(() => {
		setDraft(search.q);
	}, [search.q]);

	useEffect(() => {
		if (draft === search.q) return;
		const timer = setTimeout(() => {
			onQueryChange({ ...search, q: draft, page: 1 });
		}, SCRAPE_HISTORY_SEARCH_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [draft, search, onQueryChange]);

	return [draft, setDraft] as const;
}
