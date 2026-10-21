import {
	Alert02Icon,
	ArrowRight01Icon,
	Loading03Icon,
	Tick01Icon,
} from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { Icon } from "@/components/ui/icon";
import type { ScrapeMode } from "@/db/schema";
import {
	type buildHistoryDetailSearch,
	formatHistoryDate,
	historyStatusLabel,
	modeLabel,
	resolveHistoryStatusGroup,
} from "@/features/scrape/utils/scrape-history";
import {
	imageCountsLabel,
	imageCountsSummary,
	type imageResultCounts,
} from "@/features/scrape/utils/scrape-images";
import { displaySiteName } from "@/features/scrape/utils/site-name";
import { formatDateTime } from "@/lib/utils";
import { ScrapeHistoryRowActions } from "./scrape-history-row-actions";

export interface ScrapeHistoryItem {
	id: string;
	sourceUrl: string;
	domain: string;
	title: string | null;
	status: string;
	mode?: ScrapeMode;
	createdAt: string;
	imageCounts?: ReturnType<typeof imageResultCounts>;
}

// The row is one grid so the columns line up across every row of the list.
// Below the medium breakpoint the same cells collapse into two readable lines,
// and the mode travels with the domain so neither of them gets squeezed.
const ROW_CONTENT_CLASS =
	"grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_auto] items-center gap-x-3 gap-y-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:gap-x-4";

function ScrapeHistoryStatus({
	status,
	processing,
	failed,
}: {
	status: string;
	processing: boolean;
	failed: boolean;
}) {
	return (
		<span
			className={`inline-flex items-center gap-1.5 text-xs ${
				failed ? "text-crimson" : "text-fog"
			}`}
		>
			{processing ? (
				<Icon
					icon={Loading03Icon}
					size={12}
					aria-hidden="true"
					className="animate-spin"
				/>
			) : failed ? (
				<Icon icon={Alert02Icon} size={12} aria-hidden="true" />
			) : (
				<Icon icon={Tick01Icon} size={12} aria-hidden="true" />
			)}
			{historyStatusLabel(status)}
		</span>
	);
}

export function ScrapeHistoryRow({
	item,
	detailSearch,
	deleting,
	onRequestDelete,
	selectionMode = false,
	selected = false,
	onToggleSelect,
}: {
	item: ScrapeHistoryItem;
	detailSearch: ReturnType<typeof buildHistoryDetailSearch>;
	deleting: boolean;
	onRequestDelete: (item: ScrapeHistoryItem) => void;
	selectionMode?: boolean;
	selected?: boolean;
	onToggleSelect?: (id: string) => void;
}) {
	const siteName = displaySiteName(item.domain);
	const statusGroup = resolveHistoryStatusGroup(item.status);
	const processing = statusGroup === "processing";
	const failed = statusGroup === "failed";

	const content = (
		<>
			<span className="col-start-1 row-start-1 min-w-0 truncate text-sm font-semibold text-snow md:row-start-1">
				{siteName}
			</span>

			<span className="col-start-1 row-start-2 flex min-w-0 items-center gap-1.5 md:contents">
				<span className="flex shrink-0 items-center gap-1.5 md:w-28 md:flex-col md:items-start md:gap-0.5 md:row-start-1 md:row-span-2 md:col-start-2">
					<span className="truncate text-xs text-fog">
						{modeLabel(item.mode)}
					</span>
					{item.imageCounts ? (
						<span
							className="truncate text-[11px] text-fog/80"
							title={imageCountsLabel(item.imageCounts)}
						>
							{imageCountsSummary(item.imageCounts)}
						</span>
					) : null}
				</span>
				<span className="min-w-0 truncate font-mono text-[11px] text-fog md:col-start-1 md:row-start-2">
					{item.domain}
				</span>
			</span>

			<span className="col-start-2 row-start-1 md:col-start-3 md:row-start-1 md:row-span-2 md:w-28">
				<ScrapeHistoryStatus
					status={item.status}
					processing={processing}
					failed={failed}
				/>
			</span>

			<time
				dateTime={item.createdAt}
				title={formatDateTime(item.createdAt)}
				className="col-start-2 row-start-2 text-xs text-fog tabular-nums md:col-start-4 md:row-start-1 md:row-span-2 md:w-24"
			>
				{formatHistoryDate(item.createdAt)}
			</time>
		</>
	);

	return (
		<li
			data-selected={selectionMode ? selected : undefined}
			className={`group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-graphite/40 ${
				selected ? "bg-snow/5" : ""
			}`}
		>
			{selectionMode ? (
				<label className="flex size-11 shrink-0 items-center justify-center">
					<input
						type="checkbox"
						checked={selected}
						onChange={() => onToggleSelect?.(item.id)}
						aria-label={`Pilih riwayat ${siteName}`}
						className="size-5 accent-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
					/>
				</label>
			) : null}

			{selectionMode ? (
				<button
					type="button"
					onClick={() => onToggleSelect?.(item.id)}
					aria-pressed={selected}
					className={ROW_CONTENT_CLASS}
				>
					{content}
				</button>
			) : (
				<Link
					to="/scrape/$id"
					params={{ id: item.id }}
					search={detailSearch}
					className={ROW_CONTENT_CLASS}
				>
					{content}
				</Link>
			)}

			{selectionMode ? null : (
				<div className="flex shrink-0 items-center gap-1">
					<Icon
						icon={ArrowRight01Icon}
						size={16}
						aria-hidden="true"
						className="hidden shrink-0 text-fog transition-transform group-hover:translate-x-0.5 md:block"
					/>
					<ScrapeHistoryRowActions
						item={item}
						deleting={deleting}
						onRequestDelete={onRequestDelete}
					/>
				</div>
			)}
		</li>
	);
}
