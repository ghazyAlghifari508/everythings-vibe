import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import {
	SCRAPE_HISTORY_DEFAULT_PAGE_SIZE,
	SCRAPE_HISTORY_PAGE_SIZES,
} from "@/features/scrape/types/scrape-constants";
import type { ScrapeHistorySearch } from "@/features/scrape/types/scrape-contract";
import { ScrapeFilterSelect } from "./scrape-filter-select";

const NAV_BUTTON_CLASS =
	"inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-graphite bg-charcoal text-sm text-snow transition-colors hover:border-fog/40 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo";

// The page size is a business rule, so the dropdown only offers the sizes the
// product allows and falls back to the default for anything else.
function resolveHistoryPageSize(value: string): number {
	const parsed = Number(value);
	return (SCRAPE_HISTORY_PAGE_SIZES as readonly number[]).includes(parsed)
		? parsed
		: SCRAPE_HISTORY_DEFAULT_PAGE_SIZE;
}

function pageWindow(
	page: number,
	totalPages: number,
): Array<{ type: "page"; page: number } | { type: "gap"; after: number }> {
	const numbers =
		totalPages <= 7
			? Array.from({ length: totalPages }, (_, index) => index + 1)
			: [
					...new Set(
						[1, 2, page - 1, page, page + 1, totalPages - 1, totalPages].filter(
							(n) => n >= 1 && n <= totalPages,
						),
					),
				].sort((a, b) => a - b);
	const windowed: Array<
		{ type: "page"; page: number } | { type: "gap"; after: number }
	> = [];
	for (const current of numbers) {
		const previous = windowed[windowed.length - 1];
		const previousPage =
			previous?.type === "page" ? previous.page : (previous?.after ?? null);
		if (previousPage !== null && current - previousPage > 1) {
			windowed.push({ type: "gap", after: previousPage });
		}
		windowed.push({ type: "page", page: current });
	}
	return windowed;
}

// The footer reports the exact slice the user is looking at, so the numbers on
// screen always come from the same query that produced the rows.
export function ScrapeHistoryPagination({
	page,
	totalPages,
	total,
	range,
	search,
	onQueryChange,
}: {
	page: number;
	totalPages: number;
	total: number;
	range: { start: number; end: number };
	search: ScrapeHistorySearch;
	onQueryChange: (next: ScrapeHistorySearch) => void;
}) {
	if (total <= 0) return null;
	return (
		<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-graphite pt-4">
			<p className="text-xs text-fog tabular-nums">
				Menampilkan {range.start}–{range.end} dari {total}
			</p>

			<div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-3">
				<ScrapeFilterSelect
					label="Baris per halaman"
					value={String(search.pageSize)}
					onChange={(value) =>
						onQueryChange({
							...search,
							pageSize: resolveHistoryPageSize(value),
							page: 1,
						})
					}
					options={SCRAPE_HISTORY_PAGE_SIZES.map((size) => ({
						value: String(size),
						label: String(size),
					}))}
				/>

				{totalPages > 1 ? (
					<nav
						aria-label="Pagination riwayat"
						className="flex items-center gap-1"
					>
						<div className="hidden items-center gap-1 sm:flex">
							<button
								type="button"
								onClick={() => onQueryChange({ ...search, page: page - 1 })}
								disabled={page <= 1}
								aria-label="Halaman sebelumnya"
								className={NAV_BUTTON_CLASS}
							>
								<Icon icon={ArrowLeft01Icon} size={16} aria-hidden="true" />
							</button>
							{pageWindow(page, totalPages).map((entry) =>
								entry.type === "gap" ? (
									<span
										key={`gap-after-${entry.after}`}
										aria-hidden="true"
										className="px-1 text-xs text-fog"
									>
										...
									</span>
								) : (
									<button
										key={`page-${entry.page}`}
										type="button"
										onClick={() =>
											onQueryChange({ ...search, page: entry.page })
										}
										aria-label={`Halaman ${entry.page}`}
										aria-current={entry.page === page ? "page" : undefined}
										className={`min-h-11 min-w-11 rounded-md px-2 text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo ${
											entry.page === page
												? "bg-snow text-onyx"
												: "border border-graphite bg-charcoal text-fog hover:border-fog/40 hover:text-snow"
										}`}
									>
										{entry.page}
									</button>
								),
							)}
							<button
								type="button"
								onClick={() => onQueryChange({ ...search, page: page + 1 })}
								disabled={page >= totalPages}
								aria-label="Halaman berikutnya"
								className={NAV_BUTTON_CLASS}
							>
								<Icon icon={ArrowRight01Icon} size={16} aria-hidden="true" />
							</button>
						</div>

						<div className="flex items-center gap-1 sm:hidden">
							<button
								type="button"
								onClick={() => onQueryChange({ ...search, page: page - 1 })}
								disabled={page <= 1}
								aria-label="Halaman sebelumnya"
								className={NAV_BUTTON_CLASS}
							>
								<Icon icon={ArrowLeft01Icon} size={16} aria-hidden="true" />
							</button>
							<span
								aria-current="page"
								className="min-w-14 text-center text-xs text-fog tabular-nums"
							>
								{page} / {totalPages}
							</span>
							<button
								type="button"
								onClick={() => onQueryChange({ ...search, page: page + 1 })}
								disabled={page >= totalPages}
								aria-label="Halaman berikutnya"
								className={NAV_BUTTON_CLASS}
							>
								<Icon icon={ArrowRight01Icon} size={16} aria-hidden="true" />
							</button>
						</div>
					</nav>
				) : null}
			</div>
		</div>
	);
}
