import type { scrapePages } from "@/db/schema";
import type {
	CrawlPageRelations,
	CrawlRelatedPage,
} from "@/features/scrape/utils/crawl-relations";

type Page = typeof scrapePages.$inferSelect;

/**
 * Summary of the page the user selected in the sitemap.
 *
 * It reports the relationships the crawl actually observed: the page that
 * discovered this one, how many pages it links to, and how many pages link
 * to it. The extra relationships are only listed after the user asks for
 * them, so the default view never turns into a wall of lines.
 */
export function CrawlSitemapSelection({
	page,
	relations,
	pageIdByUrl,
	showAdditional,
	onToggleAdditional,
	onSelect,
	onViewDetails,
}: {
	page: Page | null;
	relations: CrawlPageRelations | null;
	pageIdByUrl: Map<string, string>;
	showAdditional: boolean;
	onToggleAdditional: () => void;
	onSelect: (id: string) => void;
	onViewDetails?: () => void;
}) {
	if (!page || !relations) {
		return (
			<div className="rounded-xl border border-graphite bg-charcoal/40 px-3 py-3 text-sm text-fog sm:px-4">
				Pilih halaman di peta untuk melihat hubungannya.
			</div>
		);
	}

	const title = page.title?.trim() ? page.title.trim() : relations.label;

	return (
		<div className="rounded-xl border border-graphite bg-charcoal/40 p-3 sm:p-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0 flex-1">
					<p className="text-sm font-medium text-snow">
						Dipilih: <span className="text-mist">{title}</span>
					</p>
					<p className="mt-1 text-xs text-fog">
						{relations.foundFrom
							? `Ditemukan dari ${relations.foundFrom.label}`
							: "Halaman awal crawl"}
						{" · "}
						<span className="tabular-nums">
							{relations.outgoingCount} tautan keluar
						</span>
						{" · "}
						<span className="tabular-nums">
							{relations.incomingCount} tautan masuk
						</span>
					</p>
					<p className="mt-1 break-all text-xs text-fog" title={page.url}>
						{page.url}
					</p>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					{relations.additionalCount > 0 ? (
						<button
							type="button"
							onClick={onToggleAdditional}
							aria-expanded={showAdditional}
							className="inline-flex min-h-11 items-center rounded-lg border border-graphite px-3 text-sm text-snow transition-colors hover:bg-onyx focus-visible:ring-2 focus-visible:ring-indigo"
						>
							{showAdditional
								? "Sembunyikan tautan lainnya"
								: `Tampilkan tautan lainnya (${relations.additionalCount})`}
						</button>
					) : null}
					{onViewDetails ? (
						<button
							type="button"
							onClick={onViewDetails}
							className="inline-flex min-h-11 items-center rounded-lg border border-graphite px-3 text-sm text-snow transition-colors hover:bg-onyx focus-visible:ring-2 focus-visible:ring-indigo"
						>
							Lihat detail halaman
						</button>
					) : null}
				</div>
			</div>

			{showAdditional && relations.additionalCount > 0 ? (
				<div className="mt-3 grid gap-3 border-t border-graphite/60 pt-3 sm:grid-cols-2">
					<RelationList
						title="Tautan ke halaman lain"
						items={relations.additionalOutgoing}
						pageIdByUrl={pageIdByUrl}
						onSelect={onSelect}
					/>
					<RelationList
						title="Tautan menuju halaman ini"
						items={relations.additionalIncoming}
						pageIdByUrl={pageIdByUrl}
						onSelect={onSelect}
					/>
				</div>
			) : null}
		</div>
	);
}

function RelationList({
	title,
	items,
	pageIdByUrl,
	onSelect,
}: {
	title: string;
	items: CrawlRelatedPage[];
	pageIdByUrl: Map<string, string>;
	onSelect: (id: string) => void;
}) {
	if (items.length === 0) return null;
	return (
		<div className="min-w-0">
			<p className="text-xs font-medium text-mist">
				{title} ({items.length})
			</p>
			<ul className="mt-1.5 max-h-40 space-y-1 overflow-auto">
				{items.map((item) => {
					const id = pageIdByUrl.get(item.url);
					if (!id) return null;
					return (
						<li key={item.url}>
							<button
								type="button"
								onClick={() => onSelect(id)}
								title={item.title ?? item.url}
								className="flex min-h-11 w-full items-center truncate rounded-md px-1.5 text-left text-xs text-snow transition-colors hover:bg-onyx focus-visible:ring-2 focus-visible:ring-indigo"
							>
								{item.label}
							</button>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
