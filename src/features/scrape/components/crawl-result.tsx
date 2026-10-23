import { Download01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { scrapePages } from "@/db/schema";
import { buildWebsiteBlueprint } from "@/features/scrape/utils/crawl-blueprint";
import { cn } from "@/lib/utils";
import { statusMark, statusText } from "./crawl-page-status";
import { PageDetail } from "./crawl-result-page-detail";
import { CrawlSitemapGraph } from "./crawl-sitemap-graph";
import { ScrapeFilterSelect } from "./scrape-filter-select";

type Page = typeof scrapePages.$inferSelect;

export interface CrawlScopeInfo {
	maxPages: number;
	maxDepth: number;
	followSubdomains?: boolean;
	urlRegex?: string;
}

// Keeps the explorer selection valid as pages arrive from polling: an explicit
// user choice is preserved while it still exists, and any other case resolves
// to a real page instead of leaving the panel on its empty state.
export function resolveSelectedPageId(pages: Page[], current: string): string {
	if (current && pages.some((page) => page.id === current)) return current;
	return pages[0]?.id ?? "";
}

export function CrawlResult({
	pages,
	sourceUrl,
	scope,
	capturedAt,
	domain,
}: {
	pages: Page[];
	sourceUrl: string;
	scope?: CrawlScopeInfo;
	capturedAt?: string;
	domain?: string;
}) {
	const [selected, setSelected] = useState(pages[0]?.id ?? "");
	const [query, setQuery] = useState("");
	const [statusFilter, setStatusFilter] = useState<Page["status"] | "all">(
		"all",
	);
	const explorerRef = useRef<HTMLElement>(null);
	useEffect(() => {
		setSelected((current) => resolveSelectedPageId(pages, current));
	}, [pages]);
	const page = pages.find((row) => row.id === selected);

	function focusExplorer(): void {
		const explorer = explorerRef.current;
		if (!explorer) return;
		explorer.scrollIntoView?.({ behavior: "smooth", block: "start" });
		explorer.focus?.();
	}

	const counts = useMemo(() => {
		return {
			discovered: pages.length,
			completed: pages.filter((row) => row.status === "completed").length,
			skipped: pages.filter((row) => row.status === "skipped").length,
			failed: pages.filter((row) => row.status === "failed").length,
			queued: pages.filter((row) => row.status === "queued").length,
		};
	}, [pages]);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return pages.filter((row) => {
			if (statusFilter !== "all" && row.status !== statusFilter) return false;
			if (!q) return true;
			return (
				(row.title ?? "").toLowerCase().includes(q) ||
				row.url.toLowerCase().includes(q)
			);
		});
	}, [pages, query, statusFilter]);

	function download(): void {
		const markdown = buildWebsiteBlueprint({
			pages,
			sourceUrl,
			scope,
			capturedAt,
			domain,
		});
		const url = URL.createObjectURL(
			new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
		);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = "website-blueprint.md";
		anchor.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	function moveSelection(direction: 1 | -1): void {
		if (filtered.length === 0) return;
		const index = filtered.findIndex((row) => row.id === selected);
		const next =
			filtered[
				(index < 0
					? direction === 1
						? -1
						: 0
					: index + direction + filtered.length) % filtered.length
			];
		if (next) setSelected(next.id);
	}

	return (
		<section className="space-y-6">
			<header className="space-y-4">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div className="min-w-0">
						<h1 className="text-2xl font-semibold text-snow">
							Website Blueprint
						</h1>
						<a
							href={sourceUrl}
							target="_blank"
							rel="noreferrer"
							className="mt-2 block break-all text-sm text-fog"
						>
							{sourceUrl}
						</a>
					</div>
					<button
						type="button"
						onClick={download}
						className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-graphite px-4 text-sm text-snow focus-visible:ring-2 focus-visible:ring-indigo"
					>
						<Icon icon={Download01Icon} size={16} aria-hidden />
						Download .md
					</button>
				</div>
				<div className="rounded-xl border border-graphite bg-onyx p-4 sm:p-5">
					<div className="flex flex-wrap items-center gap-6 sm:gap-10">
						<div>
							<div className="text-2xl font-semibold text-snow tabular-nums">
								{counts.discovered}
							</div>
							<div className="text-xs text-fog">Ditemukan</div>
						</div>
						<div>
							<div className="text-2xl font-semibold text-snow tabular-nums">
								{counts.completed}
							</div>
							<div className="text-xs text-fog">Berhasil</div>
						</div>
						{counts.skipped > 0 ? (
							<div>
								<div className="text-2xl font-semibold text-snow tabular-nums">
									{counts.skipped}
								</div>
								<div className="text-xs text-fog">Dilewati</div>
							</div>
						) : null}
						<div>
							<div className="text-2xl font-semibold text-snow tabular-nums">
								{counts.failed}
							</div>
							<div className="text-xs text-fog">Gagal</div>
						</div>
						{counts.queued > 0 ? (
							<div>
								<div className="text-2xl font-semibold text-snow tabular-nums">
									{counts.queued}
								</div>
								<div className="text-xs text-fog">Antre</div>
							</div>
						) : null}
					</div>
					{scope?.maxPages ? (
						<p className="mt-4 text-xs text-fog">
							{`Pencarian dibatasi hingga ${scope.maxPages} halaman.`}
						</p>
					) : null}
				</div>
			</header>

			<section className="min-w-0 rounded-xl border border-graphite bg-onyx p-4 sm:p-5">
				<h2 className="text-lg font-semibold text-snow">Visual Sitemap</h2>
				<div className="mt-3">
					<CrawlSitemapGraph
						pages={pages}
						selectedId={selected}
						onSelect={setSelected}
						onViewDetails={focusExplorer}
					/>
				</div>
			</section>

			<div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
				<section className="min-w-0">
					<h2 className="mb-3 text-lg font-semibold text-snow">
						Page Inventory
					</h2>
					<div className="mb-3 flex flex-col gap-2 sm:flex-row">
						<label className="relative min-w-0 flex-1">
							<span className="sr-only">Cari halaman</span>
							<Icon
								icon={Search01Icon}
								size={16}
								aria-hidden
								className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fog"
							/>
							<input
								type="search"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder="Cari halaman..."
								className="w-full rounded-lg border border-graphite bg-charcoal py-2 pl-9 pr-3 text-sm text-snow placeholder:text-fog focus-visible:ring-2 focus-visible:ring-indigo"
							/>
						</label>
						<ScrapeFilterSelect
							label="Filter status"
							hideLabel
							value={statusFilter}
							onChange={(value) =>
								setStatusFilter(value as Page["status"] | "all")
							}
							options={[
								{ value: "all", label: "Semua status" },
								{ value: "completed", label: "Berhasil" },
								{ value: "failed", label: "Gagal" },
								{ value: "skipped", label: "Dilewati" },
								{ value: "queued", label: "Antre" },
							]}
							className="sm:w-40"
						/>
					</div>
					{filtered.length === 0 ? (
						<p className="rounded-lg border border-graphite p-4 text-sm text-fog">
							{pages.length === 0
								? "Belum ada halaman yang berhasil diproses."
								: "Tidak ada halaman yang cocok dengan pencarian atau filter."}
						</p>
					) : (
						<ul
							className="divide-y divide-graphite rounded-lg border border-graphite"
							onKeyDown={(e) => {
								if (e.key === "ArrowDown") {
									e.preventDefault();
									moveSelection(1);
								}
								if (e.key === "ArrowUp") {
									e.preventDefault();
									moveSelection(-1);
								}
							}}
						>
							{filtered.map((row) => {
								const active = selected === row.id;
								return (
									<li key={row.id}>
										<button
											type="button"
											onClick={() => setSelected(row.id)}
											aria-pressed={active}
											aria-current={active ? true : undefined}
											title={`${row.title ?? row.url}\n${row.url}`}
											className={cn(
												"w-full p-3 text-left focus-visible:ring-2 focus-visible:ring-indigo",
												active ? "bg-charcoal" : "hover:bg-onyx",
											)}
										>
											<span className="flex items-center gap-1.5">
												<span
													aria-hidden
													className={cn(
														"text-xs font-semibold",
														row.status === "failed"
															? "text-crimson"
															: row.status === "skipped"
																? "text-fog"
																: "text-mist",
													)}
												>
													{statusMark(row.status)}
												</span>
												<span className="block truncate text-sm font-medium text-snow">
													{row.title ?? row.url}
												</span>
											</span>
											<span className="mt-1 block truncate break-all text-xs text-fog">
												{row.url}
											</span>
											<span className="mt-1 block text-xs text-fog">
												{statusText(row.status)}
												{row.httpStatus ? ` · HTTP ${row.httpStatus}` : ""}
												{` · depth ${row.depth}`}
											</span>
										</button>
									</li>
								);
							})}
						</ul>
					)}
				</section>

				<section
					ref={explorerRef}
					tabIndex={-1}
					aria-labelledby="crawl-page-explorer-title"
					className="min-w-0 rounded-lg border border-graphite p-5 focus-visible:ring-2 focus-visible:ring-indigo"
				>
					<h2
						id="crawl-page-explorer-title"
						className="text-lg font-semibold text-snow"
					>
						Page Explorer
					</h2>
					{page ? (
						<PageDetail page={page} />
					) : (
						<p className="mt-4 text-sm text-fog">
							Belum ada halaman yang berhasil diproses.
						</p>
					)}
				</section>
			</div>
		</section>
	);
}
