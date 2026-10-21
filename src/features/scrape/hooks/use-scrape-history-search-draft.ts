import { useEffect, useRef, useState } from "react";
import { SCRAPE_HISTORY_SEARCH_DEBOUNCE_MS } from "@/features/scrape/types/scrape-constants";
import type { ScrapeHistorySearch } from "@/features/scrape/types/scrape-contract";

// The URL search is the source of truth; the input keeps a local draft and only
// commits it after the debounce window so typing does not rewrite the route on
// every keystroke. The committed query is read from a ref so an unrelated
// render never restarts the pending debounce.
export function useScrapeHistorySearchDraft(
	search: ScrapeHistorySearch,
	onQueryChange: (next: ScrapeHistorySearch) => void,
): readonly [string, (next: string) => void] {
	const [draft, setDraft] = useState(search.q);
	const searchRef = useRef(search);
	const commitRef = useRef(onQueryChange);

	useEffect(() => {
		searchRef.current = search;
		commitRef.current = onQueryChange;
	});

	useEffect(() => {
		setDraft(search.q);
	}, [search.q]);

	useEffect(() => {
		if (draft === search.q) return;
		const timer = setTimeout(() => {
			commitRef.current({ ...searchRef.current, q: draft, page: 1 });
		}, SCRAPE_HISTORY_SEARCH_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [draft, search.q]);

	return [draft, setDraft] as const;
}
