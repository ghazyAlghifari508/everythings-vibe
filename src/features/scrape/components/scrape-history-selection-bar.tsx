import { HistorySelectionBar } from "@/components/ui/history-selection-bar";

export function ScrapeHistorySelectionBar(props: {
	count: number;
	filteredTotal: number;
	truncated: boolean;
	notice: string | null;
	deleting: boolean;
	onClear: () => void;
	onDelete: () => void;
}) {
	return <HistorySelectionBar noun="hasil" {...props} />;
}
