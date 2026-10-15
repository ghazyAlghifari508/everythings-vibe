"use client";

import { Link } from "@tanstack/react-router";
import {
	AlertTriangle,
	ArrowRight,
	Check,
	ChevronLeft,
	ChevronRight,
	Loader2,
	Search,
	Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { ScrapeMode } from "@/db/schema";
import {
	SCRAPE_HISTORY_PAGE_SIZES,
	SCRAPE_HISTORY_SEARCH_DEBOUNCE_MS,
} from "@/lib/constants";
import type { ScrapeHistorySearch } from "@/lib/scrape-contract";
import {
	buildHistoryDetailSearch,
	clampHistoryPage,
	historyPageRange,
	historyTotalPages,
	isHistoryFiltered,
} from "@/lib/scrape-history";
import { imageCountsLabel, type imageResultCounts } from "@/lib/scrape-images";
import { displaySiteName } from "@/lib/site-name";
import { formatDate } from "@/lib/utils";
import { ScrapeFilterSelect } from "./scrape-filter-select";

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

export const SCRAPE_STATUS_INDONESIAN_LABELS: Record<string, string> = {
	completed: "Selesai",
	failed: "Gagal",
	queued: "Diproses",
	capturing: "Diproses",
	extracting: "Diproses",
	generating: "Diproses",
	saving: "Diproses",
	processing: "Diproses",
};

export function formatTimeAgo(dateString: string): string {
	const timestamp = new Date(dateString).getTime();
	if (Number.isNaN(timestamp)) return "baru saja";
	const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
	if (diffSeconds < 60) return "baru saja";
	const minutes = Math.floor(diffSeconds / 60);
	if (minutes < 60) return `${minutes} menit lalu`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} jam lalu`;
	const days = Math.floor(hours / 24);
	return `${days} hari lalu`;
}

function modeLabel(mode?: ScrapeMode): string {
	if (mode === "crawl") return "Crawl";
	if (mode === "images") return "Images";
	return mode === "html" ? "HTML" : "DESIGN.md";
}

function statusLabel(status: string): string {
	return SCRAPE_STATUS_INDONESIAN_LABELS[status] ?? "Diproses";
}

function isProcessingStatus(status: string): boolean {
	return status !== "completed" && status !== "failed";
}

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

export function ScrapeHistoryList({
	items,
	total,
	search,
	onQueryChange,
	onDelete,
}: {
	items: ScrapeHistoryItem[];
	total: number;
	search: ScrapeHistorySearch;
	onQueryChange: (next: ScrapeHistorySearch) => void;
	onDelete?: (id: string) => Promise<unknown>;
}) {
	const [draft, setDraft] = useState(search.q);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [confirmTarget, setConfirmTarget] = useState<ScrapeHistoryItem | null>(
		null,
	);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		setDraft(search.q);
	}, [search.q]);

	useEffect(() => {
		if (draft === search.q) return;
		const timer = setTimeout(() => {
			onQueryChange({ ...search, q: draft, page: 1 });
		}, SCRAPE_HISTORY_SEARCH_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [draft, search, onQueryChange]);

	const totalPages = historyTotalPages(total, search.pageSize);
	const page = clampHistoryPage(search.page, totalPages);
	const range = historyPageRange(page, search.pageSize, total);
	const filtered = isHistoryFiltered(search);
	const detailSearch = buildHistoryDetailSearch({ ...search, page });

	async function confirmDelete() {
		if (!confirmTarget) return;
		const id = confirmTarget.id;
		setDeletingId(id);
		setError(null);
		try {
			if (onDelete) {
				await onDelete(id);
			}
			setConfirmTarget(null);
		} catch {
			setConfirmTarget(null);
			setError("Gagal menghapus riwayat scrape. Coba lagi.");
		} finally {
			setDeletingId(null);
		}
	}

	if (total === 0 && !filtered) {
		return (
			<div className="flex flex-col items-start gap-2 py-6">
				<h3 className="text-base font-semibold text-snow">
					Belum ada riwayat scrape
				</h3>
				<p className="max-w-md text-sm leading-6 text-fog">
					Scrape website atau generate DESIGN.md terlebih dahulu. Hasilnya akan
					tersimpan di sini.
				</p>
				<Link
					to="/design/scrap"
					className="btn-primary mt-3 inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold transition-all hover:brightness-105 active:scale-[0.98]"
				>
					Mulai Scrap Sekarang
					<ArrowRight size={14} aria-hidden="true" />
				</Link>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			{error ? (
				<p
					role="alert"
					className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400"
				>
					{error}
				</p>
			) : null}

			<search aria-label="Cari riwayat scrape" className="relative">
				<label htmlFor="scrape-history-search" className="sr-only">
					Cari nama website atau domain
				</label>
				<Search
					size={16}
					aria-hidden="true"
					className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fog"
				/>
				<input
					id="scrape-history-search"
					type="search"
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
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

			{total === 0 ? (
				<div className="flex flex-col items-start gap-2 rounded-xl border border-graphite bg-charcoal p-6">
					<h3 className="text-sm font-semibold text-snow">
						Tidak ada hasil sesuai filter
					</h3>
					<p className="max-w-md text-sm leading-6 text-fog">
						Coba kata kunci lain atau atur ulang filter untuk melihat seluruh
						riwayat.
					</p>
					<button
						type="button"
						onClick={() =>
							onQueryChange({
								...search,
								mode: undefined,
								status: undefined,
								q: "",
								page: 1,
							})
						}
						className="mt-2 inline-flex min-h-11 items-center rounded-lg border border-graphite px-4 text-sm font-medium text-snow transition-colors hover:bg-onyx focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
					>
						Atur ulang filter
					</button>
				</div>
			) : (
				<ul className="flex flex-col divide-y divide-graphite rounded-xl border border-graphite bg-charcoal">
					{items.map((item) => {
						const siteName = displaySiteName(item.domain);
						const processing = isProcessingStatus(item.status);
						const failed = item.status === "failed";
						return (
							<li
								key={item.id}
								className="group flex items-center gap-2 p-4 transition-colors hover:bg-onyx/60"
							>
								<Link
									to="/design/scrap/$id"
									params={{ id: item.id }}
									search={detailSearch}
									className="flex min-w-0 flex-1 flex-col gap-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
								>
									<span className="flex items-center gap-2">
										<span className="truncate text-sm font-semibold text-snow">
											{siteName}
										</span>
										<span className="shrink-0 text-xs text-fog">
											{modeLabel(item.mode)}
										</span>
										<span
											className={`inline-flex shrink-0 items-center gap-1 text-xs ${
												failed ? "text-rose-400" : "text-fog"
											}`}
										>
											{processing ? (
												<Loader2
													size={12}
													aria-hidden="true"
													className="animate-spin"
												/>
											) : failed ? (
												<AlertTriangle size={12} aria-hidden="true" />
											) : (
												<Check size={12} aria-hidden="true" />
											)}
											{statusLabel(item.status)}
										</span>
									</span>
									<span className="truncate font-mono text-[11px] text-fog">
										{item.domain} ·{" "}
										<time dateTime={item.createdAt}>
											{formatDate(item.createdAt)}
										</time>
									</span>
									{item.imageCounts && (
										<span className="text-xs text-fog">
											{imageCountsLabel(item.imageCounts)}
										</span>
									)}
								</Link>

								<ChevronRight
									size={16}
									aria-hidden="true"
									className="shrink-0 text-fog"
								/>

								<button
									type="button"
									onClick={() => setConfirmTarget(item)}
									disabled={deletingId === item.id}
									aria-label={`Hapus riwayat ${siteName}`}
									className="inline-flex size-10 shrink-0 items-center justify-center rounded-md border border-transparent text-fog transition-colors hover:border-graphite hover:bg-onyx hover:text-rose-400 disabled:opacity-50"
								>
									{deletingId === item.id ? (
										<Loader2 size={14} className="animate-spin" />
									) : (
										<Trash2 size={14} aria-hidden="true" />
									)}
								</button>
							</li>
						);
					})}
				</ul>
			)}

			{totalPages > 1 ? (
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
							className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-graphite bg-charcoal px-2 text-sm text-snow transition-colors hover:border-fog/40 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
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
									…
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
							className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-graphite bg-charcoal px-2 text-sm text-snow transition-colors hover:border-fog/40 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
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
							className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-graphite bg-charcoal text-sm text-snow transition-colors hover:border-fog/40 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
						>
							<ChevronLeft size={16} aria-hidden="true" />
						</button>
						<button
							type="button"
							onClick={() => onQueryChange({ ...search, page: page + 1 })}
							disabled={page >= totalPages}
							aria-label="Halaman berikutnya"
							className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-graphite bg-charcoal text-sm text-snow transition-colors hover:border-fog/40 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
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
			) : null}

			<Dialog
				open={confirmTarget !== null}
				onOpenChange={(open) => {
					if (!open) setConfirmTarget(null);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Hapus Riwayat Scrape?</DialogTitle>
						<DialogDescription>
							Apakah kamu yakin ingin menghapus riwayat scrape untuk{" "}
							{confirmTarget
								? displaySiteName(confirmTarget.domain)
								: "website ini"}
							? Tindakan ini tidak dapat dibatalkan.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<button
							type="button"
							onClick={() => setConfirmTarget(null)}
							disabled={deletingId !== null}
							className="rounded-lg border border-graphite px-3 py-1.5 text-xs font-medium text-snow hover:bg-onyx disabled:opacity-50"
						>
							Batal
						</button>
						<button
							type="button"
							onClick={() => void confirmDelete()}
							disabled={deletingId !== null}
							className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-rose-500 disabled:opacity-50"
						>
							{deletingId ? (
								<Loader2 size={12} className="animate-spin" />
							) : null}
							Konfirmasi Hapus
						</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
