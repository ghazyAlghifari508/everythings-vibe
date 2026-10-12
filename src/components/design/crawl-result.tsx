import { Download, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { scrapePages } from "@/db/schema";
import { buildWebsiteBlueprint } from "@/lib/crawl-blueprint";
import { cn } from "@/lib/utils";
import { CrawlSitemapGraph } from "./crawl-sitemap-graph";

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

function statusMark(status: Page["status"]): string {
	if (status === "completed") return "✓";
	if (status === "failed") return "!";
	if (status === "skipped") return "⊘";
	return "○";
}

function statusText(status: Page["status"]): string {
	if (status === "completed") return "Berhasil";
	if (status === "failed") return "Gagal";
	if (status === "skipped") return "Dilewati";
	return "Antre";
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
	useEffect(() => {
		setSelected((current) => resolveSelectedPageId(pages, current));
	}, [pages]);
	const page = pages.find((row) => row.id === selected);

	const counts = useMemo(() => {
		return {
			discovered: pages.length,
			completed: pages.filter((row) => row.status === "completed").length,
			skipped: pages.filter((row) => row.status === "skipped").length,
			failed: pages.filter((row) => row.status === "failed").length,
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

	const siteDomain = domain ?? safeDomain(sourceUrl);

	return (
		<section className="space-y-6">
			<header className="space-y-4">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div className="min-w-0">
						<p className="text-xs text-fog">← Kembali ke hasil scrape</p>
						<h1 className="mt-1 text-2xl font-semibold text-snow">
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
						<Download size={16} aria-hidden />
						Download .md
					</button>
				</div>
				<div className="rounded-xl border border-graphite bg-onyx p-4">
					<p className="text-sm font-medium text-snow">{siteDomain}</p>
					<p className="mt-2 text-xs text-fog tabular-nums">
						{counts.discovered} ditemukan · {counts.completed} berhasil ·{" "}
						{counts.skipped} dilewati · {counts.failed} gagal
					</p>
					<p className="mt-1 text-xs text-fog">
						{scope
							? `Cakupan: max ${scope.maxPages} pages · depth ${scope.maxDepth}`
							: "Cakupan: berdasarkan hasil tersimpan"}
					</p>
					<p className="mt-2 text-xs leading-5 text-fog">
						Jumlah ditemukan adalah halaman yang teramati dalam batas crawl,
						bukan jumlah seluruh halaman website. robots.txt dihormati. Crawler
						membaca HTML statis tanpa eksekusi JavaScript.
					</p>
				</div>
			</header>

			<section className="min-w-0 rounded-xl border border-graphite bg-onyx p-4 sm:p-5">
				<h2 className="text-lg font-semibold text-snow">Visual Sitemap</h2>
				<div className="mt-3">
					<CrawlSitemapGraph
						pages={pages}
						selectedId={selected}
						onSelect={setSelected}
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
							<Search
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
						<label className="sm:w-40">
							<span className="sr-only">Filter status</span>
							<select
								value={statusFilter}
								onChange={(e) =>
									setStatusFilter(e.target.value as Page["status"] | "all")
								}
								className="w-full rounded-lg border border-graphite bg-charcoal px-3 py-2 text-sm text-snow focus-visible:ring-2 focus-visible:ring-indigo"
							>
								<option value="all">Semua status</option>
								<option value="completed">Berhasil</option>
								<option value="failed">Gagal</option>
								<option value="skipped">Dilewati</option>
								<option value="queued">Antre</option>
							</select>
						</label>
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

				<section className="min-w-0 rounded-lg border border-graphite p-5">
					<h2 className="text-lg font-semibold text-snow">Page Explorer</h2>
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

function safeDomain(sourceUrl: string): string {
	try {
		return new URL(sourceUrl).hostname.toLowerCase();
	} catch {
		return sourceUrl;
	}
}

function PageDetail({ page }: { page: Page }) {
	const content = page.content;
	const headingLevels =
		content?.headingLevels ??
		content?.headings.map((text) => ({ level: null as number | null, text })) ??
		[];
	const sections = content?.sections ?? [];
	const internalLinks = content?.internalLinks ?? [];
	const externalLinks = content?.externalLinks ?? [];
	const showSplit = Boolean(
		content && (content.internalLinks || content.externalLinks),
	);

	return (
		<div className="min-w-0">
			<div className="mt-4 flex flex-wrap items-center gap-2">
				<span
					className={cn(
						"inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs",
						page.status === "completed"
							? "border-graphite text-mist"
							: page.status === "failed"
								? "border-crimson text-crimson"
								: "border-graphite text-fog",
					)}
				>
					<span aria-hidden>{statusMark(page.status)}</span>
					{page.status === "completed"
						? "Completed"
						: page.status === "failed"
							? "Failed"
							: page.status === "skipped"
								? "Skipped"
								: "Queued"}
				</span>
				{page.httpStatus ? (
					<span className="text-xs text-fog tabular-nums">
						HTTP {page.httpStatus}
					</span>
				) : null}
			</div>
			<h3 className="mt-3 break-words text-xl font-semibold text-snow">
				{page.title ?? "Halaman"}
			</h3>
			<p className="mt-2 break-all text-xs text-fog">{page.url}</p>

			{page.status === "queued" ? (
				<p className="mt-4 rounded-lg border border-graphite p-3 text-sm text-fog">
					Halaman ditemukan sebagai tautan tetapi belum dikunjungi dalam batas
					crawl.
				</p>
			) : null}
			{page.status === "skipped" ? (
				<p className="mt-4 rounded-lg border border-graphite p-3 text-sm text-fog">
					Halaman dilewati{page.error ? `: ${page.error}` : "."} Tidak ada
					konten yang diambil.
				</p>
			) : null}
			{page.status === "failed" && page.error ? (
				<p role="alert" className="mt-4 text-sm text-fog">
					{page.error}
				</p>
			) : null}

			{content ? (
				<>
					<section className="mt-5">
						<h4 className="text-sm font-semibold text-snow">Overview</h4>
						<p className="mt-2 text-sm leading-6 text-fog">
							{content.description ?? "Deskripsi tidak tersedia."}
						</p>
					</section>

					<section className="mt-5">
						<h4 className="text-sm font-semibold text-snow">Headings</h4>
						{headingLevels.length === 0 ? (
							<p className="mt-2 text-sm text-fog">
								Tidak ada heading teramati.
							</p>
						) : (
							<ul className="mt-2 space-y-1.5">
								{headingLevels.map((heading) => (
									<li
										key={`${heading.level}-${heading.text}`}
										className="flex gap-2 text-sm"
									>
										<span className="w-8 shrink-0 text-xs text-fog tabular-nums">
											{typeof heading.level === "number"
												? `H${heading.level}`
												: "H?"}
										</span>
										<span className="min-w-0 break-words text-snow">
											{heading.text}
										</span>
									</li>
								))}
							</ul>
						)}
					</section>

					<section className="mt-5">
						<h4 className="text-sm font-semibold text-snow">Content</h4>
						{sections.length > 0 ? (
							<div className="mt-2 space-y-2">
								{sections.map((section, position) => (
									<details
										key={`${section.title}-${section.text.slice(0, 48)}`}
										open={position === 0}
										className="rounded-lg border border-graphite"
									>
										<summary className="cursor-pointer px-3 py-2 text-sm text-snow focus-visible:ring-2 focus-visible:ring-indigo">
											{section.title ?? "(Tanpa judul)"}
										</summary>
										<div className="max-h-[300px] overflow-auto whitespace-pre-wrap px-3 pb-3 text-sm leading-6 text-snow">
											{section.text}
										</div>
									</details>
								))}
							</div>
						) : (
							<div className="mt-2 max-h-[600px] overflow-auto whitespace-pre-wrap text-sm leading-7 text-snow">
								{content.text}
							</div>
						)}
					</section>

					<section className="mt-5">
						<h4 className="text-sm font-semibold text-snow">Links</h4>
						{showSplit ? (
							<div className="mt-2 space-y-2">
								<details className="rounded-lg border border-graphite">
									<summary className="cursor-pointer px-3 py-2 text-sm text-snow">
										Internal ({internalLinks.length})
									</summary>
									<LinkList links={internalLinks} />
								</details>
								<details className="rounded-lg border border-graphite">
									<summary className="cursor-pointer px-3 py-2 text-sm text-snow">
										External ({externalLinks.length})
									</summary>
									<LinkList links={externalLinks} />
								</details>
							</div>
						) : content.links.length > 0 ? (
							<details className="mt-2 rounded-lg border border-graphite">
								<summary className="cursor-pointer px-3 py-2 text-sm text-snow">
									Links ({content.links.length})
								</summary>
								<LinkList links={content.links} />
							</details>
						) : (
							<p className="mt-2 text-sm text-fog">
								Tidak ada tautan teramati.
							</p>
						)}
					</section>

					<section className="mt-5">
						<h4 className="text-sm font-semibold text-snow">
							Images ({content.images.length})
						</h4>
						{content.images.length === 0 ? (
							<p className="mt-2 text-sm text-fog">
								Tidak ada gambar teramati.
							</p>
						) : (
							<details className="mt-2 rounded-lg border border-graphite">
								<summary className="cursor-pointer px-3 py-2 text-sm text-snow">
									Lihat daftar gambar
								</summary>
								<ul className="space-y-2 px-3 pb-3">
									{content.images.slice(0, 20).map((image) => (
										<li key={image} className="break-all text-xs text-fog">
											{image}
										</li>
									))}
									{content.images.length > 20 ? (
										<li className="text-xs text-fog">
											+{content.images.length - 20} lainnya
										</li>
									) : null}
								</ul>
							</details>
						)}
					</section>

					<section className="mt-5">
						<h4 className="text-sm font-semibold text-snow">UI Elements</h4>
						<p className="mt-2 text-sm text-fog">
							{content.patterns.length > 0
								? content.patterns.join(" · ")
								: "Tidak ada pola teramati."}{" "}
							Elemen teramati, bukan klaim fungsionalitas produk.
						</p>
					</section>
				</>
			) : null}
		</div>
	);
}

function LinkList({ links }: { links: string[] }) {
	if (links.length === 0)
		return <p className="px-3 pb-3 text-sm text-fog">Tidak ada.</p>;
	return (
		<ul className="space-y-2 px-3 pb-3">
			{links.slice(0, 20).map((link) => (
				<li key={link}>
					<a
						href={link}
						target="_blank"
						rel="noreferrer"
						className="break-all text-xs text-fog underline"
					>
						{link}
					</a>
				</li>
			))}
			{links.length > 20 ? (
				<li className="text-xs text-fog">+{links.length - 20} lainnya</li>
			) : null}
		</ul>
	);
}
