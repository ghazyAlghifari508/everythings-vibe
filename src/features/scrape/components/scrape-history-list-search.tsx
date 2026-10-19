import { Search01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import type { ScrapeHistorySearch } from "@/features/scrape/types/scrape-contract";
import { ScrapeFilterSelect } from "./scrape-filter-select";

const MODE_TABS: ReadonlyArray<{
	value: ScrapeHistorySearch["mode"];
	label: string;
}> = [
	{ value: undefined, label: "Semua" },
	{ value: "crawl", label: "Crawl" },
	{ value: "design", label: "DESIGN.md" },
	{ value: "html", label: "HTML" },
	{ value: "images", label: "Images" },
];

export function ScrapeHistorySearchControls({
	draft,
	onDraftChange,
	search,
	onQueryChange,
	total,
	range,
}: {
	draft: string;
	onDraftChange: (next: string) => void;
	search: ScrapeHistorySearch;
	onQueryChange: (next: ScrapeHistorySearch) => void;
	total: number;
	range: { start: number; end: number };
}) {
	return (
		<>
			<search aria-label="Cari riwayat scrape" className="relative">
				<label htmlFor="scrape-history-search" className="sr-only">
					Cari nama website atau domain
				</label>
				<Icon
					icon={Search01Icon}
					size={16}
					aria-hidden="true"
					className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fog"
				/>
				<input
					id="scrape-history-search"
					type="search"
					value={draft}
					onChange={(event) => onDraftChange(event.target.value)}
					placeholder="Cari nama website atau domain..."
					autoComplete="off"
					className="h-11 w-full rounded-lg border border-graphite bg-charcoal pr-4 pl-10 text-sm text-snow placeholder:text-fog/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				/>
			</search>

			<fieldset className="flex gap-2 overflow-x-auto pb-1">
				<legend className="sr-only">Filter mode ekstraksi</legend>
				{MODE_TABS.map((tab) => {
					const active =
						(search.mode ?? undefined) === (tab.value ?? undefined);
					return (
						<button
							key={tab.label}
							type="button"
							aria-pressed={active}
							onClick={() =>
								onQueryChange({ ...search, mode: tab.value, page: 1 })
							}
							className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo ${
								active
									? "bg-snow text-onyx"
									: "border border-graphite bg-charcoal text-fog hover:border-fog/40 hover:text-snow"
							}`}
						>
							{tab.label}
						</button>
					);
				})}
			</fieldset>

			<div className="flex flex-wrap items-end gap-3">
				<ScrapeFilterSelect
					label="Status"
					value={search.status ?? "all"}
					onChange={(value) =>
						onQueryChange({
							...search,
							status:
								value === "completed" ||
								value === "failed" ||
								value === "processing"
									? value
									: undefined,
							page: 1,
						})
					}
					options={[
						{ value: "all", label: "Semua" },
						{ value: "completed", label: "Selesai" },
						{ value: "processing", label: "Diproses" },
						{ value: "failed", label: "Gagal" },
					]}
				/>
				<ScrapeFilterSelect
					label="Urutkan"
					value={search.sort}
					onChange={(value) =>
						onQueryChange({
							...search,
							sort: value === "oldest" ? "oldest" : "newest",
							page: 1,
						})
					}
					options={[
						{ value: "newest", label: "Terbaru" },
						{ value: "oldest", label: "Terlama" },
					]}
				/>
			</div>

			<div className="flex items-center justify-between text-xs text-fog">
				<span className="tabular-nums">
					{total} hasil
					<span className="hidden sm:inline">
						{" "}
						· Menampilkan {range.start}–{range.end} dari {total}
					</span>
				</span>
			</div>
		</>
	);
}
