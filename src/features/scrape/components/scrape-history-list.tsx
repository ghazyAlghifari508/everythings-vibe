"use client";

import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { ScrapeHistorySelectionController } from "@/features/scrape/hooks/use-scrape-history-selection";
import type {
	ScrapeHistoryBulkDeleteResult,
	ScrapeHistoryBulkSelection,
	ScrapeHistorySearch,
} from "@/features/scrape/types/scrape-contract";
import {
	buildHistoryDetailSearch,
	clampHistoryPage,
	historyPageRange,
	historyTotalPages,
	isHistoryFiltered,
} from "@/features/scrape/utils/scrape-history";
import { useScrapeHistorySearchDraft } from "../hooks/use-scrape-history-search-draft";
import {
	ScrapeHistoryDeleteDialog,
	type ScrapeHistoryDeleteRequest,
} from "./scrape-history-list-delete-dialog";
import {
	type ScrapeHistoryItem,
	ScrapeHistoryRow,
} from "./scrape-history-list-item";
import { ScrapeHistoryPagination } from "./scrape-history-list-pagination";
import { ScrapeHistorySearchControls } from "./scrape-history-list-search";
import { ScrapeHistorySelectAll } from "./scrape-history-select-all";
import { ScrapeHistorySelectionBar } from "./scrape-history-selection-bar";

export type { ScrapeHistoryItem } from "./scrape-history-list-item";
export {
	formatTimeAgo,
	SCRAPE_STATUS_INDONESIAN_LABELS,
} from "./scrape-history-list-item";

interface ScrapeHistoryMessage {
	text: string;
	tone: "error" | "info";
}

export function ScrapeHistoryList({
	items,
	total,
	search,
	onQueryChange,
	onDelete,
	onDeleteMany,
	onPrepareSelection,
	selection,
}: {
	items: ScrapeHistoryItem[];
	total: number;
	search: ScrapeHistorySearch;
	onQueryChange: (next: ScrapeHistorySearch) => void;
	onDelete?: (id: string) => Promise<unknown>;
	onDeleteMany: (ids: string[]) => Promise<ScrapeHistoryBulkDeleteResult>;
	onPrepareSelection: () => Promise<ScrapeHistoryBulkSelection>;
	selection: ScrapeHistorySelectionController;
}) {
	const [draft, setDraft] = useScrapeHistorySearchDraft(search, onQueryChange);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [deleteRequest, setDeleteRequest] =
		useState<ScrapeHistoryDeleteRequest | null>(null);
	const [deleting, setDeleting] = useState(false);
	const [preparing, setPreparing] = useState(false);
	const [message, setMessage] = useState<ScrapeHistoryMessage | null>(null);

	const totalPages = historyTotalPages(total, search.pageSize);
	const page = clampHistoryPage(search.page, totalPages);
	const range = historyPageRange(page, search.pageSize, total);
	const filtered = isHistoryFiltered(search);
	const detailSearch = buildHistoryDetailSearch({ ...search, page });
	const pageIds = items.map((item) => item.id);

	async function confirmDelete() {
		if (!deleteRequest) return;
		setDeleting(true);
		setMessage(null);
		try {
			if (deleteRequest.kind === "single") {
				const id = deleteRequest.item.id;
				setDeletingId(id);
				await onDelete?.(id);
				setDeleteRequest(null);
			} else {
				const ids = [...selection.ids];
				const result = await onDeleteMany(ids);
				setDeleteRequest(null);
				const deletedIds = new Set(result.deletedIds);
				const remaining = ids.filter((id) => !deletedIds.has(id));
				if (remaining.length > 0) {
					selection.replace(remaining);
					setMessage({
						text: `${result.deleted} dari ${ids.length} hasil dihapus. ${result.skipped} hasil sudah tidak ada.`,
						tone: "info",
					});
				} else {
					selection.clear();
				}
			}
		} catch {
			setDeleteRequest(null);
			setMessage({
				text: "Gagal menghapus riwayat scrape. Coba lagi.",
				tone: "error",
			});
		} finally {
			setDeleting(false);
			setDeletingId(null);
		}
	}

	async function handleSelectAllFiltered() {
		setPreparing(true);
		try {
			selection.applyFiltered(await onPrepareSelection());
		} catch {
			setMessage({
				text: "Gagal menyiapkan pilihan. Coba lagi.",
				tone: "error",
			});
		} finally {
			setPreparing(false);
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
			{message ? (
				<p
					role={message.tone === "error" ? "alert" : "status"}
					className={`rounded-lg border p-3 text-xs ${
						message.tone === "error"
							? "border-rose-500/30 bg-rose-500/10 text-rose-400"
							: "border-graphite bg-charcoal text-fog"
					}`}
				>
					{message.text}
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

			{selection.count > 0 && items.length > 0 ? (
				<ScrapeHistorySelectAll
					pageIds={pageIds}
					selectedIds={selection.ids}
					total={total}
					filteredScopeActive={selection.scope === "filtered"}
					preparing={preparing}
					onTogglePage={(selected) =>
						selection.setPageSelection(pageIds, selected)
					}
					onSelectAllFiltered={() => void handleSelectAllFiltered()}
				/>
			) : null}

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
							onRequestDelete={(target) =>
								setDeleteRequest({ kind: "single", item: target })
							}
							selected={selection.ids.has(item.id)}
							selectionActive={selection.count > 0}
							onToggleSelect={selection.toggle}
						/>
					))}
				</ul>
			)}

			{selection.count > 0 || selection.notice !== null ? (
				<ScrapeHistorySelectionBar
					count={selection.count}
					filteredTotal={selection.filteredTotal}
					truncated={selection.truncated}
					notice={selection.notice}
					deleting={deleting}
					onClear={selection.clear}
					onDelete={() =>
						setDeleteRequest({ kind: "bulk", count: selection.count })
					}
				/>
			) : null}

			<ScrapeHistoryPagination
				page={page}
				totalPages={totalPages}
				search={search}
				onQueryChange={onQueryChange}
			/>

			<ScrapeHistoryDeleteDialog
				request={deleteRequest}
				deleting={deleting}
				onCancel={() => setDeleteRequest(null)}
				onConfirm={() => void confirmDelete()}
			/>
		</div>
	);
}
