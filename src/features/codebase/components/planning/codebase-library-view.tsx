"use client";

import { Search01Icon } from "@hugeicons/core-free-icons";
import { Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { HubBreadcrumb } from "@/components/home/hub-breadcrumb";
import { HistorySelectAll } from "@/components/ui/history-select-all";
import { HistorySelectionBar } from "@/components/ui/history-selection-bar";
import { Icon } from "@/components/ui/icon";
import {
	CodebaseLibraryDeleteDialog,
	type CodebaseLibraryDeleteRequest,
} from "@/features/codebase/components/planning/codebase-library-delete-dialog";
import { CodebaseLibraryEmptyState } from "@/features/codebase/components/planning/codebase-library-empty-state";
import { CodebaseLibraryItemCard } from "@/features/codebase/components/planning/codebase-library-item-card";
import { LibraryPagination } from "@/features/codebase/components/planning/library-pagination";
import { readServerErrorMessage } from "@/features/codebase/components/planning/project-actions-menu";
import {
	CODEBASE_LIBRARY_LABEL,
	type CodebaseLibraryItem,
	filterLibraryItems,
	NEW_REPOSITORY_HREF,
	resolveLibraryItemStatus,
} from "@/features/codebase/services/library";
import { requestCodebaseBulkDelete } from "@/features/codebase/services/library-delete-client";
import { clearPlanCodebasePointerIfMatches } from "@/features/codebase/services/plan-storage";
import {
	CODEBASE_LIBRARY_PAGE_SIZE,
	CODEBASE_SYNC_ACTIVE_POLL_INTERVAL_MS,
} from "@/features/codebase/types/codebase-constants";
import { paginate } from "@/lib/history-filter";
import { useHistorySelection } from "@/lib/history-selection";
import { useUIStore } from "@/store";

export function CodebaseLibraryView({
	items,
}: {
	items: CodebaseLibraryItem[];
}) {
	const router = useRouter();
	const showToast = useUIStore((s) => s.showToast);
	const [localItems, setLocalItems] = useState(items);
	const [query, setQuery] = useState("");
	const [page, setPage] = useState(1);
	const [deleteRequest, setDeleteRequest] =
		useState<CodebaseLibraryDeleteRequest | null>(null);
	const [deleting, setDeleting] = useState(false);

	const selection = useHistorySelection(query);

	useEffect(() => {
		setLocalItems(items);
	}, [items]);

	const hasProjects = localItems.length > 0;
	const filtered = filterLibraryItems(localItems, query);
	const totalPages = Math.max(
		1,
		Math.ceil(filtered.length / CODEBASE_LIBRARY_PAGE_SIZE),
	);
	const clampedPage = Math.min(page, totalPages);
	const paged = paginate(filtered, clampedPage, CODEBASE_LIBRARY_PAGE_SIZE);
	const pageIds = paged.map((item) => item.id);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset to the first page whenever the query changes; the dependency is the trigger, not a read
	useEffect(() => {
		setPage(1);
	}, [query]);

	useEffect(() => {
		if (page > totalPages) setPage(totalPages);
	}, [page, totalPages]);

	const hasAnalyzingItems = localItems.some(
		(item) => resolveLibraryItemStatus(item) === "analyzing",
	);
	useEffect(() => {
		if (!hasAnalyzingItems) return;
		const timer = setInterval(() => {
			void router.invalidate();
		}, CODEBASE_SYNC_ACTIVE_POLL_INTERVAL_MS);
		return () => clearInterval(timer);
	}, [hasAnalyzingItems, router]);

	const applyRename = (id: string, name: string) => {
		setLocalItems((current) =>
			current.map((item) => (item.id === id ? { ...item, name } : item)),
		);
		showToast("Nama project diperbarui.", "success");
		router.invalidate();
	};

	const removeProject = async (item: CodebaseLibraryItem) => {
		const previous = localItems;
		setLocalItems((current) => current.filter((row) => row.id !== item.id));
		try {
			const response = await fetch(
				`/api/codebases/${encodeURIComponent(item.id)}`,
				{
					method: "DELETE",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ confirm: true }),
				},
			);
			const body: unknown = await response.json().catch(() => null);
			if (!response.ok) {
				setLocalItems(previous);
				showToast(
					readServerErrorMessage(body, "Gagal menghapus project."),
					"error",
				);
				return;
			}
			clearPlanCodebasePointerIfMatches(item.id);
			if (selection.ids.has(item.id)) {
				selection.toggle(item.id);
			}
			showToast("Project dihapus.", "success");
			router.invalidate();
		} catch {
			setLocalItems(previous);
			showToast("Server tidak dapat dihubungi.", "error");
		}
	};

	const confirmBulkDelete = async () => {
		if (!deleteRequest) return;
		setDeleting(true);
		try {
			const ids =
				deleteRequest.kind === "bulk"
					? [...selection.ids]
					: deleteRequest.kind === "all_filtered"
						? filtered.map((row) => row.id)
						: localItems.map((row) => row.id);

			const result = await requestCodebaseBulkDelete(ids);
			setDeleteRequest(null);
			const deletedSet = new Set(result.deletedIds);
			setLocalItems((current) =>
				current.filter((row) => !deletedSet.has(row.id)),
			);
			for (const id of result.deletedIds) {
				clearPlanCodebasePointerIfMatches(id);
			}

			const remaining = ids.filter((id) => !deletedSet.has(id));
			if (remaining.length > 0) {
				selection.replace(remaining);
				showToast(
					`${result.deleted} dari ${ids.length} repository dihapus. ${result.skipped} repository sudah tidak ada.`,
					"info",
				);
			} else {
				selection.clear();
				showToast(`${result.deleted} repository dihapus.`, "success");
			}
			router.invalidate();
		} catch (error) {
			setDeleteRequest(null);
			showToast(
				error instanceof Error
					? error.message
					: "Gagal menghapus repository. Coba lagi.",
				"error",
			);
		} finally {
			setDeleting(false);
		}
	};

	return (
		<div className="flex flex-1 flex-col gap-6">
			<HubBreadcrumb
				current={CODEBASE_LIBRARY_LABEL}
				ancestors={[{ label: "VibePlan", to: "/plan" }]}
			/>

			{hasProjects && (
				<header className="flex flex-col gap-4 border-b border-graphite pb-6 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<p className="font-mono text-xs uppercase tracking-widest text-fog">
							Existing Codebase
						</p>
						<h1 className="mt-2 text-3xl font-semibold tracking-tight text-snow sm:text-4xl">
							Project Tersimpan
						</h1>
						<p className="mt-2 max-w-2xl text-sm leading-6 text-fog">
							Repository yang pernah kamu hubungkan akan tersimpan di sini.
							Lanjutkan dari konteks dan workspace sebelumnya.
						</p>
					</div>
					<Link
						to={NEW_REPOSITORY_HREF}
						className="btn-primary inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-semibold hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
					>
						+ Hubungkan repository
					</Link>
				</header>
			)}

			{hasProjects && (
				<div className="relative">
					<Icon
						icon={Search01Icon}
						size={16}
						className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fog"
						aria-hidden
					/>
					<input
						type="text"
						placeholder="Cari project..."
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						aria-label="Cari project tersimpan"
						className="w-full rounded-lg border border-graphite bg-charcoal py-2.5 pl-10 pr-4 text-sm text-snow placeholder:text-fog/60 focus:border-fog/40 focus:outline-none"
					/>
				</div>
			)}

			{hasProjects && filtered.length > 0 && selection.count === 0 && (
				<div className="flex items-center justify-between py-1">
					<label className="inline-flex min-h-6 items-center gap-2 text-xs text-fog cursor-pointer">
						<input
							type="checkbox"
							checked={false}
							onChange={() => selection.setPageSelection(pageIds, true)}
							aria-label="Pilih semua di halaman ini"
							className="size-4 shrink-0 accent-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
						/>
						<span>Pilih semua</span>
					</label>
					<button
						type="button"
						onClick={() =>
							setDeleteRequest(
								query.trim()
									? { kind: "all_filtered", count: filtered.length }
									: { kind: "all", count: localItems.length },
							)
						}
						className="text-xs text-fog transition-colors hover:text-crimson focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
					>
						{query.trim() ? "Hapus semua hasil pencarian" : "Hapus semua"}
					</button>
				</div>
			)}

			{(selection.count > 0 || selection.notice !== null) && (
				<div className="flex flex-col gap-3">
					{selection.count > 0 && (
						<HistorySelectAll
							noun="repository"
							pageIds={pageIds}
							selectedIds={selection.ids}
							total={filtered.length}
							filteredScopeActive={selection.scope === "filtered"}
							preparing={false}
							onTogglePage={(selected) =>
								selection.setPageSelection(pageIds, selected)
							}
							onSelectAllFiltered={() =>
								selection.applyFiltered({
									ids: filtered.map((r) => r.id),
									total: filtered.length,
									truncated: false,
								})
							}
						/>
					)}
					<HistorySelectionBar
						noun="repository"
						count={selection.count}
						filteredTotal={selection.filteredTotal}
						truncated={selection.truncated}
						notice={selection.notice}
						deleting={deleting}
						cancelLabel="Batalkan Pilihan"
						deleteLabel="Hapus Terpilih"
						onClear={selection.clear}
						onDelete={() =>
							setDeleteRequest({ kind: "bulk", count: selection.count })
						}
					/>
				</div>
			)}

			{!hasProjects ? (
				<CodebaseLibraryEmptyState />
			) : filtered.length === 0 ? (
				<p className="py-12 text-center text-sm text-fog">
					Tidak ada project yang cocok dengan pencarian.
				</p>
			) : (
				<ul data-testid="codebase-library-list" className="flex flex-col gap-3">
					{paged.map((item) => (
						<CodebaseLibraryItemCard
							key={item.id}
							item={item}
							selected={selection.ids.has(item.id)}
							onToggleSelect={selection.toggle}
							onRename={applyRename}
							onDelete={removeProject}
						/>
					))}
				</ul>
			)}

			{filtered.length > 0 && (
				<LibraryPagination
					clampedPage={clampedPage}
					totalPages={totalPages}
					totalItems={filtered.length}
					onPageChange={setPage}
				/>
			)}

			<CodebaseLibraryDeleteDialog
				request={deleteRequest}
				deleting={deleting}
				onCancel={() => setDeleteRequest(null)}
				onConfirm={() => void confirmBulkDelete()}
			/>
		</div>
	);
}
