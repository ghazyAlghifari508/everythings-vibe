"use client";

import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { ScrapeHistorySearch } from "@/features/scrape/types/scrape-contract";
import {
	buildHistoryDetailSearch,
	clampHistoryPage,
	historyPageRange,
	historyTotalPages,
	isHistoryFiltered,
} from "@/features/scrape/utils/scrape-history";
import { useScrapeHistorySearchDraft } from "../hooks/use-scrape-history-search-draft";
import { ScrapeHistoryDeleteDialog } from "./scrape-history-list-delete-dialog";
import {
	type ScrapeHistoryItem,
	ScrapeHistoryRow,
} from "./scrape-history-list-item";
import { ScrapeHistoryPagination } from "./scrape-history-list-pagination";
import { ScrapeHistorySearchControls } from "./scrape-history-list-search";

export type { ScrapeHistoryItem } from "./scrape-history-list-item";
export {
	formatTimeAgo,
	SCRAPE_STATUS_INDONESIAN_LABELS,
} from "./scrape-history-list-item";

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
	const [draft, setDraft] = useScrapeHistorySearchDraft(search, onQueryChange);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [confirmTarget, setConfirmTarget] = useState<ScrapeHistoryItem | null>(
		null,
	);
	const [error, setError] = useState<string | null>(null);

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
					to="/scrape"
					className="btn-primary mt-3 inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold transition-all hover:brightness-105 active:scale-[0.98]"
				>
					Mulai Scrap Sekarang
					<Icon icon={ArrowRight01Icon} size={14} aria-hidden="true" />
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

			<ScrapeHistorySearchControls
				draft={draft}
				onDraftChange={setDraft}
				search={search}
				onQueryChange={onQueryChange}
				total={total}
				range={range}
			/>

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
					{items.map((item) => (
						<ScrapeHistoryRow
							key={item.id}
							item={item}
							detailSearch={detailSearch}
							deleting={deletingId === item.id}
							onRequestDelete={setConfirmTarget}
						/>
					))}
				</ul>
			)}

			<ScrapeHistoryPagination
				page={page}
				totalPages={totalPages}
				search={search}
				onQueryChange={onQueryChange}
			/>

			<ScrapeHistoryDeleteDialog
				target={confirmTarget}
				deleting={deletingId !== null}
				onCancel={() => setConfirmTarget(null)}
				onConfirm={() => void confirmDelete()}
			/>
		</div>
	);
}
