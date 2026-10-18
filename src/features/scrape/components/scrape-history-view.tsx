import type { ScrapeHistorySearch } from "@/features/scrape/types/scrape-contract";
import type { ScrapeHistoryItem } from "./scrape-history-list";
import { ScrapeHistoryList } from "./scrape-history-list";

export interface ScrapeHistoryViewProps {
	items: ScrapeHistoryItem[];
	total: number;
	search: ScrapeHistorySearch;
	onQueryChange: (next: ScrapeHistorySearch) => void;
	onDelete: (id: string) => Promise<unknown>;
}

export function ScrapeHistoryView({
	items,
	total,
	search,
	onQueryChange,
	onDelete,
}: ScrapeHistoryViewProps) {
	return (
		<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
			<div className="flex w-full flex-col gap-6 py-4">
				<header className="max-w-2xl">
					<h1 className="text-2xl font-semibold tracking-tight text-snow sm:text-3xl">
						Riwayat VibeScrape
					</h1>
					<p className="mt-2 text-sm leading-6 text-fog">
						Temukan dan kelola hasil ekstraksi website.
					</p>
				</header>

				<ScrapeHistoryList
					items={items}
					total={total}
					search={search}
					onQueryChange={onQueryChange}
					onDelete={onDelete}
				/>
			</div>
		</div>
	);
}

export function ScrapeHistoryPendingView() {
	return (
		<main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
			<output className="sr-only">Memuat riwayat VibeScrape...</output>
			<div aria-hidden="true" className="flex w-full flex-col gap-6 py-4">
				<div className="max-w-2xl">
					<div className="h-8 w-48 animate-pulse rounded-lg bg-onyx" />
					<div className="mt-2 h-4 w-80 animate-pulse rounded-md bg-onyx" />
				</div>
				<div className="h-11 w-full animate-pulse rounded-lg bg-onyx" />
				<div className="flex gap-2">
					<div className="h-8 w-20 animate-pulse rounded-lg bg-onyx" />
					<div className="h-8 w-20 animate-pulse rounded-lg bg-onyx" />
					<div className="h-8 w-24 animate-pulse rounded-lg bg-onyx" />
				</div>
				<div className="flex flex-col gap-2.5">
					<div className="h-20 animate-pulse rounded-xl bg-onyx" />
					<div className="h-20 animate-pulse rounded-xl bg-onyx" />
					<div className="h-20 animate-pulse rounded-xl bg-onyx" />
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
					Riwayat VibeScrape gagal dimuat
				</h1>
				<p className="mx-auto mt-1 max-w-md text-sm leading-6 text-fog">
					Periksa koneksi lalu coba muat ulang daftar riwayat VibeScrape.
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
