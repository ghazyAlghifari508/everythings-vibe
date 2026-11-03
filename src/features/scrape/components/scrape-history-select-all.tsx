import { HistorySelectAll } from "@/components/ui/history-select-all";

export function ScrapeHistorySelectAll(props: {
	pageIds: readonly string[];
	selectedIds: ReadonlySet<string>;
	total: number;
	filteredScopeActive: boolean;
	preparing: boolean;
	onTogglePage: (selected: boolean) => void;
	onSelectAllFiltered: () => void;
}) {
	return <HistorySelectAll noun="hasil" {...props} />;
}
