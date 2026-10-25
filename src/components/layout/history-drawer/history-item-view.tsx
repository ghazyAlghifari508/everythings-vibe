import { cn } from "@/lib/utils";
import { describeStatus, formatRelativeTime } from "./history-formatters";
import { CATEGORY_LABEL, type DrawerHistoryItem } from "./history-types";

interface HistoryItemViewProps {
	item: DrawerHistoryItem;
	onSelect: (item: DrawerHistoryItem) => void;
}

export function HistoryItemView({ item, onSelect }: HistoryItemViewProps) {
	return (
		<button
			type="button"
			onClick={() => onSelect(item)}
			className="flex flex-col gap-1.5 rounded-lg border border-graphite bg-charcoal/40 p-3 text-left transition-colors hover:border-steel hover:bg-charcoal/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
		>
			<div className="flex items-center justify-between gap-2">
				<span
					className={cn(
						"shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase",
						"border-indigo/30 bg-indigo/15 text-indigo",
					)}
				>
					{CATEGORY_LABEL[item.type]}
				</span>
				<span className="shrink-0 font-mono text-[10px] text-fog">
					{formatRelativeTime(item.updatedAt)}
				</span>
			</div>
			<span className="truncate text-xs font-semibold text-mist">
				{item.name}
			</span>
			<span className="text-[11px] text-fog">{describeStatus(item)}</span>
		</button>
	);
}
