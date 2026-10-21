import {
	Delete02Icon,
	Loading03Icon,
	MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { formatHistoryDate } from "@/features/scrape/utils/scrape-history";
import { displaySiteName } from "@/features/scrape/utils/site-name";
import type { ScrapeHistoryItem } from "./scrape-history-list-item";

// The row itself is the link to the result, so the destructive action lives in
// an overflow menu that is a sibling of that link. Nesting a button inside the
// link would make the row both a navigation target and a form control.
export function ScrapeHistoryRowActions({
	item,
	deleting,
	onRequestDelete,
}: {
	item: ScrapeHistoryItem;
	deleting: boolean;
	onRequestDelete: (item: ScrapeHistoryItem) => void;
}) {
	const siteName = displaySiteName(item.domain);
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					aria-label={`Aksi riwayat ${siteName}, ${formatHistoryDate(item.createdAt)}`}
					disabled={deleting}
					className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-fog transition-colors hover:bg-onyx hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo disabled:opacity-50"
				>
					{deleting ? (
						<Icon
							icon={Loading03Icon}
							size={16}
							aria-hidden="true"
							className="animate-spin"
						/>
					) : (
						<Icon icon={MoreHorizontalIcon} size={16} aria-hidden="true" />
					)}
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem
					onSelect={() => onRequestDelete(item)}
					className="text-crimson focus:text-crimson"
				>
					<Icon
						icon={Delete02Icon}
						size={14}
						aria-hidden="true"
						className="mr-2"
					/>
					Hapus hasil
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
