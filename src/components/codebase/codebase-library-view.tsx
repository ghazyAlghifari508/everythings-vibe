"use client";

import { Link, useRouter } from "@tanstack/react-router";
import {
	ArrowRight,
	Database,
	FileCode2,
	FolderGit2,
	Search,
	Terminal,
} from "lucide-react";
import { useEffect, useState } from "react";
import { LibraryPagination } from "@/components/codebase/library-pagination";
import {
	ProjectActionsMenu,
	readServerErrorMessage,
} from "@/components/codebase/project-actions-menu";
import { HubBreadcrumb } from "@/components/home/hub-breadcrumb";
import {
	CODEBASE_LIBRARY_LABEL,
	type CodebaseLibraryItem,
	filterLibraryItems,
	libraryAnalysisLabels,
	mapLibraryStatus,
	NEW_REPOSITORY_HREF,
} from "@/lib/codebase-library";
import { clearPlanCodebasePointerIfMatches } from "@/lib/codebase-plan-storage";
import { CODEBASE_LIBRARY_PAGE_SIZE } from "@/lib/constants";
import { paginate } from "@/lib/history-filter";
import { useUIStore } from "@/store";

function formatLibraryDate(value: string | null): string | null {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return new Intl.DateTimeFormat("id-ID", {
		day: "numeric",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(date);
}

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

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset to the first page whenever the query changes; the dependency is the trigger, not a read
	useEffect(() => {
		setPage(1);
	}, [query]);

	useEffect(() => {
		if (page > totalPages) setPage(totalPages);
	}, [page, totalPages]);

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
			// The row is gone server-side, so an onboarding pointer to THIS
			// codebase is now stale and must not survive: the next /plan/codebase
			// visit would otherwise poll a status endpoint that 404s. A pointer to
			// a different codebase, and every unrelated storage key, are untouched.
			clearPlanCodebasePointerIfMatches(item.id);
			showToast("Project dihapus.", "success");
			router.invalidate();
		} catch {
			setLocalItems(previous);
			showToast("Server tidak dapat dihubungi.", "error");
		}
	};

	return (
		<div className="flex flex-col gap-6">
			<HubBreadcrumb
				current={CODEBASE_LIBRARY_LABEL}
				ancestors={[{ label: "VibePlan", to: "/plan" }]}
			/>

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
				{hasProjects && (
					<Link
						to={NEW_REPOSITORY_HREF}
						className="btn-primary inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-semibold hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
					>
						+ Hubungkan repository
					</Link>
				)}
			</header>

			{hasProjects && (
				<div className="relative">
					<Search
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

			{!hasProjects ? (
				<section
					aria-labelledby="empty-codebase-heading"
					className="mx-auto flex w-full max-w-xl flex-col items-center py-10 text-center sm:py-14"
				>
					<div
						className="flex h-12 w-12 items-center justify-center rounded-xl border border-graphite bg-charcoal/60 text-snow"
						aria-hidden
					>
						<FolderGit2 size={24} className="text-fog" />
					</div>
					<h2
						id="empty-codebase-heading"
						className="mt-5 text-xl font-semibold tracking-tight text-snow sm:text-2xl"
					>
						Belum ada repository terhubung
					</h2>
					<p className="mt-2.5 text-sm leading-6 text-fog">
						Hubungkan repository lokal untuk membaca struktur codebase dan
						menyiapkan workspace perencanaan yang bisa kamu lanjutkan kapan
						saja.
					</p>
					<Link
						to={NEW_REPOSITORY_HREF}
						className="btn-primary mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-5 text-sm font-semibold hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
					>
						Hubungkan repository
						<ArrowRight size={16} aria-hidden />
					</Link>
					<div className="mt-10 flex w-full flex-col items-center justify-center gap-4 border-t border-graphite/40 pt-8 sm:mt-12 sm:flex-row sm:gap-8">
						<div className="flex items-center gap-2 text-xs text-fog">
							<FileCode2 size={16} className="text-slate" aria-hidden />
							<span>Codebase terbaca</span>
						</div>
						<div className="flex items-center gap-2 text-xs text-fog">
							<Database size={16} className="text-slate" aria-hidden />
							<span>Konteks tersimpan</span>
						</div>
						<div className="flex items-center gap-2 text-xs text-fog">
							<Terminal size={16} className="text-slate" aria-hidden />
							<span>Workspace siap</span>
						</div>
					</div>
				</section>
			) : filtered.length === 0 ? (
				<p className="py-12 text-center text-sm text-fog">
					Tidak ada project yang cocok dengan pencarian.
				</p>
			) : (
				<ul data-testid="codebase-library-list" className="flex flex-col gap-3">
					{paged.map((item) => {
						const stack = libraryAnalysisLabels(item);
						const displayDate =
							formatLibraryDate(item.snapshotCreatedAt) ??
							formatLibraryDate(item.updatedAt);
						const status = mapLibraryStatus(
							item.snapshotStatus,
							item.hasReadyAnalysis,
						);
						const isAttention = status === "Perlu perhatian";
						return (
							<li
								key={item.id}
								className="group flex items-start gap-1 rounded-xl border border-graphite bg-charcoal/60 transition-colors hover:border-fog/40 hover:bg-charcoal"
							>
								<Link
									to="/codebases/$id"
									params={{ id: item.id }}
									className="flex min-w-0 flex-1 flex-col gap-2 rounded-xl p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
								>
									<span className="flex items-center justify-between gap-3">
										<span className="truncate text-base font-medium text-snow">
											{item.name}
										</span>
										<span
											className={`shrink-0 text-xs ${isAttention ? "text-crimson" : "text-fog"}`}
										>
											{status}
										</span>
									</span>
									{item.summary ? (
										<span className="line-clamp-2 text-sm leading-6 text-fog">
											{item.summary}
										</span>
									) : null}
									{stack.length > 0 ? (
										<span className="text-xs text-slate">
											{stack.join(" · ")}
										</span>
									) : null}
									<span className="text-[11px] text-slate">
										{item.fileCount !== null
											? `${item.fileCount} file`
											: "Belum ada sync"}
										{displayDate ? ` · Terakhir diperbarui ${displayDate}` : ""}
									</span>
									<span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-snow">
										Buka Workspace
										<ArrowRight
											size={14}
											aria-hidden
											className="transition-transform group-hover:translate-x-0.5"
										/>
									</span>
								</Link>
								<ProjectActionsMenu
									item={item}
									onRename={applyRename}
									onDelete={removeProject}
								/>
							</li>
						);
					})}
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
		</div>
	);
}
