import {
	type HistorySelectionController,
	type HistorySelectionScope,
	useHistorySelection,
} from "@/lib/history-selection";

export type ScrapeHistorySelectionScope = HistorySelectionScope;
export type ScrapeHistorySelectionController = HistorySelectionController;

/**
 * Re-export the shared history selection controller for VibeScrape backwards compatibility.
 */
export const useScrapeHistorySelection = useHistorySelection;
