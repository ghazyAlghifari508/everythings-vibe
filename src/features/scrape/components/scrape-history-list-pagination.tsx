import { ChevronLeft, ChevronRight } from "lucide-react";
import { SCRAPE_HISTORY_PAGE_SIZES } from "@/features/scrape/types/scrape-constants";
import type { ScrapeHistorySearch } from "@/features/scrape/types/scrape-contract";
import { ScrapeFilterSelect } from "./scrape-filter-select";

const NAV_BUTTON_DESKTOP_CLASS =
	"inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-graphite bg-charcoal px-2 text-sm text-snow transition-colors hover:border-fog/40 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo";
const NAV_BUTTON_MOBILE_CLASS =
	"inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-graphite bg-charcoal text-sm text-snow transition-colors hover:border-fog/40 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo";

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

export function ScrapeHistoryPagination({
	page,
	totalPages,
	search,
	onQueryChange,
}: {
	page: number;
	totalPages: number;
	search: ScrapeHistorySearch;
	onQueryChange: (next: ScrapeHistorySearch) => void;
}) {
	if (totalPages <= 1) return null;
	return (
		<nav
			aria-label="Pagination riwayat"
			className="flex flex-wrap items-center justify-between gap-3 border-t border-graphite pt-4"
		>
			<span className="text-xs text-fog tabular-nums sm:hidden">
				{page} / {totalPages}
			</span>
			<div className="hidden items-center gap-1 sm:flex">
				<button
					type="button"
					onClick={() => onQueryChange({ ...search, page: page - 1 })}
					disabled={page <= 1}
					aria-label="Halaman sebelumnya"
					className={NAV_BUTTON_DESKTOP_CLASS}
				>
					<ChevronLeft size={16} aria-hidden="true" />
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
							onClick={() => onQueryChange({ ...search, page: entry.page })}
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
					className={NAV_BUTTON_DESKTOP_CLASS}
				>
					<ChevronRight size={16} aria-hidden="true" />
				</button>
			</div>
			<div className="flex items-center gap-2 sm:hidden">
				<button
					type="button"
					onClick={() => onQueryChange({ ...search, page: page - 1 })}
					disabled={page <= 1}
					aria-label="Halaman sebelumnya"
					className={NAV_BUTTON_MOBILE_CLASS}
				>
					<ChevronLeft size={16} aria-hidden="true" />
				</button>
				<button
					type="button"
					onClick={() => onQueryChange({ ...search, page: page + 1 })}
					disabled={page >= totalPages}
					aria-label="Halaman berikutnya"
					className={NAV_BUTTON_MOBILE_CLASS}
				>
					<ChevronRight size={16} aria-hidden="true" />
				</button>
			</div>
			<ScrapeFilterSelect
				label="Baris per halaman"
				value={String(search.pageSize)}
				onChange={(value) =>
					onQueryChange({
						...search,
						pageSize: value === "20" ? 20 : value === "50" ? 50 : 10,
						page: 1,
					})
				}
				options={SCRAPE_HISTORY_PAGE_SIZES.map((size) => ({
					value: String(size),
					label: String(size),
				}))}
			/>
		</nav>
	);
}
