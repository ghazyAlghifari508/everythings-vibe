import { useScrapeHistorySelection } from "@/features/scrape/hooks/use-scrape-history-selection";
import type {
	ScrapeHistoryBulkDeleteResult,
	ScrapeHistoryBulkSelection,
	ScrapeHistorySearch,
} from "@/features/scrape/types/scrape-contract";
import { historyFilterKey } from "@/features/scrape/utils/scrape-history";
import type { ScrapeHistoryItem } from "./scrape-history-list";
import { ScrapeHistoryList } from "./scrape-history-list";

export interface ScrapeHistoryViewProps {
	items: ScrapeHistoryItem[];
	total: number;
	search: ScrapeHistorySearch;
	onQueryChange: (next: ScrapeHistorySearch) => void;
	onDelete: (id: string) => Promise<unknown>;
	onDeleteMany: (ids: string[]) => Promise<ScrapeHistoryBulkDeleteResult>;
	onPrepareSelection: () => Promise<ScrapeHistoryBulkSelection>;
}

export function ScrapeHistoryView({
	items,
	total,
	search,
	onQueryChange,
	onDelete,
	onDeleteMany,
	onPrepareSelection,
}: ScrapeHistoryViewProps) {
	const selection = useScrapeHistorySelection(historyFilterKey(search));
	return (
		<main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
			<header className="flex flex-wrap items-start justify-between gap-4">
				<div className="max-w-2xl">
					<h1 className="text-2xl font-semibold tracking-tight text-snow sm:text-3xl">
						Riwayat Scrape
					</h1>
					<p className="mt-2 text-sm leading-6 text-fog">
						Temukan dan kelola hasil ekstraksi website.
					</p>
				</div>
				{total > 0 ? (
					selection.active ? (
						<button
							type="button"
							onClick={selection.exit}
							className="inline-flex min-h-11 items-center rounded-lg border border-graphite bg-charcoal px-3 text-xs font-medium text-snow transition-colors hover:bg-onyx focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
						>
							Selesai memilih
						</button>
					) : (
						<button
							type="button"
							onClick={selection.enter}
							className="inline-flex min-h-11 items-center rounded-lg border border-graphite bg-charcoal px-3 text-xs font-medium text-snow transition-colors hover:bg-onyx focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
						>
							Pilih
						</button>
					)
				) : null}
			</header>

			<ScrapeHistoryList
				items={items}
				total={total}
				search={search}
				onQueryChange={onQueryChange}
				onDelete={onDelete}
				onDeleteMany={onDeleteMany}
				onPrepareSelection={onPrepareSelection}
				selection={selection}
			/>
		</main>
	);
}

// The skeleton mirrors the real composition block by block, so the page does
// not jump when the data arrives. The placeholder tone is a hairline gray that
// stays visible on both the light and the dark canvas.
export function ScrapeHistoryPendingView() {
	return (
		<main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
			<output className="sr-only">Memuat riwayat scrape...</output>
			<div aria-hidden="true" className="flex w-full flex-col gap-6">
				<div className="max-w-2xl">
					<div className="h-8 w-44 animate-pulse rounded-lg bg-graphite" />
					<div className="mt-2 h-4 w-80 animate-pulse rounded-md bg-graphite" />
				</div>
				<div className="h-11 w-full animate-pulse rounded-lg bg-graphite" />
				<div className="flex gap-2">
					<div className="h-8 w-20 animate-pulse rounded-lg bg-graphite" />
					<div className="h-8 w-20 animate-pulse rounded-lg bg-graphite" />
					<div className="h-8 w-24 animate-pulse rounded-lg bg-graphite" />
					<div className="h-8 w-16 animate-pulse rounded-lg bg-graphite" />
					<div className="h-8 w-20 animate-pulse rounded-lg bg-graphite" />
				</div>
				<div className="flex items-center justify-between gap-4">
					<div className="h-11 w-36 animate-pulse rounded-lg bg-graphite" />
					<div className="h-11 w-36 animate-pulse rounded-lg bg-graphite" />
				</div>
				<div className="h-3 w-16 animate-pulse rounded bg-graphite" />
				<div className="flex flex-col divide-y divide-graphite rounded-xl border border-graphite bg-charcoal">
					{[0, 1, 2, 3, 4].map((row) => (
						<div key={row} className="flex items-center gap-4 px-4 py-3">
							<div className="flex min-w-0 flex-1 flex-col gap-1.5">
								<div className="h-4 w-32 animate-pulse rounded bg-graphite" />
								<div className="h-3 w-24 animate-pulse rounded bg-graphite" />
							</div>
							<div className="hidden h-3 w-20 animate-pulse rounded bg-graphite sm:block" />
							<div className="hidden h-3 w-24 animate-pulse rounded bg-graphite sm:block" />
							<div className="hidden h-3 w-20 animate-pulse rounded bg-graphite sm:block" />
						</div>
					))}
				</div>
			</div>
		</main>
	);
}

export function ScrapeHistoryErrorView({ onReset }: { onReset: () => void }) {
	return (
		<main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
			<div
				role="alert"
				className="rounded-xl border border-graphite bg-charcoal p-8 text-center"
			>
				<h1 className="text-base font-semibold text-snow">
					Riwayat Scrape gagal dimuat
				</h1>
				<p className="mx-auto mt-1 max-w-md text-sm leading-6 text-fog">
					Periksa koneksi lalu coba muat ulang daftar riwayat scrape.
				</p>
				<button
					type="button"
					onClick={onReset}
					className="mt-4 min-h-11 rounded-lg border border-graphite px-4 text-sm font-medium text-snow transition-colors hover:bg-onyx focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					Coba lagi
				</button>
			</div>
		</main>
	);
}
